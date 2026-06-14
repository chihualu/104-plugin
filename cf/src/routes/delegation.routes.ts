import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { DelegationService } from '../services/delegation.service';

/**
 * 代理授權管理。granter（授權人）一律取自 c.var.user（本人），不信任 body 帶入的身分。
 * 對應原 delegation.controller.ts。
 */
export function registerDelegationRoutes(app: Hono<AppEnv>) {
  // 操作者列出「我可以代理的對象」
  app.get('/api/delegation/acting-for', async (c) => {
    const data = await DelegationService.listActingFor(c.env, c.var.user.lineUserId);
    return c.json({ success: true, data });
  });

  // 被代理人列出「我授權出去的對象」
  app.get('/api/delegation/granted', async (c) => {
    const data = await DelegationService.listGranted(c.env, c.var.user.lineUserId);
    return c.json({ success: true, data });
  });

  // 本人授權同公司某員編的同事代理
  app.post('/api/delegation/grant', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { granteeEmpId, expiresAt } = body;
    if (!granteeEmpId) return c.json({ success: false, message: '請提供被授權人員編' }, 400);

    let exp: Date | null = null;
    if (expiresAt) {
      exp = new Date(expiresAt);
      if (isNaN(exp.getTime())) return c.json({ success: false, message: 'expiresAt 日期格式無效' }, 400);
    }
    try {
      await DelegationService.grantByEmpId(c.env, c.var.user.lineUserId, String(granteeEmpId), exp);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 400);
    }
  });

  // 本人撤銷對某操作者的授權
  app.post('/api/delegation/revoke', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { granteeLineUserId } = body;
    if (!granteeLineUserId) return c.json({ success: false, message: '缺少 granteeLineUserId' }, 400);
    try {
      await DelegationService.revokeDelegation(c.env, c.var.user.lineUserId, String(granteeLineUserId));
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 400);
    }
  });
}
