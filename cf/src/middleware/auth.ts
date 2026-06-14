import type { Context, Next } from 'hono';
import type { AppEnv } from '../types';
import { verifyToken } from '../lib/jwt';

/**
 * 強制 JWT（對應原 authenticate middleware）。
 * 缺少/無效的 Authorization → 401。通過則把 payload 放進 c.var.user。
 */
export async function jwtAuth(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    try {
      const decoded = await verifyToken(c.env.JWT_SECRET, token);
      c.set('user', decoded);
      return next();
    } catch {
      return c.json({ success: false, message: 'Invalid Token' }, 401);
    }
  }
  return c.json({ success: false, message: 'Authorization required' }, 401);
}
