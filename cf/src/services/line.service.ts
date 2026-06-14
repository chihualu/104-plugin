import type { Env } from '../env';
import { logger } from '../lib/logger';

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

/**
 * LINE 推播。走標準 :443，普通 fetch() 即可（不涉及 104:8443 的 socket 繞道）。
 */
export class LineService {
  static async pushMessage(env: Env, lineUserId: string, text: string): Promise<void> {
    const token = env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      logger.error('LINE_CHANNEL_ACCESS_TOKEN is not set.');
      return;
    }
    if (!lineUserId || !text) {
      logger.error('Invalid arguments for pushMessage: lineUserId and text are required.');
      return;
    }

    const res = await fetch(LINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      logger.error({ msg: `Error pushing message to ${lineUserId}`, status: res.status, detail });
      throw new Error(`LINE push failed: ${res.status}`);
    }
  }
}
