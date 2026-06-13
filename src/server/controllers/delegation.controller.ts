import { Request, Response, NextFunction } from 'express';
import { DelegationService } from '../services/delegation.service';

/**
 * 代理授權管理。所有操作的「授權人(granter)」一律取自 req.user（本人），
 * 不信任 body 帶入的身分，確保只有本人能授權/撤銷自己的帳號。
 */
export class DelegationController {

  // 操作者列出「我可以代理的對象」（誰授權給我，且仍有效）
  static async actingFor(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const data = await DelegationService.listActingFor(req.user.lineUserId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  // 被代理人列出「我授權出去的對象」（我把代理權給了誰）
  static async granted(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const data = await DelegationService.listGranted(req.user.lineUserId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  // 本人(granter)授權同公司某員編的同事代理
  static async grant(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const { granteeEmpId, expiresAt } = req.body;
      if (!granteeEmpId) return res.status(400).json({ success: false, message: '請提供被授權人員編' });
      let exp: Date | null = null;
      if (expiresAt) {
        exp = new Date(expiresAt);
        if (isNaN(exp.getTime())) return res.status(400).json({ success: false, message: 'expiresAt 日期格式無效' });
      }
      await DelegationService.grantByEmpId(req.user.lineUserId, String(granteeEmpId), exp);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // 本人(granter)撤銷對某操作者的授權（granteeLineUserId 由 granted 清單取得）
  static async revoke(req: Request, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const { granteeLineUserId } = req.body;
      if (!granteeLineUserId) return res.status(400).json({ success: false, message: '缺少 granteeLineUserId' });
      await DelegationService.revokeDelegation(req.user.lineUserId, String(granteeLineUserId));
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
