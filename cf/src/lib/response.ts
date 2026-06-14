/**
 * NDJSON 串流回應（取代 Express 的 res.write 逐行輸出）。
 * 原 /api/check-in、/api/audit/approve 會逐筆 res.write 一個 JSON 物件 + '\n'，
 * 這裡用 ReadableStream + controller.enqueue（同步）保證順序與 backpressure 正確。
 */
export function ndjson(run: (write: (obj: unknown) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + '\n'));
      try {
        await run(write);
      } catch (e: any) {
        try {
          write({ type: 'error', message: e?.message || String(e) });
        } catch { /* stream already closed */ }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
