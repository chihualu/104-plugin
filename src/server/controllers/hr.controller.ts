import { Request, Response, NextFunction } from 'express';
import { HRService } from '../services/hr.service';
import { CheckInRequestSchema, CheckInNowRequestSchema, SalaryVerifySchema, ApproveRequestSchema, LineUserIdSchema, YearSchema, MonthSchema, SalaryIdSchema } from '../schemas/api.schema';

export class HRController {
  
  static async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = CheckInRequestSchema.parse(req.body);
        const lineUserId = LineUserIdSchema.parse(req.body.lineUserId);
        
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        await HRService.applyCheckIn(lineUserId, payload, (data) => {
            res.write(JSON.stringify(data) + '\n');
        });
        res.end();
    } catch (e: any) {
        if (!res.headersSent) res.status(400).json({ success: false, message: e.message });
        else res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
        res.end();
    }
  }

  static async checkInNow(req: Request, res: Response, next: NextFunction) {
    try {
        const payload = CheckInNowRequestSchema.parse(req.body);
        const lineUserId = LineUserIdSchema.parse(req.body.lineUserId);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        await HRService.checkInNow(lineUserId, payload);
        res.json({ success: true });
    } catch (e) { next(e); }
  }

  static async verifySalary(req: Request, res: Response, next: NextFunction) {
    try {
        const { code } = SalaryVerifySchema.parse(req.body);
        const lineUserId = LineUserIdSchema.parse(req.body.lineUserId);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        await HRService.verifySalaryCode(lineUserId, code);
        res.json({ success: true });
    } catch (e) { next(e); }
  }

  static async getSalaryYears(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        const data = await HRService.getSalaryYears(lineUserId);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async getSalaryList(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        const year = YearSchema.parse(req.query.year); 
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        const data = await HRService.getSalaryList(lineUserId, year);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async getSalaryDetail(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        const id = SalaryIdSchema.parse(req.query.id);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        const data = await HRService.getSalaryDetail(lineUserId, id);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async getSalarySummary(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        const year = YearSchema.parse(req.query.year);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        const data = await HRService.getSalarySummary(lineUserId, year);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async getTeamAttendance(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        const year = YearSchema.parse(req.query.year);
        const month = MonthSchema.parse(req.query.month);

        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });

        const data = await HRService.getTeamAttendance(lineUserId, year, month);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async getLeaveStatus(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        const data = await HRService.getLeaveStatus(lineUserId);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async getAuditList(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });
        const data = await HRService.getAuditList(lineUserId);
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }

  static async approveWorkflows(req: Request, res: Response, next: NextFunction) {
    try {
        const { approvalKeys } = ApproveRequestSchema.parse(req.body);
        const lineUserId = LineUserIdSchema.parse(req.body.lineUserId);

        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden: User mismatch' });

        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        await HRService.approveWorkflows(lineUserId, approvalKeys, (data) => {
            res.write(JSON.stringify(data) + '\n');
        });
        res.end();
    } catch (e: any) {
        if (!res.headersSent) res.status(400).json({ success: false, message: e.message });
        else res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
        res.end();
    }
  }

  static async getUsagesStats(req: Request, res: Response, next: NextFunction) {
    try {
        const data = await HRService.getUsagesStats();
        res.json({ success: true, data });
    } catch (e) { next(e); }
  }
}
