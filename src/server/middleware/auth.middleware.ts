import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = AuthService.verifyToken(token);
      req.user = decoded;
      return next();
    } catch (e) {
      // Token invalid
      return res.status(401).json({ success: false, message: 'Invalid Token' });
    }
  }
  // Missing or malformed header
  // TODO: Transition period - allow requests without header for now.
  // return res.status(401).json({ success: false, message: 'Authorization header missing or invalid' });
  next();
};
