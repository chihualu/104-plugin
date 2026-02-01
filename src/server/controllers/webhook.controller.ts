import { Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { LineBotService } from '../services/lineBot.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';

export class WebhookController {

  static async handleWebhook(req: Request, res: Response) {
    // 1. Signature Validation
    const signature = req.headers['x-line-signature'] as string;
    const body = (req as any).rawBody || JSON.stringify(req.body);
    
    if (!WebhookController.validateSignature(body, signature)) {
        logger.warn('Invalid LINE Signature');
        return res.status(403).send('Invalid Signature');
    }

    const events = req.body.events;
    
    // 2. Process Events
    try {
        await Promise.all(events.map(async (event: any) => {
            await WebhookController.handleEvent(event);
        }));
    } catch (e: any) {
        logger.error({ msg: 'Webhook handling error', error: e.message });
    }

    res.status(200).send('OK');
  }

  private static validateSignature(body: string, signature: string): boolean {
    if (!CHANNEL_SECRET) return true; // Skip if no secret configured (Dev mode)
    const hash = crypto.createHmac('sha256', CHANNEL_SECRET).update(body).digest('base64');
    return hash === signature;
  }

  private static async handleEvent(event: any) {
    const userId = event.source.userId;

    switch (event.type) {
        case 'follow':
            logger.info(`User ${userId} followed the bot.`);
            // Optional: Send welcome message
            // await LineBotService.pushMessage(userId, "歡迎使用 104 eHR 小幫手！\n請點擊選單開始使用。");
            break;

        case 'unfollow':
            logger.info(`User ${userId} unfollowed the bot.`);
            // Optional: Mark user as unavailable for notifications in DB
            // await prisma.userBinding.update(...)
            break;

        case 'message':
            if (event.message.type === 'text') {
                const text = event.message.text;
                // Simple Echo or Default Reply
                if (text === 'ID') {
                    await LineBotService.pushMessage(userId, `Your ID: ${userId}`);
                }
                // Ignore other messages to avoid spam
            }
            break;
            
default:
            break;
    }
  }
}
