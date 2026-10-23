import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { HRController } from '../controllers/hr.controller';
import { DelegationController } from '../controllers/delegation.controller';
import { authenticate, internalAuth } from '../middleware/auth.middleware';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate Limiters
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	limit: 100,
    message: { success: false, message: 'Too many requests' }
});
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 5,
    message: { success: false, message: 'Too many login attempts' }
});

router.use(apiLimiter);

// Auth Routes
router.post('/bind', authLimiter, AuthController.bind);
router.get('/check-binding', AuthController.checkBinding);
router.get('/companies', AuthController.getCompanies);

// Internal Routes (For Go Scheduler)
// 排程觸發已改為同程序內的 SchedulerService，不再需要 execute-task 跨程序回呼端點。
// monthly-check 保留為手動觸發用（月檢查本身由 node-cron 在 25 號 10:00 自動執行）。
router.post('/internal/monthly-check', internalAuth, HRController.runMonthlyAttendanceCheck);

// HR Routes
router.use(authenticate); // Enforce JWT on every route below (401 if missing/invalid)

router.post('/check-in', HRController.checkIn);
router.post('/check-in/now', HRController.checkInNow);

router.post('/salary/verify', HRController.verifySalary);
router.get('/salary/years', HRController.getSalaryYears);
router.get('/salary/list', HRController.getSalaryList);
router.get('/salary/detail', HRController.getSalaryDetail);
router.get('/salary/summary', HRController.getSalarySummary);

router.get('/team/attendance', HRController.getTeamAttendance);
router.get('/personal/attendance', HRController.getPersonalAttendance);

router.get('/leave/status', HRController.getLeaveStatus);

router.get('/audit/list', HRController.getAuditList);
router.post('/audit/approve', HRController.approveWorkflows);

router.get('/schedule/list', HRController.getScheduleList);
router.post('/schedule/create', HRController.createSchedules);
router.post('/schedule/cancel', HRController.cancelSchedule);
router.post('/schedule/cancel-all', HRController.cancelAllSchedules);

router.get('/usages/stats', HRController.getUsagesStats);

// 代理授權管理（granter 一律取自 req.user，本人發起）
router.get('/delegation/acting-for', DelegationController.actingFor);
router.get('/delegation/granted', DelegationController.granted);
router.post('/delegation/grant', DelegationController.grant);
router.post('/delegation/revoke', DelegationController.revoke);

export default router;
