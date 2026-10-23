import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../encryption';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { CompanyService } from './company.service';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

if (!process.env.JWT_SECRET) {
  logger.error('CRITICAL ERROR: JWT_SECRET is not defined. The application cannot start safely.');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

export class AuthService {
  static async bindUser(lineUserId: string, payload: any) {
    const { groupUBINo, companyID, empId, password } = payload;
    
    // Verify credentials with 104
    // Now returns { token, cookies }
    const loginResult = await HR104Adapter.login(groupUBINo, companyID, empId, password);
    const token = typeof loginResult === 'string' ? loginResult : loginResult.token;
    const cookies = typeof loginResult === 'string' ? null : loginResult.cookies;

    const { encryptedData, iv } = encrypt(token);

    // Save to DB
    const user = await prisma.userBinding.upsert({
      where: { lineUserId },
      update: {
        companyId: groupUBINo,
        internalCompanyId: companyID,
        empId,
        encryptedToken: encryptedData,
        iv,
        cookies, // Save session cookies
      },
      create: {
        lineUserId,
        companyId: groupUBINo,
        internalCompanyId: companyID,
        empId,
        encryptedToken: encryptedData,
        iv,
        cookies,
      },
    });

    // Generate JWT
    const jwtToken = this.generateToken(user);
    return { message: 'Binding successful', token: jwtToken };
  }

  static async getBindingStatus(lineUserId: string) {
    const user = await prisma.userBinding.findUnique({
      where: { lineUserId },
      include: { logs: true }
    });

    if (user) {
      const checkInCount = user.logs.filter((l: any) => l.action === 'CHECK_IN').reduce((acc, cur) => acc + cur.count, 0);
      const auditCount = user.logs.filter((l: any) => l.action === 'AUDIT').reduce((acc, cur) => acc + cur.count, 0);
      const scheduledTasksCount = user.logs.filter((l: any) => l.action === 'SCHEDULE').reduce((acc, cur) => acc + cur.count, 0);
      
      // Generate a fresh token for the returning user
      const token = this.generateToken(user);
      const companyName = await CompanyService.getCompanyName(user.companyId!, user.internalCompanyId!);

      return {
        isBound: true,
        token,
        empId: user.empId,
        companyId: user.companyId,
        companyName,
        internalId: user.internalCompanyId,
        stats: { checkIn: checkInCount, audit: auditCount, scheduledTasks: scheduledTasksCount }
      };
    } else {
      return { isBound: false };
    }
  }
  
  static async getUserCredentials(lineUserId: string) {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.companyId || !user.internalCompanyId || !user.empId) {
        throw new Error('User not bound');
    }
    let token: string;
    try {
      token = decrypt(user.encryptedToken, user.iv);
    } catch {
      // ENCRYPTION_KEY 換過（或遺失）→ 舊密文永遠解不開。
      // 這不是伺服器故障，而是「這筆綁定已失效」，所以回 403：
      // 前端的全域攔截器看到 403 會自動把使用者導到綁定頁重新輸入 104 帳密。
      //
      // 刻意不刪除這一列：bindUser 是以 lineUserId upsert，重新綁定會就地覆寫
      // encryptedToken/iv 而列 id 不變，因此排程、使用紀錄、代理授權全部保留。
      logger.warn({ msg: 'Stale binding: token undecryptable, forcing re-bind', empId: user.empId });
      const err: any = new Error('綁定已失效，請重新綁定您的 104 帳號');
      err.status = 403;
      throw err;
    }
    return {
        token,
        companyId: user.companyId,
        internalId: user.internalCompanyId,
        empId: user.empId,
        cookies: user.cookies,
        dbUser: user
    };
  }

  static generateToken(user: any) {
    return jwt.sign(
      { 
        lineUserId: user.lineUserId,
        empId: user.empId,
        companyId: user.companyId 
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  static verifyToken(token: string) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        throw new Error('Invalid Token');
    }
  }
}