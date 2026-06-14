import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { HRService } from '../services/hr.service';
import { logger } from '../lib/logger';

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
    try {
      await HRService.executeScheduledTask(this.env, taskId);
    } catch (e) {
      // executeScheduledTask 內部已把任務狀態標 FAILED（含 403 自動解綁）。
      // 這裡只記錄、不重拋，避免 DO alarm 自動重試又重複執行。
      logger.error({ msg: 'DO alarm execute failed', taskId, error: String(e) });
    } finally {
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
