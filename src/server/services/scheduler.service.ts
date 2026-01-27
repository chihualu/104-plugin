import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { AuthService } from './auth.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class SchedulerService {
  private static isRunning = false;

  static init() {
    // Schedule to run every minute
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
    
    logger.info('Scheduler Service initialized');
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
      try {
        const nowMs = new Date().getTime();
        const scheduledMs = new Date(task.scheduledAt).getTime();
        const delay = Math.max(0, scheduledMs - nowMs);

        if (delay > 0) {
            setTimeout(() => {
                this.executeTask(task).catch(e => logger.error({ msg: `Delayed task ${task.id} failed`, error: e.message }));
            }, delay);
        } else {
            // Already passed or exact time, execute immediately
            await this.executeTask(task);
        }
      } catch (e) {
        logger.error({ msg: `Task ${task.id} execution failed`, error: (e as any).message });
      }
    }
  }

  private static async executeTask(task: any) {
    try {
      // 1. Get User Credentials
      // We need lineUserId. Since we have userId (DB ID), we need to fetch user first.
      const user = await prisma.userBinding.findUnique({ where: { id: task.userId } });
      if (!user) {
          throw new Error('User not found');
      }

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
        data: {
          status: 'COMPLETED',
          result: 'Success'
        }
      });

      // 4. Log to UsageLog
      await prisma.usageLog.create({
        data: {
          userId: task.userId,
          action: 'SCHEDULE',
          count: 1,
          details: `Scheduled at ${task.scheduledAt.toISOString()}`
        }
      });

      logger.info({ msg: `Scheduled task ${task.id} for user ${user.empId} completed successfully` });

    } catch (e: any) {
      await prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: 'FAILED',
          result: e.message
        }
      });
      throw e;
    }
  }
}
