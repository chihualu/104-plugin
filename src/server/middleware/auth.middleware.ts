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
  // Missing or malformed Authorization header → reject (strict auth).
  return res.status(401).json({ success: false, message: 'Authorization required' });
};

// Protects /internal/* endpoints with a shared secret. The Go scheduler sends it
// as the X-Internal-Secret header. If INTERNAL_API_SECRET is unset, requests pass
// through (backward-compatible); set it to enforce protection.
export const internalAuth = (req: Request, res: Response, next: NextFunction) => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return next();
  if (req.headers['x-internal-secret'] === secret) return next();
  return res.status(403).json({ success: false, message: 'Forbidden: invalid internal secret' });
};
