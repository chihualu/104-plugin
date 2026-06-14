import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError } from 'zod';
import type { Env } from './env';
import { assertEnv } from './env';
import type { AppEnv } from './types';
import { jwtAuth } from './middleware/auth';
import { registerPublicRoutes } from './routes/public.routes';
import { registerAdminRoutes } from './routes/admin.routes';
import { registerHrRoutes } from './routes/hr.routes';
import { registerDelegationRoutes } from './routes/delegation.routes';
import { handleScheduled } from './scheduler/cron';
import { logger } from './lib/logger';

const app = new Hono<AppEnv>();

// CORS（與原 cors() 對齊；JWT 走 Authorization header，非 cookie）。
app.use('*', cors());

// ── 公開端點（必須在 jwtAuth 之前註冊）──
// bind / check-binding / companies / /callback
registerPublicRoutes(app);
// admin（自帶 X-Admin-Secret 閘門，免 JWT）— 必須在 jwtAuth 之前註冊
registerAdminRoutes(app);

// ── 強制 JWT：以下所有 /api/* 都要帶有效 token ──
// 註冊順序在公開端點之後，所以公開端點不受影響（Hono 依註冊順序串接）。
app.use('/api/*', jwtAuth);

// ── 受保護端點 ──
registerHrRoutes(app);
registerDelegationRoutes(app);

// 錯誤處理（對應原 error.middleware）：ZodError → 400；其餘 → 500（細節只記 log）。
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ success: false, message: 'Validation Error', errors: err.issues }, 400);
  }
  logger.error({ msg: 'Unhandled Error', error: (err as Error).message, stack: (err as Error).stack });
  return c.json({ success: false, message: 'Internal Server Error' }, 500);
});

// 找不到路由：/api 與 /callback → 404 JSON；其餘交給靜態資源（SPA fallback → index.html）。
app.notFound((c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api') || path === '/callback') {
    return c.json({ success: false, message: 'Not Found' }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export { ScheduleAlarmDO } from './scheduler/schedule-do';

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => {
    try {
      assertEnv(env);
    } catch (e) {
      logger.error({ msg: 'Env validation failed', error: String(e) });
      return new Response(JSON.stringify({ success: false, message: 'Server misconfigured' }), {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return app.fetch(req, env, ctx);
  },

  // Cron Triggers（每日清理 / 25 號月檢查）。
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    try {
      assertEnv(env);
    } catch (e) {
      logger.error({ msg: 'Env validation failed (scheduled)', error: String(e) });
      return;
    }
    ctx.waitUntil(handleScheduled(event, env));
  },
} satisfies ExportedHandler<Env>;
