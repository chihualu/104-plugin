# 104-plugin — 全 Cloudflare 版（Workers + Hono + D1 + Durable Objects）

把原本 **Node20/Express5/Prisma(Postgres) + Go(in-memory timer) 三程序**，完整改寫成
**單一 Cloudflare Worker**。前端 SPA 由同一個 Worker 以靜態資源伺服，`/api` 同源。

> 技術可行性已由 `../cf-poc/` 驗證：Workers `connect()` socket 能打進 104:8443、真實登入、
> 用 token 呼叫需授權 API（fetch() 對 :8443 的 bug 用手寫 HTTP/1.1 繞過）。

## 架構對照

| 原本 | 全 Cloudflare 版 | 檔案 |
|---|---|---|
| Express 5 路由 | Hono | `src/index.ts`, `src/routes/*` |
| `hr104.adapter`（axios → 104:8443） | `connect()` socket + 手寫 HTTP/1.1 | `src/lib/http104.ts`, `src/adapters/hr104.adapter.ts` |
| Prisma + PostgreSQL | D1（SQLite） | `src/lib/db.ts`, `migrations/0001_init.sql` |
| Go `time.AfterFunc` 計時器 | Durable Object alarm（每任務一個，秒級） | `src/scheduler/schedule-do.ts` |
| Go daily cleaner / 25 號月檢查 cron | Cron Triggers | `src/scheduler/cron.ts`, `wrangler.jsonc` |
| `jsonwebtoken`（HS256） | `jose`（HS256，舊 token 相容） | `src/lib/jwt.ts` |
| `node:crypto` AES-256-CBC | Web Crypto（舊密文相容，DB 免重新加密） | `src/lib/crypto.ts` |
| `express-rate-limit` | Cloudflare WAF Rate Limiting（見下方 follow-up） | — |
| `pino` / `pino-http` | console（`wrangler tail`） | `src/lib/logger.ts` |
| `config/104.config.json`（檔案） | `COMPANY_CONFIG_JSON` 環境變數 | `src/services/company.service.ts` |
| Node + Go 用 `INTERNAL_API_SECRET` 互打 | 不需要（DO/cron 同程序內呼叫） | — |

排程語意的改善：Go 版因為 timer 在記憶體，必須「只載入當月」「每月 1 號重載」；
DO alarm 由 Cloudflare 持久保存，**未來月份的任務也可靠**，那套機制不再需要。

## 部署步驟

前置：已安裝 Node、`npm i -g wrangler`（或用 `npx`）、有 Cloudflare 帳號。

```bash
# 0) 安裝
cd cf && npm install

# 1) 登入
npx wrangler login

# 2) 建 D1，並把回傳的 database_id 填進 wrangler.jsonc 的 d1_databases[0].database_id
npx wrangler d1 create ehr-104

# 3) 套用 schema（本地 + 遠端）
npm run db:migrate:local
npm run db:migrate:remote

# 4) 設定機密（會互動式輸入值）
npx wrangler secret put ENCRYPTION_KEY            # 64-char hex（沿用原本那把，DB 才解得開）
npx wrangler secret put JWT_SECRET                # 沿用原本那串，舊 token 才有效
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put COMPANY_CONFIG_JSON       # 把原 config/104.config.json 整包貼上（選填）

# 5) build 前端 SPA（在 repo 根目錄；輸出 dist/，wrangler assets 指向 ../dist）
cd .. && npm run build && cd cf

# 6) 部署
npm run deploy
```

本地開發：`npm run dev`（`wrangler dev`，D1/DO/cron 都有本地模擬）。

### 從 Postgres 搬資料到 D1（保留既有綁定）

用內附腳本（在 repo 根目錄跑，那裡已有 `pg` 相依；腳本只讀 PG、印 SQL，不碰 `.env`）：

```bash
# repo 根目錄
DATABASE_URL="postgresql://user:pass@host:5432/db" node scripts/migrate-pg-to-d1.mjs > cf/d1-import.sql
cd cf && npx wrangler d1 execute ehr-104 --remote --file=d1-import.sql
```

腳本會處理：日期→ISO 字串、`Delegation.active` boolean→0/1、保留主鍵 id、校正 autoincrement。
`encryptedToken`/`iv` 原封搬過去（加密格式相容）→ **使用者不需重新綁定**。

### ⚠️ 匯入後必做：補登 DO alarm

舊系統的排程計時器在 Go 記憶體裡；資料匯到 D1 後只有資料列、沒有 alarm，不補登則既有預約
打卡不會觸發。先 `wrangler secret put ADMIN_SECRET`，部署後呼叫一次：

```bash
curl -X POST https://104.chihualu.com/api/admin/backfill-alarms -H "X-Admin-Secret: <你的 ADMIN_SECRET>"
# 回 { success:true, total, registered, failed }
```

此端點只對「未來的 PENDING」任務重登 alarm；過期的留給每日 cron 標 EXPIRED。

## 機密 / 環境變數

| 名稱 | 必填 | 說明 |
|---|---|---|
| `ENCRYPTION_KEY` | ✅ | 64-char hex（32 bytes）。**務必沿用原本的**，否則既有 `encryptedToken` 解不開 |
| `JWT_SECRET` | ✅ | 沿用原本的，既有 7 天 JWT 才繼續有效 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 推播用 | 月檢查 / 排程通知 |
| `LINE_CHANNEL_SECRET` | webhook 用 | `/callback` 簽章驗證；未設則略過驗證（Dev） |
| `COMPANY_CONFIG_JSON` | 選填 | 原 `104.config.json` 整包；未設用內建 default |

## 對抗式審查（已做）

整包經過 10 個模組的多代理對抗式審查（reviewer 比對原始↔移植，再經 verifier 查證）。
確認並**已修正**的問題：
- 🔴 **`schedule/cancel` 越權拆 alarm**：原本任何登入者猜序號 taskId 就能刪掉別人的 DO alarm
  （對方排程靜默不觸發）。已改為 ownership 成立才拆 alarm、否則回 404。
- 🟠 **缺啟動期 secret 驗證**：jose 會接受空金鑰 → 忘記設 `JWT_SECRET` 等於任何人可偽造 token。
  已在 fetch/scheduled 進入點加 `assertEnv`（缺/弱 secret 直接 500），並在 jwt 簽/驗加防線。
- 🟠 **月曆 403 行為**：已讓 `getEmployeeCalendarList`/`getSubordinateCalendarList` 只把 403 往外拋
  （觸發自動解綁）、其餘錯誤吞成 `[]`（與原版一致）；`getTeamAttendance` 的 403 處理對齊個人考勤。
- 🟡 **`schedule/create` 韌性**：DO alarm 登記改 fire-and-forget（失敗只記 log），不再因單一 DO
  失敗中斷整批、留下無 alarm 的列。
- 🟡 **CSP**：已用 `public/_headers`（Vite 會複製到 `dist/`）把原 helmet 的 CSP 1:1 搬過來。

## 尚待補強（follow-up，非阻斷）

1. **Rate limiting**（唯一刻意留作平台層的項目）：原本用 `express-rate-limit`（/bind 5 次/15 分、
   其餘 100/15 分）。Workers 多 isolate 無法共享記憶體計數器，硬移植反而失效，所以**正解是
   在 Cloudflare 後台設 Rate Limiting Rule（WAF）**：`/api/bind` 設 5/15min、`/api/*` 設 100/15min。
   若要程式內做，可用 Durable Object 計數器依 `CF-Connecting-IP` 限流（已有 DO binding 可重用）。
2. **DO 方案確認**：SQLite-backed Durable Objects 自 2025 起在免費方案可用；若帳號方案不支援，
   排程改用 Cron Triggers 分鐘級輪詢（會犧牲「秒級自然打卡」精度）。

## 注意事項（移植時的陷阱）

- **時區**：排程隨機時間在 `schedule/create` 明確帶 `+08:00`（台北）；月檢查年月、通知時間
  都用 `Asia/Taipei`。Workers runtime 是 UTC，不寫死時區會差 8 小時。
- **Connection: close 收尾**：`http104` 對 workerd「Network connection lost」做了容錯（已讀到
  bytes 就視為正常結束）。詳見 `src/lib/http104.ts` 註解。
- **104 session 靠 token 不靠 cookie**：登入回的 `ReturnObject` 是 key token，帶在每次 body；
  只有薪資驗證等少數端點才回 set-cookie。
