import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { HRService } from '../services/hr.service';
import { CompanyService } from '../services/company.service';
import { DelegationService } from '../services/delegation.service';
import { scheduleTask, cancelScheduledTask } from '../scheduler/schedule-do';
import * as db from '../lib/db';
import { ndjson } from '../lib/response';
import { logger } from '../lib/logger';
import {
  CheckInRequestSchema,
  CheckInNowRequestSchema,
  SalaryVerifySchema,
  ApproveRequestSchema,
  LineUserIdSchema,
  YearSchema,
  MonthSchema,
  SalaryIdSchema,
} from '../schemas/api.schema';

/** 授權檢查：本人或已被授權者，可「以 target 身分」操作（薪資端點不走這個，僅本人）。 */
async function canAct(c: Context<AppEnv>, target: string): Promise<boolean> {
  return DelegationService.canActAs(c.env, c.var.user.lineUserId, target);
}

const forbidden = (c: Context<AppEnv>) =>
  c.json({ success: false, message: 'Forbidden: 無權代理此帳號' }, 403);

export function registerHrRoutes(app: Hono<AppEnv>) {
  // ── 打卡 ──
  app.post('/api/check-in', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const payload = CheckInRequestSchema.parse(body);
    const lineUserId = LineUserIdSchema.parse(body.lineUserId);
    if (!(await canAct(c, lineUserId))) return forbidden(c);

    return ndjson(async (write) => {
      await HRService.applyCheckIn(c.env, lineUserId, payload, write, c.var.user.lineUserId);
    });
  });

  app.post('/api/check-in/now', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const payload = CheckInNowRequestSchema.parse(body);
    const lineUserId = LineUserIdSchema.parse(body.lineUserId);
    if (!(await canAct(c, lineUserId))) return forbidden(c);
    await HRService.checkInNow(c.env, lineUserId, payload, c.var.user.lineUserId);
    return c.json({ success: true });
  });

  // ── 薪資（僅本人，永不可代理）──
  app.post('/api/salary/verify', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { code } = SalaryVerifySchema.parse(body);
    const lineUserId = LineUserIdSchema.parse(body.lineUserId);
    if (c.var.user.lineUserId !== lineUserId) return c.json({ success: false, message: 'Forbidden: User mismatch' }, 403);
    await HRService.verifySalaryCode(c.env, lineUserId, code);
    return c.json({ success: true });
  });

  app.get('/api/salary/years', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    if (c.var.user.lineUserId !== lineUserId) return c.json({ success: false, message: 'Forbidden: User mismatch' }, 403);
    const data = await HRService.getSalaryYears(c.env, lineUserId);
    return c.json({ success: true, data });
  });

  app.get('/api/salary/list', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const year = YearSchema.parse(c.req.query('year'));
    if (c.var.user.lineUserId !== lineUserId) return c.json({ success: false, message: 'Forbidden: User mismatch' }, 403);
    const data = await HRService.getSalaryList(c.env, lineUserId, year);
    return c.json({ success: true, data });
  });

  app.get('/api/salary/detail', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const id = SalaryIdSchema.parse(c.req.query('id'));
    if (c.var.user.lineUserId !== lineUserId) return c.json({ success: false, message: 'Forbidden: User mismatch' }, 403);
    const data = await HRService.getSalaryDetail(c.env, lineUserId, id);
    return c.json({ success: true, data });
  });

  app.get('/api/salary/summary', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const year = YearSchema.parse(c.req.query('year'));
    if (c.var.user.lineUserId !== lineUserId) return c.json({ success: false, message: 'Forbidden: User mismatch' }, 403);
    const data = await HRService.getSalarySummary(c.env, lineUserId, year);
    return c.json({ success: true, data });
  });

  // ── 出勤 / 假勤 ──
  app.get('/api/team/attendance', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const year = YearSchema.parse(c.req.query('year'));
    const month = MonthSchema.parse(c.req.query('month'));
    if (!(await canAct(c, lineUserId))) return forbidden(c);
    const data = await HRService.getTeamAttendance(c.env, lineUserId, year, month);
    return c.json({ success: true, data });
  });

  app.get('/api/personal/attendance', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const year = YearSchema.parse(c.req.query('year'));
    const month = MonthSchema.parse(c.req.query('month'));
    if (!(await canAct(c, lineUserId))) return forbidden(c);
    const data = await HRService.getPersonalAttendance(c.env, lineUserId, year, month);
    return c.json({ success: true, data });
  });

  app.get('/api/leave/status', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    if (!(await canAct(c, lineUserId))) return forbidden(c);
    const data = await HRService.getLeaveStatus(c.env, lineUserId);
    return c.json({ success: true, data });
  });

  // ── 簽核 ──
  app.get('/api/audit/list', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    if (!(await canAct(c, lineUserId))) return forbidden(c);
    const data = await HRService.getAuditList(c.env, lineUserId);
    return c.json({ success: true, data });
  });

  app.post('/api/audit/approve', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { approvalKeys } = ApproveRequestSchema.parse(body);
    const lineUserId = LineUserIdSchema.parse(body.lineUserId);
    if (!(await canAct(c, lineUserId))) return forbidden(c);

    return ndjson(async (write) => {
      await HRService.approveWorkflows(c.env, lineUserId, approvalKeys, write, c.var.user.lineUserId);
    });
  });

  // ── 統計 ──
  app.get('/api/usages/stats', async (c) => {
    const data = await HRService.getUsagesStats(c.env);
    return c.json({ success: true, data });
  });

  // ── 排程打卡 ──
  app.get('/api/schedule/list', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const statusParam = c.req.query('status');
    const status = statusParam ? statusParam.split(',') : undefined;
    const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!, 10) : undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 20;

    const user = await DelegationService.resolveActable(c.env, c.var.user.lineUserId, lineUserId);
    if (!user) return c.json({ success: false, message: 'Forbidden: 無權操作此帳號或對方未綁定' }, 403);

    let statuses: string[] | undefined;
    let order: 'asc' | 'desc' = 'desc';
    if (status) {
      statuses = status.includes('HISTORY') ? ['COMPLETED', 'FAILED', 'EXPIRED'] : status;
      order = status.includes('PENDING') ? 'asc' : 'desc';
    }

    const tasks = await db.listScheduledTasks(c.env.DB, { userId: user.id, statuses, order, limit, cursorId: cursor });
    const nextCursor = tasks.length === limit ? tasks[tasks.length - 1].id : undefined;

    let defaultLocation: any = undefined;
    if (!cursor) {
      const config = CompanyService.getConfig(c.env, user.companyId!, user.internalCompanyId!);
      const defaultConfig = CompanyService.getDefaultConfig(c.env);
      defaultLocation = config?.location || defaultConfig?.location;
    }

    return c.json({ success: true, data: { tasks, nextCursor, defaultLocation } });
  });

  app.post('/api/schedule/create', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { lineUserId, schedules } = body;

    const user = await DelegationService.resolveActable(c.env, c.var.user.lineUserId, lineUserId);
    if (!user) return c.json({ success: false, message: 'Forbidden: 無權操作此帳號或對方未綁定' }, 403);

    // 伺服器端每日上限（最多 2 筆：上/下班）。
    if (Array.isArray(schedules)) {
      const perDay: Record<string, number> = {};
      for (const s of schedules) {
        perDay[s.date] = (perDay[s.date] || 0) + 1;
        if (perDay[s.date] > 2) {
          return c.json({ success: false, message: `${s.date} 單日預約超過上限（每日最多 2 筆）` }, 400);
        }
      }
    }

    for (const s of schedules) {
      const dateStr = s.date; // YYYY-MM-DD
      const [startStr, endStr] = s.timeRange;

      // 注意：明確帶 +08:00（台北）。原 Node 容器靠 TZ=Asia/Taipei；Workers 是 UTC，
      // 不指定 offset 會差 8 小時，所以這裡一定要寫死台北時區。
      const startDate = new Date(`${dateStr}T${startStr}:00+08:00`);
      const endDate = new Date(`${dateStr}T${endStr}:00+08:00`);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue;

      const diff = endDate.getTime() - startDate.getTime();
      const randomOffset = Math.floor(Math.random() * diff);
      const scheduledAt = new Date(startDate.getTime() + randomOffset);

      // GPS 抖動 ~±10m（約 0.00009 度），讓記錄看起來自然。
      const offsetLat = (Math.random() - 0.5) * 0.00018;
      const offsetLng = (Math.random() - 0.5) * 0.00018;
      const finalLat = s.lat + offsetLat;
      const finalLng = s.lng + offsetLng;

      const iso = scheduledAt.toISOString();
      const task = await db.createScheduledTask(c.env.DB, {
        userId: user.id,
        scheduledAt: iso,
        lat: finalLat,
        lng: finalLng,
      });
      // 登記 DO alarm（任何月份都可，alarm 由 CF 持久保存）。
      // 比照原 notifyGoScheduler 的 fire-and-forget：DO 失敗只記 log、不中斷整批
      // （否則 D1 無交易，會留下已建立但無 alarm 的列且回 500）。
      try {
        await scheduleTask(c.env, task.id, iso);
      } catch (e) {
        logger.error({ msg: 'scheduleTask (DO) failed', taskId: task.id, error: String(e) });
      }
    }

    return c.json({ success: true });
  });

  app.post('/api/schedule/cancel', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { lineUserId, taskId } = body;
    const user = await DelegationService.resolveActable(c.env, c.var.user.lineUserId, lineUserId);
    if (!user) return c.json({ success: false, message: 'Forbidden: 無權操作此帳號或對方未綁定' }, 403);

    // ownership 必須先成立才拆 DO alarm：否則任何已登入者猜序號 taskId 就能刪掉
    // 別人的 alarm（DB 列因 userId 不符不會動，但計時器被刪 → 對方排程靜默不觸發）。
    const ok = await db.cancelTaskOwned(c.env.DB, taskId, user.id);
    if (!ok) return c.json({ success: false, message: 'Task not found' }, 404);
    await cancelScheduledTask(c.env, taskId);
    return c.json({ success: true });
  });

  app.post('/api/schedule/cancel-all', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { lineUserId } = body;
    const user = await DelegationService.resolveActable(c.env, c.var.user.lineUserId, lineUserId);
    if (!user) return c.json({ success: false, message: 'Forbidden: 無權操作此帳號或對方未綁定' }, 403);

    const pendingIds = await db.findPendingTaskIdsByUser(c.env.DB, user.id);
    await db.cancelAllPendingByUser(c.env.DB, user.id);
    for (const id of pendingIds) await cancelScheduledTask(c.env, id);
    return c.json({ success: true });
  });
}
