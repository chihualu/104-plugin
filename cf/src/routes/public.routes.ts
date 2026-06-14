import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { AuthService } from '../services/auth.service';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { BindRequestSchema, LineUserIdSchema, GroupUBINoSchema } from '../schemas/api.schema';
import { LineService } from '../services/line.service';
import { logger } from '../lib/logger';

/**
 * 公開端點（authenticate 之前）：bind / check-binding / companies / LINE webhook。
 * 對應原 router.post('/bind') 等在 router.use(authenticate) 之前的部分。
 */
export function registerPublicRoutes(app: Hono<AppEnv>) {
  app.post('/api/bind', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const payload = BindRequestSchema.parse(body);
    const result = await AuthService.bindUser(c.env, payload.lineUserId, payload);
    return c.json({ success: true, ...result });
  });

  app.get('/api/check-binding', async (c) => {
    const lineUserId = LineUserIdSchema.parse(c.req.query('lineUserId'));
    const data = await AuthService.getBindingStatus(c.env, lineUserId);
    return c.json({ success: true, data });
  });

  app.get('/api/companies', async (c) => {
    const groupUBINo = GroupUBINoSchema.parse(c.req.query('groupUBINo'));
    const list = await HR104Adapter.getCompanyList(groupUBINo);
    return c.json({ success: true, data: list });
  });

  // LINE Webhook（簽章驗證 + 簡單事件處理）
  app.post('/callback', async (c) => {
    const signature = c.req.header('x-line-signature') || '';
    const rawBody = await c.req.text();

    if (!(await validateSignature(c.env.LINE_CHANNEL_SECRET, rawBody, signature))) {
      logger.warn('Invalid LINE Signature');
      return c.text('Invalid Signature', 403);
    }

    let events: any[] = [];
    try {
      events = JSON.parse(rawBody).events || [];
    } catch {
      events = [];
    }

    try {
      await Promise.all(events.map((event: any) => handleEvent(c.env, event)));
    } catch (e: any) {
      logger.error({ msg: 'Webhook handling error', error: e.message });
    }

    return c.text('OK', 200);
  });
}

async function validateSignature(secret: string | undefined, body: string, signature: string): Promise<boolean> {
  if (!secret) return true; // 未設定 → Dev 模式略過（同原行為）
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return expected === signature;
}

async function handleEvent(env: AppEnv['Bindings'], event: any): Promise<void> {
  const userId = event.source?.userId;
  switch (event.type) {
    case 'follow':
      logger.info(`User ${userId} followed the bot.`);
      break;
    case 'unfollow':
      logger.info(`User ${userId} unfollowed the bot.`);
      break;
    case 'message':
      if (event.message?.type === 'text' && event.message.text === 'ID') {
        await LineService.pushMessage(env, userId, `Your ID: ${userId}`);
      }
      break;
    default:
      break;
  }
}
