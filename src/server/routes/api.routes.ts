import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { HRController } from '../controllers/hr.controller';
import { authenticate } from '../middleware/auth.middleware';
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

// HR Routes
router.use(authenticate); // Attempt to parse token

router.post('/check-in', HRController.checkIn);
router.post('/check-in/now', HRController.checkInNow);

router.post('/salary/verify', HRController.verifySalary);
router.get('/salary/years', HRController.getSalaryYears);
router.get('/salary/list', HRController.getSalaryList);
router.get('/salary/detail', HRController.getSalaryDetail);
router.get('/salary/summary', HRController.getSalarySummary);

router.get('/team/attendance', HRController.getTeamAttendance);

router.get('/leave/status', HRController.getLeaveStatus);

router.get('/audit/list', HRController.getAuditList);
router.post('/audit/approve', HRController.approveWorkflows);

router.get('/usages/stats', HRController.getUsagesStats);

export default router;
