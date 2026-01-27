import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { HRService } from '../services/hr.service';
import { CompanyService } from '../services/company.service';
import { CheckInRequestSchema, CheckInNowRequestSchema, SalaryVerifySchema, ApproveRequestSchema, LineUserIdSchema, YearSchema, MonthSchema, SalaryIdSchema } from '../schemas/api.schema';

const prisma = new PrismaClient();

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

  static async getScheduleList(req: Request, res: Response, next: NextFunction) {
    try {
        const lineUserId = LineUserIdSchema.parse(req.query.lineUserId);
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden' });

        const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
        if (!user) return res.status(401).json({ success: false, message: 'User not bound' });

        const tasks = await prisma.scheduledTask.findMany({
            where: { userId: user.id },
            orderBy: { scheduledAt: 'desc' },
            take: 50
        });

        const config = CompanyService.getConfig(user.companyId!, user.internalCompanyId!);
        const defaultConfig = CompanyService.getDefaultConfig();

        res.json({ 
            success: true, 
            data: {
                tasks,
                defaultLocation: config?.location || defaultConfig?.location
            }
        });
    } catch (e) { next(e); }
  }

  static async createSchedules(req: Request, res: Response, next: NextFunction) {
    try {
        const { lineUserId, schedules } = req.body;
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden' });

        const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
        if (!user) return res.status(401).json({ success: false, message: 'User not bound' });

        for (const s of schedules) {
            const date = new Date(s.time);
            const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

            const count = await prisma.scheduledTask.count({
                where: {
                    userId: user.id,
                    scheduledAt: { gte: startOfDay, lte: endOfDay },
                    status: { in: ['PENDING', 'COMPLETED'] }
                }
            });

            if (count >= 2) {
                return res.status(400).json({ success: false, message: `Daily limit reached for ${startOfDay.toLocaleDateString()}` });
            }
            
            const duplicate = await prisma.scheduledTask.findFirst({
                where: {
                    userId: user.id,
                    scheduledAt: date,
                    status: 'PENDING'
                }
            });
            if (duplicate) {
                return res.status(400).json({ success: false, message: `Duplicate schedule at ${date.toLocaleString()}` });
            }
        }

        await prisma.scheduledTask.createMany({
            data: schedules.map((s: any) => ({
                userId: user.id,
                scheduledAt: new Date(s.time),
                lat: s.lat,
                lng: s.lng,
                status: 'PENDING'
            }))
        });

        res.json({ success: true });
    } catch (e) { next(e); }
  }

  static async cancelSchedule(req: Request, res: Response, next: NextFunction) {
    try {
        const { lineUserId, taskId } = req.body;
        if (req.user && req.user.lineUserId !== lineUserId) return res.status(403).json({ success: false, message: 'Forbidden' });

        const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
        if (!user) return res.status(401).json({ success: false, message: 'User not bound' });

        await prisma.scheduledTask.update({
            where: { id: taskId, userId: user.id },
            data: { status: 'CANCELLED' }
        });

        res.json({ success: true });
    } catch (e) { next(e); }
  }
}