/**
 * D1 資料存取層 — 把原本的 Prisma 呼叫 1:1 對應成 SQL。
 * 日期一律 ISO 字串。Boolean（Delegation.active）以 0/1 存。
 */

export interface UserBinding {
  id: number;
  lineUserId: string;
  companyId: string | null;
  internalCompanyId: string | null;
  empId: string | null;
  encryptedToken: string;
  iv: string;
  cookies: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTask {
  id: number;
  userId: number;
  scheduledAt: string;
  lat: number;
  lng: number;
  status: string;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageLog {
  id: number;
  userId: number;
  actorUserId: number | null;
  action: string;
  count: number;
  details: string | null;
  createdAt: string;
}

export interface Delegation {
  id: number;
  granterId: number;
  granteeId: number;
  active: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ───────────────────────── UserBinding ─────────────────────────

export async function findUserByLineId(db: D1Database, lineUserId: string): Promise<UserBinding | null> {
  return db.prepare('SELECT * FROM UserBinding WHERE lineUserId = ?').bind(lineUserId).first<UserBinding>();
}

export async function findUserById(db: D1Database, id: number): Promise<UserBinding | null> {
  return db.prepare('SELECT * FROM UserBinding WHERE id = ?').bind(id).first<UserBinding>();
}

export async function findUserByCompanyEmp(
  db: D1Database,
  companyId: string,
  empId: string,
): Promise<UserBinding | null> {
  return db
    .prepare('SELECT * FROM UserBinding WHERE companyId = ? AND empId = ? LIMIT 1')
    .bind(companyId, empId)
    .first<UserBinding>();
}

export async function findAllUsers(db: D1Database): Promise<UserBinding[]> {
  const r = await db.prepare('SELECT * FROM UserBinding').all<UserBinding>();
  return r.results ?? [];
}

export async function upsertUserBinding(
  db: D1Database,
  data: {
    lineUserId: string;
    companyId: string;
    internalCompanyId: string;
    empId: string;
    encryptedToken: string;
    iv: string;
    cookies: string | null;
  },
): Promise<UserBinding> {
  const ts = nowIso();
  const row = await db
    .prepare(
      `INSERT INTO UserBinding (lineUserId, companyId, internalCompanyId, empId, encryptedToken, iv, cookies, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(lineUserId) DO UPDATE SET
         companyId = excluded.companyId,
         internalCompanyId = excluded.internalCompanyId,
         empId = excluded.empId,
         encryptedToken = excluded.encryptedToken,
         iv = excluded.iv,
         cookies = excluded.cookies,
         updatedAt = excluded.updatedAt
       RETURNING *`,
    )
    .bind(
      data.lineUserId,
      data.companyId,
      data.internalCompanyId,
      data.empId,
      data.encryptedToken,
      data.iv,
      data.cookies,
      ts,
      ts,
    )
    .first<UserBinding>();
  return row!;
}

export async function updateUserCookies(db: D1Database, id: number, cookies: string | null): Promise<void> {
  await db.prepare('UPDATE UserBinding SET cookies = ?, updatedAt = ? WHERE id = ?').bind(cookies, nowIso(), id).run();
}

export async function deleteUserByLineId(db: D1Database, lineUserId: string): Promise<void> {
  // 對應原 prisma.userBinding.delete({ where: { lineUserId } })。
  // D1/SQLite 預設不強制 FK，所以單刪即可（孤兒的 ScheduledTask 之後會被 cleaner 過期、
  // 或觸發時因找不到 user 而標 FAILED；孤兒 UsageLog/Delegation 在 stats/清單的 JOIN 會被濾掉）。
  // 註：原版在 Postgres 的 restrict FK 下，對有關聯的使用者其實會丟錯被 try/catch 吞掉（等於
  // 解綁失效）；這裡會「真的」解綁，符合 LINE 通知所述的意圖。
  await db.prepare('DELETE FROM UserBinding WHERE lineUserId = ?').bind(lineUserId).run();
}

/** getUsagesStats：依公司分組的綁定使用者數。 */
export async function groupUsersByCompany(
  db: D1Database,
): Promise<Array<{ companyId: string | null; internalCompanyId: string | null; cnt: number }>> {
  const r = await db
    .prepare('SELECT companyId, internalCompanyId, COUNT(*) AS cnt FROM UserBinding GROUP BY companyId, internalCompanyId')
    .all<{ companyId: string | null; internalCompanyId: string | null; cnt: number }>();
  return r.results ?? [];
}

// ───────────────────────── ScheduledTask ─────────────────────────

export async function createScheduledTask(
  db: D1Database,
  data: { userId: number; scheduledAt: string; lat: number; lng: number },
): Promise<ScheduledTask> {
  const ts = nowIso();
  const row = await db
    .prepare(
      `INSERT INTO ScheduledTask (userId, scheduledAt, lat, lng, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?) RETURNING *`,
    )
    .bind(data.userId, data.scheduledAt, data.lat, data.lng, ts, ts)
    .first<ScheduledTask>();
  return row!;
}

export async function findScheduledTask(db: D1Database, id: number): Promise<ScheduledTask | null> {
  return db.prepare('SELECT * FROM ScheduledTask WHERE id = ?').bind(id).first<ScheduledTask>();
}

export async function updateTaskStatus(
  db: D1Database,
  id: number,
  status: string,
  result?: string | null,
): Promise<void> {
  await db
    .prepare('UPDATE ScheduledTask SET status = ?, result = ?, updatedAt = ? WHERE id = ?')
    .bind(status, result ?? null, nowIso(), id)
    .run();
}

/** 取消單筆（含 ownership 檢查）。回傳是否真的有更新到（>0）。 */
export async function cancelTaskOwned(db: D1Database, id: number, userId: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE ScheduledTask SET status = 'CANCELLED', updatedAt = ? WHERE id = ? AND userId = ?")
    .bind(nowIso(), id, userId)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function findPendingTaskIdsByUser(db: D1Database, userId: number): Promise<number[]> {
  const r = await db
    .prepare("SELECT id FROM ScheduledTask WHERE userId = ? AND status = 'PENDING'")
    .bind(userId)
    .all<{ id: number }>();
  return (r.results ?? []).map((x) => x.id);
}

export async function cancelAllPendingByUser(db: D1Database, userId: number): Promise<void> {
  await db
    .prepare("UPDATE ScheduledTask SET status = 'CANCELLED', updatedAt = ? WHERE userId = ? AND status = 'PENDING'")
    .bind(nowIso(), userId)
    .run();
}

/**
 * 排程清單（keyset 分頁，等價原 prisma cursor）。
 * order='asc' 給 PENDING（近的在前）、'desc' 給歷史。cursorId 為上一頁最後一筆 id。
 */
export async function listScheduledTasks(
  db: D1Database,
  opts: { userId: number; statuses?: string[]; order: 'asc' | 'desc'; limit: number; cursorId?: number },
): Promise<ScheduledTask[]> {
  const { userId, statuses, order, limit, cursorId } = opts;
  const where: string[] = ['userId = ?'];
  const binds: unknown[] = [userId];

  if (statuses && statuses.length > 0) {
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    binds.push(...statuses);
  }

  if (cursorId) {
    const cursor = await findScheduledTask(db, cursorId);
    if (cursor) {
      // keyset：(scheduledAt, id) 嚴格大於/小於游標。
      const cmp = order === 'asc' ? '>' : '<';
      where.push(`(scheduledAt ${cmp} ? OR (scheduledAt = ? AND id ${cmp} ?))`);
      binds.push(cursor.scheduledAt, cursor.scheduledAt, cursorId);
    }
  }

  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const sql = `SELECT * FROM ScheduledTask WHERE ${where.join(' AND ')} ORDER BY scheduledAt ${dir}, id ${dir} LIMIT ?`;
  binds.push(limit);
  const r = await db.prepare(sql).bind(...binds).all<ScheduledTask>();
  return r.results ?? [];
}

/** 資料匯入後補登 alarm 用：所有「未來的 PENDING」任務。 */
export async function findFuturePendingTasks(db: D1Database): Promise<Array<{ id: number; scheduledAt: string }>> {
  const r = await db
    .prepare("SELECT id, scheduledAt FROM ScheduledTask WHERE status = 'PENDING' AND scheduledAt > ? ORDER BY id")
    .bind(nowIso())
    .all<{ id: number; scheduledAt: string }>();
  return r.results ?? [];
}

// cron cleaner
export async function expirePastPending(db: D1Database): Promise<number> {
  const r = await db
    .prepare(
      "UPDATE ScheduledTask SET status = 'EXPIRED', result = 'System Auto-Expire', updatedAt = ? WHERE status = 'PENDING' AND scheduledAt < ?",
    )
    .bind(nowIso(), nowIso())
    .run();
  return r.meta?.changes ?? 0;
}

export async function deleteCancelled(db: D1Database): Promise<number> {
  const r = await db.prepare("DELETE FROM ScheduledTask WHERE status = 'CANCELLED'").run();
  return r.meta?.changes ?? 0;
}

// ───────────────────────── UsageLog ─────────────────────────

export async function createUsageLog(
  db: D1Database,
  data: { userId: number; actorUserId?: number | null; action: string; count: number; details?: string | null },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO UsageLog (userId, actorUserId, action, count, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(data.userId, data.actorUserId ?? null, data.action, data.count, data.details ?? null, nowIso())
    .run();
}

/** getBindingStatus：某使用者各 action 的累計筆數（CHECK_IN / AUDIT / SCHEDULE）。 */
export async function sumUsageByAction(db: D1Database, userId: number): Promise<Record<string, number>> {
  const r = await db
    .prepare('SELECT action, SUM(count) AS total FROM UsageLog WHERE userId = ? GROUP BY action')
    .bind(userId)
    .all<{ action: string; total: number }>();
  const out: Record<string, number> = {};
  for (const row of r.results ?? []) out[row.action] = row.total ?? 0;
  return out;
}

/** getUsagesStats：所有 log 連帶其使用者的公司資訊。 */
export async function findUsageLogsWithCompany(
  db: D1Database,
): Promise<Array<{ companyId: string | null; internalCompanyId: string | null; action: string; count: number }>> {
  const r = await db
    .prepare(
      `SELECT u.companyId AS companyId, u.internalCompanyId AS internalCompanyId, l.action AS action, l.count AS count
       FROM UsageLog l JOIN UserBinding u ON u.id = l.userId`,
    )
    .all<{ companyId: string | null; internalCompanyId: string | null; action: string; count: number }>();
  return r.results ?? [];
}

// ───────────────────────── Delegation ─────────────────────────

export async function findActiveDelegation(
  db: D1Database,
  granterId: number,
  granteeId: number,
): Promise<Delegation | null> {
  return db
    .prepare(
      'SELECT * FROM Delegation WHERE granterId = ? AND granteeId = ? AND active = 1 AND (expiresAt IS NULL OR expiresAt > ?) LIMIT 1',
    )
    .bind(granterId, granteeId, nowIso())
    .first<Delegation>();
}

export async function upsertDelegation(
  db: D1Database,
  granterId: number,
  granteeId: number,
  expiresAt: string | null,
): Promise<void> {
  const ts = nowIso();
  await db
    .prepare(
      `INSERT INTO Delegation (granterId, granteeId, active, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, 1, ?, ?, ?)
       ON CONFLICT(granterId, granteeId) DO UPDATE SET active = 1, expiresAt = excluded.expiresAt, updatedAt = excluded.updatedAt`,
    )
    .bind(granterId, granteeId, expiresAt, ts, ts)
    .run();
}

export async function deactivateDelegation(db: D1Database, granterId: number, granteeId: number): Promise<void> {
  await db
    .prepare('UPDATE Delegation SET active = 0, updatedAt = ? WHERE granterId = ? AND granteeId = ?')
    .bind(nowIso(), granterId, granteeId)
    .run();
}

export async function listGrantedByGranter(
  db: D1Database,
  granterId: number,
): Promise<Array<{ granteeLineUserId: string; granteeEmpId: string | null; expiresAt: string | null; createdAt: string }>> {
  const r = await db
    .prepare(
      `SELECT g.lineUserId AS granteeLineUserId, g.empId AS granteeEmpId, d.expiresAt AS expiresAt, d.createdAt AS createdAt
       FROM Delegation d JOIN UserBinding g ON g.id = d.granteeId
       WHERE d.granterId = ? AND d.active = 1
       ORDER BY d.createdAt DESC`,
    )
    .bind(granterId)
    .all<{ granteeLineUserId: string; granteeEmpId: string | null; expiresAt: string | null; createdAt: string }>();
  return r.results ?? [];
}

export async function listActingForByGrantee(
  db: D1Database,
  granteeId: number,
): Promise<
  Array<{
    granterLineUserId: string;
    granterEmpId: string | null;
    granterCompanyId: string | null;
    expiresAt: string | null;
  }>
> {
  const r = await db
    .prepare(
      `SELECT g.lineUserId AS granterLineUserId, g.empId AS granterEmpId, g.companyId AS granterCompanyId, d.expiresAt AS expiresAt
       FROM Delegation d JOIN UserBinding g ON g.id = d.granterId
       WHERE d.granteeId = ? AND d.active = 1 AND (d.expiresAt IS NULL OR d.expiresAt > ?)
       ORDER BY d.createdAt DESC`,
    )
    .bind(granteeId, nowIso())
    .all<{
      granterLineUserId: string;
      granterEmpId: string | null;
      granterCompanyId: string | null;
      expiresAt: string | null;
    }>();
  return r.results ?? [];
}
