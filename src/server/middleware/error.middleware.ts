import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    logger.warn({ msg: 'Validation Error', errors: err.issues });
    return res.status(400).json({ success: false, message: 'Validation Error', errors: err.issues });
  }

  const status = err.status || 500;
  // 4xx 是「預期中的用戶端錯誤」（例如綁定失效 → 403），訊息本來就是要給使用者看的，
  // 不該被遮成 Internal Server Error，也不該用 error 等級污染 log。
  // 只有 5xx 才是真的意外，才需要遮蔽細節並記完整堆疊。
  const isServerError = status >= 500;

  const reqInfo = { method: req.method, url: req.url, query: req.query, ip: req.ip };
  if (isServerError) {
    logger.error({ msg: 'Unhandled Error', error: err.message, stack: err.stack, req: { ...reqInfo, body: req.body } });
  } else {
    logger.warn({ msg: 'Client Error', status, error: err.message, req: reqInfo });
  }

  res.status(status).json({
    success: false,
    message: isServerError && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
};
