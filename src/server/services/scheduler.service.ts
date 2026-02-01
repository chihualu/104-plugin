import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { AuthService } from './auth.service';
import { logger } from '../utils/logger';
import { LineBotService } from './lineBot.service';
import { HRService } from './hr.service';

const prisma = new PrismaClient();

export class SchedulerService {
  private static isRunning = false;

  static init() {
    // Schedule to run every minute (Task Execution)
    cron.schedule('* * * * *', async () => {
      if (this.isRunning) return;
      this.isRunning = true;
      
      try {
        await this.processTasks();
      } catch (e) {
        logger.error({ msg: 'Scheduler error', error: (e as any).message });
      } finally {
        this.isRunning = false;
      }
    });

    // Schedule Monthly Check (Every 25th at 10:00 AM)
    cron.schedule('0 10 25 * *', () => {
        this.runMonthlyCheck();
    });
    
    logger.info('Scheduler Service initialized');
  }

  private static async runMonthlyCheck() {
      logger.info('Starting Monthly Attendance Check...');
      try {
        const users = await prisma.userBinding.findMany();
        const today = new Date();
        const year = today.getFullYear().toString();
        const month = (today.getMonth() + 1).toString();

        for (const user of users) {
            try {
                const abnormalities = await HRService.checkMonthlyAttendance(user.lineUserId, year, month);
                if (abnormalities.length > 0) {
                    const msg = `【出勤異常提醒】\n您本月 (${month}月) 尚有 ${abnormalities.length} 筆出勤異常或未打卡紀錄，請盡快處理。\n\n異常日期：\n${abnormalities.map((a: any) => `- ${a.date} (${a.dayType})`).join('\n')}`;
                    await LineBotService.pushMessage(user.lineUserId, msg);
                }
            } catch (e: any) {
                logger.error({ msg: `Monthly check failed for user ${user.lineUserId}`, error: e.message });
            }
        }
        logger.info('Monthly Attendance Check Completed.');
      } catch (e: any) {
          logger.error({ msg: 'Monthly check fatal error', error: e.message });
      }
  }

  private static async processTasks() {
    const now = new Date();
    // Round to the current minute (start of the minute)
    const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    // 1. Mark past PENDING tasks as EXPIRED (older than current minute)
    const expiredResult = await prisma.scheduledTask.updateMany({
      where: {
        status: 'PENDING',
        scheduledAt: {
          lt: currentMinute
        }
      },
      data: {
        status: 'EXPIRED',
        result: 'System skipped: missed execution time'
      }
    });

    if (expiredResult.count > 0) {
        logger.warn({ msg: `Marked ${expiredResult.count} tasks as EXPIRED` });
    }

    // 2. Find tasks for the CURRENT minute
    const tasks = await prisma.scheduledTask.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: {
          gte: currentMinute,
          lt: new Date(currentMinute.getTime() + 60000)
        }
      }
    });

    if (tasks.length === 0) return;

    logger.info({ msg: `Found ${tasks.length} tasks to execute for ${currentMinute.toISOString()}` });

    // Execute tasks
    for (const task of tasks) {
      const nowMs = new Date().getTime();
      const scheduledMs = new Date(task.scheduledAt).getTime();
      const delay = Math.max(0, scheduledMs - nowMs);

      // Execute without awaiting to avoid blocking the main scheduler loop
      if (delay > 0) {
          setTimeout(() => {
              this.executeTask(task).catch(e => logger.error({ msg: `Delayed task ${task.id} failed`, error: e.message }));
          }, delay);
      } else {
          this.executeTask(task).catch(e => logger.error({ msg: `Immediate task ${task.id} failed`, error: e.message }));
      }
    }
  }

  private static async executeTask(task: any) {
    try {
      // 1. Get User Credentials
      const user = await prisma.userBinding.findUnique({ where: { id: task.userId } });
      if (!user) throw new Error('User not found');

      const creds = await AuthService.getUserCredentials(user.lineUserId);

      // 2. Call 104 API
      await HR104Adapter.insertCard(creds, {
        lat: task.lat,
        lng: task.lng,
        address: '',
        memo: ''
      });

      // 3. Update Status
      await prisma.scheduledTask.update({
        where: { id: task.id },
        data: { status: 'COMPLETED', result: 'Success' }
      });

      // 4. Log to UsageLog
      await this.logUsage(task.userId);

      // 5. Notify User via LINE
      const timeStr = new Date(task.scheduledAt).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      await LineBotService.pushMessage(user.lineUserId, `【預約打卡通知】\n您預約於 ${timeStr} 的自動打卡已執行成功。`);

      logger.info({ msg: `Scheduled task ${task.id} for user ${user.empId} completed successfully` });

    } catch (e: any) {
      await prisma.scheduledTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', result: e.message }
      });
      throw e;
    }
  }

  private static async logUsage(userId: number) {
    try {
        await prisma.usageLog.create({
            data: {
              userId: userId,
              action: 'SCHEDULE',
              count: 1,
              details: `Executed successfully`
            }
        });
    } catch (e) { logger.error('Log Usage failed', e); }
  }
}
