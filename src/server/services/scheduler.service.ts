import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { LineBotService } from './lineBot.service';
import { HRService } from './hr.service';

const prisma = new PrismaClient();

const TZ = 'Asia/Taipei';

/** 掃描週期：每分鐘撈一次即將到期的任務。 */
const SCAN_INTERVAL_MS = 60_000;
/** 前瞻視窗：只把「未來 5 分鐘內」的任務放進記憶體計時器。 */
const LOOKAHEAD_MS = 5 * 60_000;
/**
 * 補打寬限：已過期但在 10 分鐘內的 PENDING 也撈進來立刻執行。
 * 這是為了容忍主機重啟／短暫停機——晚 10 分鐘打卡，仍遠勝於漏打要跑補卡流程。
 */
const CATCHUP_GRACE_MS = 10 * 60_000;
/** 每日清理時，過期多久才標 EXPIRED（要大於重試視野，免得跟重試搶）。 */
const EXPIRE_GRACE_MS = 60 * 60_000;

/** 連線失敗最多重排幾次。 */
const MAX_RETRIES = 5;

/**
 * 第 attempt 次重試（0 起算）要等多久；null 代表額度用盡。
 * 節奏：30s → 60s → 之後三次為「約 60 秒的隨機值」（30–90s），累計約 3.5–6 分鐘。
 * 後段用隨機而非固定間隔，是避免同一波一起失敗的任務永遠同步、每輪都在同一秒重打 104。
 */
function retryDelayMs(attempt: number): number | null {
  if (attempt >= MAX_RETRIES) return null;
  if (attempt === 0) return 30_000;
  if (attempt === 1) return 60_000;
  return 30_000 + Math.floor(Math.random() * 60_000);
}

/**
 * 這個錯誤是不是「連線都還沒建立就失敗」——亦即一個 byte 都還沒送出去。
 * 只有這種失敗重打才安全；連上之後的任何失敗都可能已經打卡成功，重試會變成兩筆。
 *
 * 刻意**不**包含 ECONNRESET / ECONNABORTED（axios 逾時）：那兩個無法分辨請求是否已送達。
 */
function isConnectError(e: any): boolean {
  if (!e || e.response) return false; // 收到 HTTP 回應 → 一定送出去過
  return ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT'].includes(e.code);
}

/** 台北時區的年 / 月（不依賴主機 TZ 設定）。 */
function taipeiYearMonth(): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric' }).formatToParts(
    new Date(),
  );
  return {
    year: parts.find((p) => p.type === 'year')!.value,
    month: parts.find((p) => p.type === 'month')!.value,
  };
}

/**
 * 排程打卡的計時引擎（取代原本的 Go scheduler 微服務）。
 *
 * 採「滾動視窗」而非 Go 版的「啟動時載入整個當月」：
 *   - 記憶體只放 5 分鐘的量，不必為了跨月而每月 1 號重載，未來月份的預約自然涵蓋。
 *   - 保留秒級精度（schedule/create 刻意把時間隨機到秒，單純每分鐘輪詢執行會毀掉這個設計）。
 *   - 重啟後下一輪掃描自動補回，最多晚一分鐘；配合 CATCHUP_GRACE_MS 連停機期間的也補打。
 */
export class SchedulerService {
  private static monthlyCheckRunning = false;
  private static scanTimer: NodeJS.Timeout | null = null;
  /** 已排入記憶體計時器的任務 → 避免同一筆被掃描重複排入。 */
  private static armed = new Map<number, NodeJS.Timeout>();
  /** 每筆任務已重試次數（行程重啟後歸零，可接受）。 */
  private static attempts = new Map<number, number>();

  static init() {
    void this.scan();
    this.scanTimer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);

    // 每日 00:00（台北）清理：過期 PENDING 標 EXPIRED、刪除 CANCELLED。
    cron.schedule('0 0 * * *', () => void this.runDailyClean(), { timezone: TZ });
    // 每月 25 號 10:00（台北）出勤異常檢查。
    cron.schedule('0 10 25 * *', () => void this.runMonthlyCheck(), { timezone: TZ });

    logger.info({ msg: 'Scheduler initialized (in-process rolling-window timers)', scanIntervalMs: SCAN_INTERVAL_MS });
  }

  static stop() {
    if (this.scanTimer) clearInterval(this.scanTimer);
    for (const t of this.armed.values()) clearTimeout(t);
    this.armed.clear();
    this.attempts.clear();
  }

  /** 掃描視窗內的 PENDING 任務並排入計時器。 */
  private static async scan() {
    try {
      const now = Date.now();
      const tasks = await prisma.scheduledTask.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { gte: new Date(now - CATCHUP_GRACE_MS), lte: new Date(now + LOOKAHEAD_MS) },
        },
        select: { id: true, scheduledAt: true },
      });

      let armedNow = 0;
      for (const t of tasks) {
        if (this.armed.has(t.id)) continue; // 已排入（含重試中）→ 不重複排
        this.arm(t.id, Math.max(0, t.scheduledAt.getTime() - Date.now()));
        armedNow++;
      }
      if (armedNow > 0) logger.info({ msg: 'Scheduler armed tasks', count: armedNow, inWindow: tasks.length });
    } catch (e: any) {
      logger.error({ msg: 'Scheduler scan failed', error: e.message });
    }
  }

  private static arm(taskId: number, delayMs: number) {
    const existing = this.armed.get(taskId);
    if (existing) clearTimeout(existing);
    this.armed.set(
      taskId,
      setTimeout(() => void this.fire(taskId), delayMs),
    );
  }

  private static async fire(taskId: number) {
    const attempt = this.attempts.get(taskId) ?? 0;
    const delayMs = retryDelayMs(attempt);
    const canRetry = delayMs !== null;

    try {
      await HRService.executeScheduledTask(taskId, { deferFailure: canRetry });
      this.release(taskId);
    } catch (e: any) {
      // deferFailure 成立時，只有「連線階段就失敗」會被原樣拋回來（重打不會變兩筆）。
      // 其餘錯誤 executeScheduledTask 已標 FAILED 並推播通知。
      if (canRetry && isConnectError(e)) {
        this.attempts.set(taskId, attempt + 1);
        this.arm(taskId, delayMs!);
        logger.warn({ msg: 'Scheduled task retry', taskId, attempt: attempt + 1, delayMs, error: e.message });
        return;
      }
      this.release(taskId);
      logger.error({ msg: 'Scheduled task failed (final)', taskId, attempts: attempt + 1, error: e.message });
    }
  }

  private static release(taskId: number) {
    const t = this.armed.get(taskId);
    if (t) clearTimeout(t);
    this.armed.delete(taskId);
    this.attempts.delete(taskId);
  }

  /** 取消：立即拆掉記憶體計時器（DB 狀態由 controller 負責改）。 */
  static cancel(taskId: number) {
    this.release(taskId);
  }

  static cancelMany(taskIds: number[]) {
    for (const id of taskIds) this.release(id);
  }

  /**
   * 建立後立即排入（若落在前瞻視窗內）。視窗外的任務不用管——掃描到期前自然會撈到，
   * 這也是為什麼跨月預約不再需要任何特別處理。
   */
  static onTaskCreated(taskId: number, scheduledAt: Date) {
    const delay = scheduledAt.getTime() - Date.now();
    if (delay <= LOOKAHEAD_MS) this.arm(taskId, Math.max(0, delay));
  }

  private static async runDailyClean() {
    logger.info('Daily cleaner started');
    try {
      const expired = await prisma.scheduledTask.updateMany({
        where: { status: 'PENDING', scheduledAt: { lt: new Date(Date.now() - EXPIRE_GRACE_MS) } },
        data: { status: 'EXPIRED', result: 'System Auto-Expire' },
      });
      const deleted = await prisma.scheduledTask.deleteMany({ where: { status: 'CANCELLED' } });
      logger.info({ msg: 'Daily cleaner finished', expired: expired.count, deleted: deleted.count });
    } catch (e: any) {
      logger.error({ msg: 'Daily cleaner failed', error: e.message });
    }
  }

  static async runMonthlyCheck() {
    // In-process guard：避免重複觸發造成雙重推播。
    if (SchedulerService.monthlyCheckRunning) {
      logger.warn('Monthly check already running; skipping duplicate trigger');
      return;
    }
    SchedulerService.monthlyCheckRunning = true;
    logger.info('Starting Monthly Attendance Check...');
    try {
      const users = await prisma.userBinding.findMany();
      const { year, month } = taipeiYearMonth();

      for (const user of users) {
        try {
          const abnormalities = await HRService.checkMonthlyAttendance(user.lineUserId, year, month);
          if (abnormalities.length > 0) {
            const msg = `【出勤異常提醒】\n您本月 (${month}月) 尚有 ${abnormalities.length} 筆出勤異常或未打卡紀錄，請盡快處理。\n\n異常日期：\n${abnormalities
              .map((a: any) => `- ${a.date} (${a.dayType})`)
              .join('\n')}`;
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
