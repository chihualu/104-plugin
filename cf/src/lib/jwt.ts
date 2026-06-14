import { SignJWT, jwtVerify } from 'jose';

/**
 * JWT（HS256，jose）。與原 jsonwebtoken HS256 相容：同一個 secret 字串、同演算法，
 * 既有已簽發的 7 天 token 在遷移後仍然有效。
 */

export interface JwtPayload {
  lineUserId: string;
  empId?: string | null;
  companyId?: string | null;
}

const EXPIRES_IN = '7d';

export async function signToken(secret: string, payload: JwtPayload): Promise<string> {
  if (!secret) throw new Error('JWT_SECRET missing'); // 防線：jose 會接受空金鑰
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    lineUserId: payload.lineUserId,
    empId: payload.empId ?? null,
    companyId: payload.companyId ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(key);
}

export async function verifyToken(secret: string, token: string): Promise<JwtPayload> {
  if (!secret) throw new Error('JWT_SECRET missing'); // 防線：空金鑰會讓偽造 token 通過
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  return {
    lineUserId: String(payload.lineUserId),
    empId: (payload.empId as string | null) ?? null,
    companyId: (payload.companyId as string | null) ?? null,
  };
}
