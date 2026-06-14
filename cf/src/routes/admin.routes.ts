import { Hono } from 'hono';
import type { AppEnv } from '../types';
import * as db from '../lib/db';
import { scheduleTask } from '../scheduler/schedule-do';
import { logger } from '../lib/logger';

/**
 * 運維用一次性端點，用 ADMIN_SECRET（X-Admin-Secret header）保護；未設則停用（403）。
 * 註冊在 jwtAuth 之前，所以不需要 JWT，但有獨立的 secret 閘門。
 */
export function registerAdminRoutes(app: Hono<AppEnv>) {
  // 資料從 Postgres 匯入 D1 後呼叫一次：把所有「未來的 PENDING」任務重新登記 DO alarm。
  // 舊系統的計時器在 Go 記憶體裡，匯入 D1 後只有資料列、沒有 alarm，不補登就不會觸發。
  app.post('/api/admin/backfill-alarms', async (c) => {
    const secret = c.env.ADMIN_SECRET;
    if (!secret) return c.json({ success: false, message: 'admin disabled (ADMIN_SECRET unset)' }, 403);
    if (c.req.header('X-Admin-Secret') !== secret) {
      return c.json({ success: false, message: 'forbidden' }, 403);
    }

    const tasks = await db.findFuturePendingTasks(c.env.DB);
    let registered = 0;
    let failed = 0;
    for (const t of tasks) {
      try {
        await scheduleTask(c.env, t.id, t.scheduledAt);
        registered++;
      } catch (e) {
        failed++;
        logger.error({ msg: 'backfill scheduleTask failed', taskId: t.id, error: String(e) });
      }
    }
    logger.info({ msg: 'backfill-alarms done', total: tasks.length, registered, failed });
    return c.json({ success: true, total: tasks.length, registered, failed });
  });
}
