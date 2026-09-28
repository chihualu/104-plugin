import { authHeader } from './auth';

export interface StreamEvent {
  type: string;
  [key: string]: any;
}

interface Options {
  /** 送出後多久內要收到回應標頭（伺服器通過權限檢查就會立刻回）。 */
  connectTimeoutMs?: number;
  /** 串流中兩筆資料之間最長可以隔多久（單筆 104 呼叫含重試最壞約一分多鐘）。 */
  idleTimeoutMs?: number;
}

/**
 * POST 一個 NDJSON 串流端點（/api/check-in、/api/audit/approve），每收到一行就呼叫 onEvent。
 *
 * 以下情況一律 throw，呼叫端只要一個 catch 就能關掉進度框，不會再卡在 0/N：
 * - 非 2xx（429 限流、401 JWT 過期、403 無權代理…）
 * - 伺服器送出 {type:'error'}
 * - 連線/串流逾時
 * - 串流結束卻沒收到 {type:'done'}（Tunnel 中途斷線）
 */
export async function postNdjson(
  url: string,
  body: unknown,
  onEvent: (data: StreamEvent) => void,
  { connectTimeoutMs = 30_000, idleTimeoutMs = 120_000 }: Options = {},
): Promise<void> {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), connectTimeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new Error(ctrl.signal.aborted ? '伺服器沒有回應，請稍後再試' : '網路連線失敗，請確認網路後再試');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = '';
    try { message = (await res.json()).message; } catch { /* 非 JSON（例如 Cloudflare 的 5xx 頁面） */ }
    throw new Error(message || `請求失敗（HTTP ${res.status}）`);
  }
  if (!res.body) throw new Error('瀏覽器不支援串流回應');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let gotDone = false;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let data: StreamEvent;
    try {
      data = JSON.parse(line);
    } catch {
      console.error('Bad NDJSON line', line);
      return;
    }
    // 刻意在 JSON.parse 的 try 之外 throw，錯誤才不會被吞掉。
    if (data.type === 'error') throw new Error(data.message || '伺服器處理失敗');
    if (data.type === 'done') gotDone = true;
    onEvent(data);
  };

  while (true) {
    // abort 會讓進行中的 reader.read() reject，藉此中止卡住的串流。
    timer = setTimeout(() => ctrl.abort(), idleTimeoutMs);
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new Error(ctrl.signal.aborted
        ? '伺服器太久沒有回應，請重新整理確認結果'
        : '連線中斷，請重新整理確認結果');
    } finally {
      clearTimeout(timer);
    }
    if (chunk.done) break;

    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(handleLine);
  }
  handleLine(buffer + decoder.decode());

  if (!gotDone) throw new Error('連線中斷，部分項目可能已處理，請重新整理確認結果');
}
