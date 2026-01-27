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
    const token = await HR104Adapter.login(groupUBINo, companyID, empId, password);
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
      },
      create: {
        lineUserId,
        companyId: groupUBINo,
        internalCompanyId: companyID,
        empId,
        encryptedToken: encryptedData,
        iv,
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
      const checkInCount = user.logs.filter(l => l.action === 'CHECK_IN').reduce((acc, cur) => acc + cur.count, 0);
      const auditCount = user.logs.filter(l => l.action === 'AUDIT').reduce((acc, cur) => acc + cur.count, 0);
      
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
        stats: { checkIn: checkInCount, audit: auditCount }
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
    const token = decrypt(user.encryptedToken, user.iv);
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