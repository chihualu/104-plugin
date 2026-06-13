import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { LineBotService } from './lineBot.service';
import { HRService } from './hr.service';

const prisma = new PrismaClient();

export class SchedulerService {
  private static monthlyCheckRunning = false;

  static init() {
    // Both scheduled-task execution AND the monthly attendance check are triggered
    // by the Go Scheduler Service (which POSTs /api/internal/monthly-check). We do
    // NOT register an in-process cron here: doing so would run the monthly check
    // TWICE (once via Node cron, once via the Go trigger) and double-send LINE
    // notifications. This matches D's design where Node has no in-process cron.
    logger.info('Scheduler Service initialized (triggers handled by Go scheduler)');
  }

  static async runMonthlyCheck() {
      // In-process guard: the endpoint could be triggered twice (e.g. Go retry);
      // skip overlapping runs so we don't double-send notifications.
      if (SchedulerService.monthlyCheckRunning) {
          logger.warn('Monthly check already running; skipping duplicate trigger');
          return;
      }
      SchedulerService.monthlyCheckRunning = true;
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
      } finally {
          SchedulerService.monthlyCheckRunning = false;
      }
  }
}
