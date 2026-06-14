import type { ScheduleAlarmDO } from './scheduler/schedule-do';

/**
 * Worker bindings & secrets。
 * 機密（ENCRYPTION_KEY / JWT_SECRET / LINE_*）用 `wrangler secret put` 設定，
 * 非機密設定走 wrangler.jsonc 的 vars。
 */
export interface Env {
  // Bindings
  ASSETS: Fetcher;
  DB: D1Database;
  SCHEDULE_DO: DurableObjectNamespace<ScheduleAlarmDO>;

  // Secrets（必填）
  ENCRYPTION_KEY: string; // 64-char hex = 32 bytes
  JWT_SECRET: string;

  // LINE
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  LINE_CHANNEL_SECRET?: string;

  // 每公司設定（取代原本 gitignored 的 config/104.config.json）：整包 JSON 字串。
  COMPANY_CONFIG_JSON?: string;

  // 運維用：保護一次性 admin 端點（如資料匯入後的 alarm 補登）。未設則該端點停用。
  ADMIN_SECRET?: string;

  // Vars
  MONTHLY_CHECK_CRON?: string;
  DAILY_CLEAN_CRON?: string;
}

/**
 * 取代原 auth.service / encryption.ts 在模組載入時的 process.exit(1) fail-fast。
 * Workers 沒有「啟動程序」可中止，所以改在每個進入點（fetch / scheduled）開頭硬驗證：
 * 缺/弱的 JWT_SECRET 會讓 jose 以空金鑰簽發 token → 任何人可偽造身分繞過授權，必須擋下。
 */
export function assertEnv(env: Env): void {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET is missing or too short (set via `wrangler secret put JWT_SECRET`)');
  }
  if (!env.ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(env.ENCRYPTION_KEY)) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (set via `wrangler secret put ENCRYPTION_KEY`)');
  }
}
