import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) {
    logger.warn({ msg: 'Validation Error', errors: err.errors });
    return res.status(400).json({ success: false, message: 'Validation Error', errors: err.errors });
  }

  logger.error({ 
    msg: 'Unhandled Error', 
    error: err.message, 
    stack: err.stack,
    req: {
      method: req.method,
      url: req.url,
      body: req.body,
      query: req.query,
      ip: req.ip
    }
  });
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
};
