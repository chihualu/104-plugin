-- D1 (SQLite) schema — 由 prisma/schema.prisma 1:1 轉譯。
-- 原本零個 @db.* 原生型別，所以幾乎照搬：
--   Int autoincrement   → INTEGER PRIMARY KEY AUTOINCREMENT
--   String              → TEXT
--   Float               → REAL
--   Boolean             → INTEGER (0/1)
--   DateTime            → TEXT（ISO-8601，UTC，例如 2026-06-14T04:25:05.000Z）
-- 日期一律存 ISO 字串，字典序即時間序，方便 scheduledAt < now 這類比較。

CREATE TABLE IF NOT EXISTS UserBinding (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lineUserId        TEXT    NOT NULL UNIQUE,
  companyId         TEXT,            -- 統編 (groupUBINo)
  internalCompanyId TEXT,            -- 內部 ID (companyID, e.g. "1")
  empId             TEXT,            -- 員編 (account)
  encryptedToken    TEXT    NOT NULL,
  iv                TEXT    NOT NULL,
  cookies           TEXT,
  createdAt         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ScheduledTask (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  userId      INTEGER NOT NULL REFERENCES UserBinding(id),
  scheduledAt TEXT    NOT NULL,                 -- 目標執行時間 (ISO)
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'PENDING', -- PENDING/COMPLETED/FAILED/EXPIRED/CANCELLED
  result      TEXT,
  createdAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_task_sched_status ON ScheduledTask(scheduledAt, status);
CREATE INDEX IF NOT EXISTS idx_task_user ON ScheduledTask(userId);

CREATE TABLE IF NOT EXISTS UsageLog (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  userId      INTEGER NOT NULL REFERENCES UserBinding(id),
  actorUserId INTEGER,                          -- 實際執行者（代理時=操作者；本人時 null）
  action      TEXT    NOT NULL,                 -- CHECK_IN / AUDIT / SCHEDULE
  count       INTEGER NOT NULL,
  details     TEXT,
  createdAt   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_user ON UsageLog(userId);

CREATE TABLE IF NOT EXISTS Delegation (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  granterId  INTEGER NOT NULL REFERENCES UserBinding(id),  -- 被代理人
  granteeId  INTEGER NOT NULL REFERENCES UserBinding(id),  -- 操作者
  active     INTEGER NOT NULL DEFAULT 1,
  expiresAt  TEXT,
  createdAt  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updatedAt  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(granterId, granteeId)
);
CREATE INDEX IF NOT EXISTS idx_deleg_grantee_active ON Delegation(granteeId, active);
