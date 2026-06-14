/**
 * Cloudflare Worker PoC — 驗證 connect() TCP socket 能否打 104:8443
 *
 * 背景：Cloudflare 的 fetch() 有個已知 bug（GitHub #5998），會把 :8443 當成 :443，
 * 連付費方案都修不掉。唯一的繞法是用 Workers 的 connect() 原生 TCP socket，
 * 自己手寫 HTTP/1.1。這個 PoC 就是要證明這條路走得通。
 *
 * 驗證目標：
 *   1. connect() + 手寫 HTTP/1.1 能不能拿到 104 的回應（狀態列、headers、body）
 *   2. Set-Cookie 能不能正確抓到
 *   3. 下一個請求帶上 Cookie 能不能被 104 接受（session 串得起來）
 *
 * 用法（wrangler dev 後）：
 *   GET /            連線層測試（不需帳密）：對 asmx base 做 GET，驗證 socket + HTTP 解析
 *   GET /?mode=login&groupUBINo=..&companyID=..&account=..&credential=..
 *                    真實登入測試：POST /Login，回報 Set-Cookie 與 cookie 串接結果
 */

import { connect } from 'cloudflare:sockets';

const HOST = 'pro104.provision.com.tw';
const PORT = 8443;
const ASMX_BASE = '/wfmobileweb/Service/eHRFlowMobileService.asmx';
const LOGIN_PATH = `${ASMX_BASE}/Login`;

const CRLF = [0x0d, 0x0a];
const CRLFCRLF = [0x0d, 0x0a, 0x0d, 0x0a];

interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  setCookies: string[];
  body: string;
  bodyBytes: number;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** 在 buf 中從 from 起找 seq 的起始 index，找不到回 -1。 */
function indexOfSeq(buf: Uint8Array, seq: number[], from = 0): number {
  outer: for (let i = from; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** 解 Transfer-Encoding: chunked 的 body。 */
function dechunk(body: Uint8Array): Uint8Array {
  const dec = new TextDecoder('latin1');
  let result = new Uint8Array(0);
  let pos = 0;
  while (pos < body.length) {
    const lineEnd = indexOfSeq(body, CRLF, pos);
    if (lineEnd === -1) break;
    const sizeStr = dec.decode(body.slice(pos, lineEnd)).trim();
    const size = parseInt(sizeStr.split(';')[0], 16);
    if (isNaN(size) || size === 0) break;
    const dataStart = lineEnd + 2;
    result = concat(result, body.slice(dataStart, dataStart + size));
    pos = dataStart + size + 2; // 跳過資料 + 結尾 CRLF
  }
  return result;
}

/**
 * 用 connect() 開一個 TLS socket，手寫一個 HTTP/1.1 請求並完整讀回回應。
 * 我們一律帶 Connection: close，所以可以直接把整條 stream 讀到底再解析。
 */
async function httpRequest(opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  host?: string; // 預設 104；cookietest 模式可覆寫
  port?: number;
}): Promise<HttpResponse> {
  const enc = new TextEncoder();
  const host = opts.host || HOST;
  const port = opts.port || PORT;

  const socket = connect(
    { hostname: host, port },
    { secureTransport: 'on', allowHalfOpen: false },
  );
  await socket.opened; // 等 TLS handshake 完成

  try {
    const bodyBytes = opts.body != null ? enc.encode(opts.body) : new Uint8Array(0);
    const headers: Record<string, string> = {
      Host: host,
      Connection: 'close',
      'Accept-Encoding': 'identity', // 不要 gzip，省掉解壓
      'User-Agent': 'cf-poc-104/1.0',
      ...(opts.headers || {}),
    };
    if (opts.body != null) headers['Content-Length'] = String(bodyBytes.length);

    let reqText = `${opts.method} ${opts.path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) reqText += `${k}: ${v}\r\n`;
    reqText += '\r\n';

    const writer = socket.writable.getWriter();
    await writer.write(concat(enc.encode(reqText), bodyBytes));

    // Connection: close → 一路讀到 server 關連線。
    // workerd 在 server 關連線時，read() 可能丟「Network connection lost」而非乾淨地
    // done:true。所以容忍例外：只要已經讀到 bytes，就把它當作串流結束。
    const reader = socket.readable.getReader();
    let buffer = new Uint8Array(0);
    let reads = 0;
    let readError: string | null = null;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer = concat(buffer, value);
          reads++;
        }
      }
    } catch (re) {
      readError = re instanceof Error ? re.message : String(re);
      if (buffer.length === 0) {
        // 一個 byte 都沒讀到就斷 → 真的是連線/TLS 問題，往外丟並附上診斷。
        throw new Error(`讀取失敗且未收到任何資料：${readError}（reads=${reads}）`);
      }
      // 已有資料 → 多半是 Connection: close 的正常收尾，吞掉繼續解析。
    }

    // 切 header / body
    const headerEnd = indexOfSeq(buffer, CRLFCRLF);
    if (headerEnd === -1) {
      throw new Error(
        `回應沒有完整 header（找不到 CRLFCRLF）。已讀 ${buffer.length} bytes, reads=${reads}` +
        (readError ? `, readError=${readError}` : ''),
      );
    }

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
    const body = new TextDecoder('utf-8').decode(raw);

    return { status, statusText, headers: respHeaders, setCookies, body, bodyBytes: raw.length };
  } finally {
    try { await socket.close(); } catch { /* ignore */ }
  }
}

/** 把多個 Set-Cookie 收斂成一個 Cookie request header（取每個 cookie 的 name=value）。 */
function cookieHeaderFrom(setCookies: string[]): string {
  return setCookies.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 從 104 的 XML-wrapped 回應抽 <Tag>...</Tag>（取第一個）。 */
function xmlTag(body: string, tag: string): string | null {
  const m = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? xmlUnescape(m[1]) : null;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'conn';
    const out: Record<string, unknown> = { mode, target: `${HOST}:${PORT}` };

    try {
      if (mode === 'login') {
        // ---- 真實登入測試 ----
        const form = new URLSearchParams({
          groupUBINo: url.searchParams.get('groupUBINo') || '',
          companyID: url.searchParams.get('companyID') || '',
          account: url.searchParams.get('account') || '',
          credential: url.searchParams.get('credential') || '',
        }).toString();

        const r1 = await httpRequest({
          method: 'POST',
          path: LOGIN_PATH,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
        });

        const cookie = cookieHeaderFrom(r1.setCookies);
        out.step1_login = {
          status: r1.status,
          statusText: r1.statusText,
          setCookies: r1.setCookies,
          cookieHeaderForNext: cookie,
          bodyBytes: r1.bodyBytes,
          bodySnippet: r1.body.slice(0, 1200),
        };

        // ---- 第二個請求帶 Cookie（驗證 cookie 串接管線）----
        const r2 = await httpRequest({
          method: 'GET',
          path: ASMX_BASE,
          headers: cookie ? { Cookie: cookie } : {},
        });
        out.step2_withCookie = {
          sentCookie: cookie,
          status: r2.status,
          statusText: r2.statusText,
          bodyBytes: r2.bodyBytes,
        };

        // ---- step3：用登入拿到的 key token 打一個需要登入的真實 API，證明整條 pipeline ----
        // 為保護隱私只回報成敗與筆數，不 dump 實際資料。
        const isSuccess = (xmlTag(r1.body, 'IsSuccess') || '').trim() === 'true';
        const token = xmlTag(r1.body, 'ReturnObject');
        if (isSuccess && token) {
          const authForm = new URLSearchParams({
            key: token,
            groupUBINo: url.searchParams.get('groupUBINo') || '',
            companyID: url.searchParams.get('companyID') || '',
            account: url.searchParams.get('account') || '',
            language: 'zh-tw',
          }).toString();
          const r3 = await httpRequest({
            method: 'POST',
            path: `${ASMX_BASE}/GetRequestListByWorksheet`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: authForm,
          });
          const authOk = (xmlTag(r3.body, 'IsSuccess') || '').trim() === 'true';
          const ro = xmlTag(r3.body, 'ReturnObject') || '';
          let rowCount: number | null = null;
          try { rowCount = JSON.parse(ro).Tables?.[0]?.Rows?.length ?? null; } catch { /* ignore */ }
          out.step3_authenticatedCall = {
            api: 'GetRequestListByWorksheet',
            httpStatus: r3.status,
            tokenUsed: `${token.length} chars`, // 不外洩 token 內容
            apiIsSuccess: authOk,
            worksheetRowCount: rowCount,
            returnObjectBytes: ro.length,
          };
        } else {
          out.step3_authenticatedCall = { skipped: '登入未成功，略過' };
        }
      } else if (mode === 'cookietest') {
        // ---- Set-Cookie 抓取 + Cookie 串接的純機制驗證（不依賴 104）----
        // 用同一套 connect() 程式碼打一個一定會發 Set-Cookie 的公開端點，
        // 證明：抓得到 Set-Cookie → 收斂成 Cookie header → 下一個請求帶回去後
        // 該端點確實看到了我們送的 cookie。
        const CB_HOST = 'httpbingo.org';
        const r1 = await httpRequest({
          method: 'GET',
          path: '/cookies/set?poc_session=abc123&poc_uid=42',
          host: CB_HOST,
          port: 443,
        });
        const cookie = cookieHeaderFrom(r1.setCookies);
        const r2 = await httpRequest({
          method: 'GET',
          path: '/cookies',
          host: CB_HOST,
          port: 443,
          headers: cookie ? { Cookie: cookie } : {},
        });
        out.step1_setCookie = {
          status: r1.status,
          setCookies: r1.setCookies,
          derivedCookieHeader: cookie,
        };
        out.step2_echo = {
          sentCookie: cookie,
          status: r2.status,
          // httpbingo /cookies 會把它收到的 cookie 原封不動 echo 回 JSON body
          serverSawOurCookie: r2.body.includes('poc_session') && r2.body.includes('abc123'),
          bodySnippet: r2.body.slice(0, 400),
        };
      } else {
        // ---- 連線層測試（不需帳密）----
        const r = await httpRequest({ method: 'GET', path: ASMX_BASE });
        out.connTest = {
          status: r.status,
          statusText: r.statusText,
          headers: r.headers,
          setCookies: r.setCookies,
          bodyBytes: r.bodyBytes,
          bodySnippet: r.body.slice(0, 800),
        };
      }

      out.ok = true;
      return new Response(JSON.stringify(out, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    } catch (e) {
      out.ok = false;
      out.error = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
      return new Response(JSON.stringify(out, null, 2), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  },
};
