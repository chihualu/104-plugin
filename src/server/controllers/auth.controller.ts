import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { BindRequestSchema, LineUserIdSchema } from '../schemas/api.schema';

export class AuthController {
  static async bind(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = BindRequestSchema.parse(req.body);
      const result = await AuthService.bindUser(payload.lineUserId, payload);
      res.json({ success: true, ...result });
    } catch (e) { next(e); }
  }

  static async checkBinding(req: Request, res: Response, next: NextFunction) {
    try {
      const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
      const data = await AuthService.getBindingStatus(lineUserId);
      res.json({ success: true, data });
    } catch (e) { next(e); }
  }
}
