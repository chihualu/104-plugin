/**
 * 104:8443 專用的 HTTP/1.1 client，跑在 Cloudflare Workers 的 connect() TCP socket 上。
 *
 * 為什麼不用 fetch()：Workers 的 fetch() 有 bug（workerd #5998），會把 :8443 靜默
 * 當成 :443，付費也修不掉。唯一繞法是 connect() 原生 socket + 手寫 HTTP/1.1。
 * 這份是 cf-poc/ 驗證過的 PoC 產品化版本。
 *
 * 關鍵陷阱（已處理）：server 用 Connection: close 收尾時，workerd 的 reader.read()
 * 會丟「Network connection lost」而非乾淨 done。必須 try/catch 吞掉、保留已讀 bytes。
 */

import { connect } from 'cloudflare:sockets';

const CRLF = [0x0d, 0x0a];
const CRLFCRLF = [0x0d, 0x0a, 0x0d, 0x0a];

export interface Http104Response {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  setCookies: string[];
  body: string;
}

export interface Http104Request {
  method: string;
  host: string;
  port: number;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  /** 整體逾時（ms），預設 20000。 */
  timeoutMs?: number;
  /** 連線建立逾時（ms），預設 8000。逾時視為可重試的連線失敗，讓重試快速進行。 */
  connectTimeoutMs?: number;
  /** 總嘗試次數（含首次），預設 3。只在「連線建立階段」失敗時重試（此時尚未送出，安全）。 */
  retries?: number;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfSeq(buf: Uint8Array, seq: number[], from = 0): number {
  outer: for (let i = from; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** 解 Transfer-Encoding: chunked。 */
function dechunk(body: Uint8Array): Uint8Array<ArrayBuffer> {
  const dec = new TextDecoder('latin1');
  let result: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let pos = 0;
  while (pos < body.length) {
    const lineEnd = indexOfSeq(body, CRLF, pos);
    if (lineEnd === -1) break;
    const sizeStr = dec.decode(body.slice(pos, lineEnd)).trim();
    const size = parseInt(sizeStr.split(';')[0], 16);
    if (isNaN(size) || size === 0) break;
    const dataStart = lineEnd + 2;
    result = concat(result, body.slice(dataStart, dataStart + size));
    pos = dataStart + size + 2;
  }
  return result;
}

function markRetryable(e: unknown): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  (err as any).retryable = true;
  return err;
}

/** Promise 加逾時保護。 */
function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const to = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, to]).finally(() => {
    if (t) clearTimeout(t);
  }) as Promise<T>;
}

async function doRequest(opts: Http104Request): Promise<Http104Response> {
  const enc = new TextEncoder();
  const socket = connect(
    { hostname: opts.host, port: opts.port },
    { secureTransport: 'on', allowHalfOpen: false },
  );

  // 連線建立階段：失敗/逾時 → 標記可重試（此時還沒送出任何 bytes，重試不會重複打卡）。
  try {
    await raceTimeout(socket.opened, opts.connectTimeoutMs ?? 8000, 'socket connect timeout');
  } catch (e) {
    try { await socket.close(); } catch { /* ignore */ }
    throw markRetryable(e);
  }

  try {
    const bodyBytes = opts.body != null ? enc.encode(opts.body) : new Uint8Array(0);
    const headers: Record<string, string> = {
      Host: opts.host,
      Connection: 'close',
      'Accept-Encoding': 'identity',
      ...(opts.headers || {}),
    };
    if (opts.body != null) headers['Content-Length'] = String(bodyBytes.length);

    let reqText = `${opts.method} ${opts.path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) reqText += `${k}: ${v}\r\n`;
    reqText += '\r\n';

    const writer = socket.writable.getWriter();
    await writer.write(concat(enc.encode(reqText), bodyBytes));

    const reader = socket.readable.getReader();
    let buffer = new Uint8Array(0);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) buffer = concat(buffer, value);
      }
    } catch (re) {
      // Connection: close 收尾的正常情形：已有資料就吞掉，沒資料才視為真失敗。
      if (buffer.length === 0) {
        throw new Error(`socket read failed before any data: ${re instanceof Error ? re.message : String(re)}`);
      }
    }

    const headerEnd = indexOfSeq(buffer, CRLFCRLF);
    if (headerEnd === -1) throw new Error('malformed HTTP response: no header terminator');

    const headerText = new TextDecoder('latin1').decode(buffer.slice(0, headerEnd));
    const lines = headerText.split('\r\n');
    const m = lines[0].match(/^HTTP\/\d\.\d\s+(\d+)\s*(.*)$/);
    const status = m ? parseInt(m[1], 10) : 0;
    const statusText = m ? m[2] : '';

    const respHeaders: Record<string, string> = {};
    const setCookies: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const idx = lines[i].indexOf(':');
      if (idx === -1) continue;
      const k = lines[i].slice(0, idx).trim();
      const v = lines[i].slice(idx + 1).trim();
      if (k.toLowerCase() === 'set-cookie') setCookies.push(v);
      else respHeaders[k.toLowerCase()] = v;
    }

    let raw = buffer.slice(headerEnd + 4);
    if ((respHeaders['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
      raw = dechunk(raw);
    } else if (respHeaders['content-length']) {
      const n = parseInt(respHeaders['content-length'], 10);
      if (!isNaN(n)) raw = raw.slice(0, n);
    }

    return {
      status,
      statusText,
      headers: respHeaders,
      setCookies,
      body: new TextDecoder('utf-8').decode(raw),
    };
  } finally {
    try { await socket.close(); } catch { /* ignore */ }
  }
}

/**
 * 發一個 HTTP/1.1 請求（含逾時 + 連線失敗重試）。
 * 只在「連線建立階段」失敗時重試——那代表尚未送出任何資料，重試安全、不會重複打卡。
 * 連線成功後的 write/read 失敗一律不重試，避免重複送出。
 */
export async function http104(opts: Http104Request): Promise<Http104Response> {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const attempts = Math.max(1, opts.retries ?? 3);
  let lastErr: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await raceTimeout(doRequest(opts), timeoutMs, `104 request timeout after ${timeoutMs}ms`);
    } catch (e) {
      lastErr = e;
      const retryable = !!(e as any)?.retryable;
      if (!retryable || i === attempts) break;
      // backoff + 抖動：避開尖峰時大量 alarm 同時重試造成的二次壅塞。
      const wait = 300 * i + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
