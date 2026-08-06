import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { HRService } from '../services/hr.service';
import { isRetryable } from '../lib/http104';
import { logger } from '../lib/logger';

/** 連線失敗最多重排 alarm 幾次。 */
const MAX_RETRIES = 5;

/**
 * 第 attempt 次重試（0 起算）要等多久；回傳 null 代表額度用盡、該判終局失敗。
 *
 * 為什麼需要這個：實測 171 筆失敗的排程打卡裡有 168 筆是「連不上 104:8443」
 * （socket connect timeout / proxy request failed），且高度集中在台北 08:00 與 17–18:00
 * 的上下班尖峰。http104 內建的 3 次重試全擠在 ~26 秒內，尖峰塞車時三次一起失敗，
 * 任務就被永久標成 FAILED——這才是「預約打卡沒完成」的真正原因。
 *
 * 節奏：30s → 60s → 之後三次都是「約 60 秒的隨機值」（30–90s）。
 * 後段用隨機而非固定間隔，是因為尖峰時大量任務會在同一波一起失敗；固定間隔會讓它們
 * 永遠同步、每次都在同一秒一起重打 104，等於把壅塞原封不動複製到每一輪。隨機化把它們
 * 打散，順便讓實際打卡時間看起來更自然。
 *
 * 總重試視野約 3.5–6 分鐘——夠吃掉尖峰的短暫塞車，又不會把上班卡拖到變成遲到。
 */
function retryDelayMs(attempt: number): number | null {
  if (attempt >= MAX_RETRIES) return null;
  if (attempt === 0) return 30_000;
  if (attempt === 1) return 60_000;
  return 30_000 + Math.floor(Math.random() * 60_000); // ~60s ±50%
}

/**
 * 取代 Go 的 in-memory time.AfterFunc 計時器。
 *
 * 每個排程任務對應一個 DO 實例（以 task:{id} 命名），用持久化 alarm 在 scheduledAt
 * 觸發，秒級精度。相較 Go 版的好處：
 *   - alarm 由 Cloudflare 持久保存，不吃記憶體 → 不再需要「只載入當月」「每月 1 號重載」
 *     那套機制（Go 是因為 timer 在記憶體才需要）。未來月份的任務一樣可靠。
 *   - 執行邏輯（executeScheduledTask）在同一程序內直接呼叫，不需 HTTP 回呼、不需
 *     INTERNAL_API_SECRET 跨程序保護。
 */
export class ScheduleAlarmDO extends DurableObject<Env> {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/set') {
      const { taskId, scheduledAt } = await req.json<{ taskId: number; scheduledAt: string }>();
      await this.ctx.storage.put('taskId', taskId);
      await this.ctx.storage.delete('attempt'); // 重新登記 → 重試次數歸零
      await this.ctx.storage.setAlarm(new Date(scheduledAt).getTime());
      return new Response('ok');
    }
    if (url.pathname === '/cancel') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const taskId = await this.ctx.storage.get<number>('taskId');
    if (taskId == null) return;

    const attempt = (await this.ctx.storage.get<number>('attempt')) ?? 0;
    const delayMs = retryDelayMs(attempt);
    const canRetry = delayMs !== null;

    try {
      await HRService.executeScheduledTask(this.env, taskId, { deferFailure: canRetry });
      await this.ctx.storage.deleteAll();
    } catch (e) {
      // deferFailure 成立時，只有「連線階段就失敗」會被原樣拋回來——那代表一個 byte 都
      // 還沒送出，重打不會變成兩筆打卡，所以只有這種錯誤才排重試。其餘錯誤
      // executeScheduledTask 已經標 FAILED 並推播通知了。
      if (canRetry && isRetryable(e)) {
        await this.ctx.storage.put('attempt', attempt + 1);
        await this.ctx.storage.setAlarm(Date.now() + delayMs);
        logger.warn({ msg: 'DO alarm retry scheduled', taskId, attempt: attempt + 1, delayMs, error: String(e) });
        return; // 保留 storage，等下一次 alarm
      }
      // 終局失敗。不重拋，避免平台自動重投 alarm 造成重複打卡。
      logger.error({ msg: 'DO alarm execute failed (final)', taskId, attempts: attempt + 1, error: String(e) });
      await this.ctx.storage.deleteAll();
    }
  }
}

/** 由路由呼叫：登記/更新一個任務的 alarm。 */
export async function scheduleTask(env: Env, taskId: number, scheduledAt: string): Promise<void> {
  const stub = env.SCHEDULE_DO.get(env.SCHEDULE_DO.idFromName(`task:${taskId}`));
  await stub.fetch('https://do/set', { method: 'POST', body: JSON.stringify({ taskId, scheduledAt }) });
}

/** 由路由呼叫：取消一個任務的 alarm。 */
export async function cancelScheduledTask(env: Env, taskId: number): Promise<void> {
  const stub = env.SCHEDULE_DO.get(env.SCHEDULE_DO.idFromName(`task:${taskId}`));
  await stub.fetch('https://do/cancel', { method: 'POST' });
}
