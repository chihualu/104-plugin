import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { LineBotService } from './lineBot.service';
import { HRService } from './hr.service';

const prisma = new PrismaClient();

export class SchedulerService {

  static init() {
    // Task Execution is now handled by the Go Scheduler Service.
    // We only keep the Monthly Check here.

    // Schedule Monthly Check (Every 25th at 10:00 AM)
    cron.schedule('0 10 25 * *', () => {
        this.runMonthlyCheck();
    });

    logger.info('Scheduler Service initialized (Monthly Check only)');
  }

  static async runMonthlyCheck() {
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
}
