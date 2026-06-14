import type { Env } from '../env';
import { encrypt, decrypt } from '../lib/crypto';
import { signToken } from '../lib/jwt';
import { HR104Adapter, type AuthParams } from '../adapters/hr104.adapter';
import { CompanyService } from './company.service';
import * as db from '../lib/db';

export interface ResolvedCreds extends AuthParams {
  dbUser: db.UserBinding;
}

export class AuthService {
  static async bindUser(env: Env, lineUserId: string, payload: any) {
    const { groupUBINo, companyID, empId, password } = payload;

    const loginResult = await HR104Adapter.login(groupUBINo, companyID, empId, password);
    const token = typeof loginResult === 'string' ? loginResult : loginResult.token;
    const cookies = typeof loginResult === 'string' ? null : loginResult.cookies;

    const { encryptedData, iv } = await encrypt(env.ENCRYPTION_KEY, token);

    const user = await db.upsertUserBinding(env.DB, {
      lineUserId,
      companyId: groupUBINo,
      internalCompanyId: companyID,
      empId,
      encryptedToken: encryptedData,
      iv,
      cookies,
    });

    const jwtToken = await signToken(env.JWT_SECRET, {
      lineUserId: user.lineUserId,
      empId: user.empId,
      companyId: user.companyId,
    });
    return { message: 'Binding successful', token: jwtToken };
  }

  static async getBindingStatus(env: Env, lineUserId: string) {
    const user = await db.findUserByLineId(env.DB, lineUserId);
    if (!user) return { isBound: false };

    const sums = await db.sumUsageByAction(env.DB, user.id);
    const token = await signToken(env.JWT_SECRET, {
      lineUserId: user.lineUserId,
      empId: user.empId,
      companyId: user.companyId,
    });
    const companyName = await CompanyService.getCompanyName(env, user.companyId!, user.internalCompanyId!);

    return {
      isBound: true,
      token,
      empId: user.empId,
      companyId: user.companyId,
      companyName,
      internalId: user.internalCompanyId,
      stats: {
        checkIn: sums['CHECK_IN'] || 0,
        audit: sums['AUDIT'] || 0,
        scheduledTasks: sums['SCHEDULE'] || 0,
      },
    };
  }

  static async getUserCredentials(env: Env, lineUserId: string): Promise<ResolvedCreds> {
    const user = await db.findUserByLineId(env.DB, lineUserId);
    if (!user || !user.companyId || !user.internalCompanyId || !user.empId) {
      throw new Error('User not bound');
    }
    const token = await decrypt(env.ENCRYPTION_KEY, user.encryptedToken, user.iv);
    return {
      token,
      companyId: user.companyId,
      internalId: user.internalCompanyId,
      empId: user.empId,
      cookies: user.cookies,
      dbUser: user,
    };
  }
}
