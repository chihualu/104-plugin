import type { Env } from '../env';
import * as db from '../lib/db';
import { HRService } from '../services/hr.service';
import { LineService } from '../services/line.service';
import { logger } from '../lib/logger';

/**
 * Cron Triggers handler。取代 Go 的 daily cleaner 與 25 號月檢查。
 *   - "0 2 25 * *"  (UTC) = 每月 25 號 10:00 台北 → 出勤異常月檢查
 *   - "0 16 * * *"  (UTC) = 每日 00:00 台北      → 清理過期/已取消任務
 */
export async function handleScheduled(event: ScheduledController, env: Env): Promise<void> {
  if (event.cron.startsWith('0 2 25')) {
    await runMonthlyAttendanceCheck(env);
  } else {
    await runDailyClean(env);
  }
}

async function runDailyClean(env: Env): Promise<void> {
  logger.info('Daily cleaner started');
  try {
    const expired = await db.expirePastPending(env.DB);
    const deleted = await db.deleteCancelled(env.DB);
    logger.info({ msg: 'Daily cleaner finished', expired, deleted });
  } catch (e: any) {
    logger.error({ msg: 'Daily cleaner failed', error: e.message });
  }
}

async function runMonthlyAttendanceCheck(env: Env): Promise<void> {
  logger.info('Monthly Attendance Check started');
  try {
    const users = await db.findAllUsers(env.DB);

    // 以台北時區決定年/月（cron 在 UTC 25 號 02:00 = 台北 25 號 10:00，同一日曆月）。
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')!.value;
    const month = parts.find((p) => p.type === 'month')!.value;

    for (const user of users) {
      try {
        const abnormalities = await HRService.checkMonthlyAttendance(env, user.lineUserId, year, month);
        if (abnormalities.length > 0) {
          const msg =
            `【出勤異常提醒】\n您本月 (${month}月) 尚有 ${abnormalities.length} 筆出勤異常或未打卡紀錄，請盡快處理。\n\n異常日期：\n` +
            abnormalities.map((a: any) => `- ${a.date} (${a.dayType})`).join('\n');
          await LineService.pushMessage(env, user.lineUserId, msg);
        }
      } catch (e: any) {
        logger.error({ msg: `Monthly check failed for user ${user.lineUserId}`, error: e.message });
      }
    }
    logger.info('Monthly Attendance Check Completed');
  } catch (e: any) {
    logger.error({ msg: 'Monthly check fatal error', error: e.message });
  }
}
