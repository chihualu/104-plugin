import type { Env } from '../env';
import * as db from '../lib/db';

/**
 * 代理授權服務。granter（被代理人）授權 grantee（操作者）代為操作其帳號。
 * 介面以 lineUserId 為主，內部轉成 UserBinding.id。
 */
export class DelegationService {
  static async canActAs(env: Env, actorLineUserId: string, targetLineUserId: string): Promise<boolean> {
    if (!actorLineUserId || !targetLineUserId) return false;
    if (actorLineUserId === targetLineUserId) return true;

    const [actor, target] = await Promise.all([
      db.findUserByLineId(env.DB, actorLineUserId),
      db.findUserByLineId(env.DB, targetLineUserId),
    ]);
    if (!actor || !target) return false;

    const delegation = await db.findActiveDelegation(env.DB, target.id, actor.id);
    return !!delegation;
  }

  static async resolveActable(env: Env, actorLineUserId: string, targetLineUserId: string): Promise<db.UserBinding | null> {
    if (!actorLineUserId || !targetLineUserId) return null;
    const target = await db.findUserByLineId(env.DB, targetLineUserId);
    if (!target) return null;
    if (actorLineUserId === targetLineUserId) return target;
    const actor = await db.findUserByLineId(env.DB, actorLineUserId);
    if (!actor) return null;
    const delegation = await db.findActiveDelegation(env.DB, target.id, actor.id);
    return delegation ? target : null;
  }

  static async grantDelegation(
    env: Env,
    granterLineUserId: string,
    granteeLineUserId: string,
    expiresAt?: Date | null,
  ) {
    if (granterLineUserId === granteeLineUserId) throw new Error('不可授權給自己');
    const [granter, grantee] = await Promise.all([
      db.findUserByLineId(env.DB, granterLineUserId),
      db.findUserByLineId(env.DB, granteeLineUserId),
    ]);
    if (!granter) throw new Error('授權人尚未綁定');
    if (!grantee) throw new Error('被授權人尚未綁定本系統，請對方先完成綁定');

    await db.upsertDelegation(env.DB, granter.id, grantee.id, expiresAt ? expiresAt.toISOString() : null);
  }

  static async grantByEmpId(env: Env, granterLineUserId: string, granteeEmpId: string, expiresAt?: Date | null) {
    const granter = await db.findUserByLineId(env.DB, granterLineUserId);
    if (!granter) throw new Error('授權人尚未綁定');
    if (granter.empId === granteeEmpId) throw new Error('不可授權給自己');

    const grantee = await db.findUserByCompanyEmp(env.DB, granter.companyId!, granteeEmpId);
    if (!grantee) throw new Error('找不到該員編的已綁定同事（對方需先完成綁定本系統）');

    return this.grantDelegation(env, granterLineUserId, grantee.lineUserId, expiresAt);
  }

  static async revokeDelegation(env: Env, granterLineUserId: string, granteeLineUserId: string) {
    const [granter, grantee] = await Promise.all([
      db.findUserByLineId(env.DB, granterLineUserId),
      db.findUserByLineId(env.DB, granteeLineUserId),
    ]);
    if (!granter || !grantee) throw new Error('使用者不存在');
    await db.deactivateDelegation(env.DB, granter.id, grantee.id);
  }

  static async listGranted(env: Env, granterLineUserId: string) {
    const granter = await db.findUserByLineId(env.DB, granterLineUserId);
    if (!granter) return [];
    return db.listGrantedByGranter(env.DB, granter.id);
  }

  static async listActingFor(env: Env, granteeLineUserId: string) {
    const grantee = await db.findUserByLineId(env.DB, granteeLineUserId);
    if (!grantee) return [];
    return db.listActingForByGrantee(env.DB, grantee.id);
  }
}
