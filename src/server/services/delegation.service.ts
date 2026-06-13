import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 代理授權服務。
 * Delegation: granter（被代理人）授權 grantee（操作者）代為操作其帳號。
 * 所有對外函式都以 lineUserId 為介面，內部轉成 UserBinding.id 操作。
 */
export class DelegationService {

  /**
   * 判斷 actor 是否可以「以 target 的身分」操作。
   * 規則：actor === target（本人），或存在一筆 active 且未過期的授權
   *       （granter = target, grantee = actor）。
   */
  static async canActAs(actorLineUserId: string, targetLineUserId: string): Promise<boolean> {
    if (!actorLineUserId || !targetLineUserId) return false;
    if (actorLineUserId === targetLineUserId) return true; // 本人

    const [actor, target] = await Promise.all([
      prisma.userBinding.findUnique({ where: { lineUserId: actorLineUserId } }),
      prisma.userBinding.findUnique({ where: { lineUserId: targetLineUserId } }),
    ]);
    if (!actor || !target) return false;

    const now = new Date();
    const delegation = await prisma.delegation.findFirst({
      where: {
        granterId: target.id,
        granteeId: actor.id,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return !!delegation;
  }

  /**
   * 驗證 actor 可否操作 target，並回傳 target 的 UserBinding（否則 null）。
   * 比 canActAs 多回傳 binding，讓呼叫端不必再查一次 target（省一次 DB round-trip）。
   */
  static async resolveActable(actorLineUserId: string, targetLineUserId: string) {
    if (!actorLineUserId || !targetLineUserId) return null;
    const target = await prisma.userBinding.findUnique({ where: { lineUserId: targetLineUserId } });
    if (!target) return null;
    if (actorLineUserId === targetLineUserId) return target; // 本人
    const actor = await prisma.userBinding.findUnique({ where: { lineUserId: actorLineUserId } });
    if (!actor) return null;
    const now = new Date();
    const delegation = await prisma.delegation.findFirst({
      where: {
        granterId: target.id,
        granteeId: actor.id,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return delegation ? target : null;
  }

  /**
   * 被代理人(granter) 授權 操作者(grantee) 代為操作（由 granter 本人發起，知情同意）。
   * 雙方都必須已綁定本系統。
   */
  static async grantDelegation(granterLineUserId: string, granteeLineUserId: string, expiresAt?: Date | null) {
    if (granterLineUserId === granteeLineUserId) {
      throw new Error('不可授權給自己');
    }
    const [granter, grantee] = await Promise.all([
      prisma.userBinding.findUnique({ where: { lineUserId: granterLineUserId } }),
      prisma.userBinding.findUnique({ where: { lineUserId: granteeLineUserId } }),
    ]);
    if (!granter) throw new Error('授權人尚未綁定');
    if (!grantee) throw new Error('被授權人尚未綁定本系統，請對方先完成綁定');

    return prisma.delegation.upsert({
      where: { granterId_granteeId: { granterId: granter.id, granteeId: grantee.id } },
      update: { active: true, expiresAt: expiresAt ?? null },
      create: { granterId: granter.id, granteeId: grantee.id, active: true, expiresAt: expiresAt ?? null },
    });
  }

  /**
   * 以「同公司員編」指定被授權人並授權（granter 由 lineUserId 識別、本人發起）。
   * 比 grantDelegation 多一層 empId→使用者解析，方便前端用員編指定同事。
   */
  static async grantByEmpId(granterLineUserId: string, granteeEmpId: string, expiresAt?: Date | null) {
    const granter = await prisma.userBinding.findUnique({ where: { lineUserId: granterLineUserId } });
    if (!granter) throw new Error('授權人尚未綁定');
    if (granter.empId === granteeEmpId) throw new Error('不可授權給自己');

    const grantee = await prisma.userBinding.findFirst({
      where: { companyId: granter.companyId, empId: granteeEmpId },
    });
    if (!grantee) throw new Error('找不到該員編的已綁定同事（對方需先完成綁定本系統）');

    return this.grantDelegation(granterLineUserId, grantee.lineUserId, expiresAt);
  }

  /**
   * 撤銷授權（設為 inactive，保留紀錄以利稽核）。由 granter 本人發起。
   */
  static async revokeDelegation(granterLineUserId: string, granteeLineUserId: string) {
    const [granter, grantee] = await Promise.all([
      prisma.userBinding.findUnique({ where: { lineUserId: granterLineUserId } }),
      prisma.userBinding.findUnique({ where: { lineUserId: granteeLineUserId } }),
    ]);
    if (!granter || !grantee) throw new Error('使用者不存在');

    await prisma.delegation.updateMany({
      where: { granterId: granter.id, granteeId: grantee.id },
      data: { active: false },
    });
  }

  /**
   * 被代理人列出「我授權出去的對象」（我把代理權給了誰）。
   */
  static async listGranted(granterLineUserId: string) {
    const granter = await prisma.userBinding.findUnique({ where: { lineUserId: granterLineUserId } });
    if (!granter) return [];
    const rows = await prisma.delegation.findMany({
      where: { granterId: granter.id, active: true },
      include: { grantee: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => ({
      granteeLineUserId: r.grantee.lineUserId,
      granteeEmpId: r.grantee.empId,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  /**
   * 操作者列出「我可以代理的對象」（誰授權給我，且仍有效）。
   */
  static async listActingFor(granteeLineUserId: string) {
    const grantee = await prisma.userBinding.findUnique({ where: { lineUserId: granteeLineUserId } });
    if (!grantee) return [];
    const now = new Date();
    const rows = await prisma.delegation.findMany({
      where: {
        granteeId: grantee.id,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { granter: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => ({
      granterLineUserId: r.granter.lineUserId,
      granterEmpId: r.granter.empId,
      granterCompanyId: r.granter.companyId,
      expiresAt: r.expiresAt,
    }));
  }
}
