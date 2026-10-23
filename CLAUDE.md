# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A LINE LIFF (Front-end Framework) app that wraps and automates the **104 Enterprise eHR** system (`pro104.provision.com.tw`). Employees bind their 104 credentials once via LINE, then do GPS check-in, scheduled/batch check-in, salary lookup, leave balance, and form approval from a mobile web UI. Most UI strings, commit messages, and the README are in Traditional Chinese.

## Commands

```bash
npm install
npx prisma generate          # regenerate Prisma client after editing prisma/schema.prisma
npx prisma migrate dev       # create/apply a migration locally (requires running PostgreSQL)

npm run dev                  # run Node server + Vite client concurrently (primary dev command)
npm run dev:server           # server only — tsx watch (reloads on imported file changes)
npm run dev:client           # Vite client only
npm run build                # Vite build → dist/ (CLIENT ONLY; server is never compiled)
npm run start                # production server: tsx src/server/index.ts (no build step)

# Full stack (app + Postgres, optionally + Cloudflare Tunnel)
docker compose up --build          # app + db + tunnel (tunnel needs TUNNEL_TOKEN)
docker compose up -d app db        # without the tunnel

# One-off: pull data back from Cloudflare D1 into local Postgres
node scripts/migrate-d1-to-pg.mjs > pg-import.sql
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < pg-import.sql
```

**There is no test runner.** `npm test` intentionally errors. `test/api-test.ts` and `test-parse-leave.ts` are ad-hoc scripts — run a single one directly with `tsx test/api-test.ts`.

**Port gotcha (read before running locally):** the values are inconsistent across the repo. `src/server/index.ts` defaults to `PORT || 3001`, but `vite.config.ts` proxies `/api` → `http://localhost:3000`, and the client itself serves on **3002** (not Vite's usual 5173). For local dev you must set `PORT=3000` in `.env` (as `.env.example` already does) so the Vite proxy target matches the server. Under Docker this is no longer a footgun: `docker-compose.yml` sets `PORT=3000` in the service `environment:` block, which overrides whatever `.env` says.

## Architecture: one Node process + Postgres

`docker-compose.yml` runs two services (plus an optional Cloudflare Tunnel sidecar):

| Service | Stack | Role |
|---|---|---|
| `app` | Node 20 / Express 5 / Prisma | Serves the React SPA + all `/api` routes, **does every 104 API call, and owns all scheduling in-process.** |
| `db` | PostgreSQL 18 | Schema owned by Prisma. |
| `tunnel` | `cloudflare/cloudflared` | Optional. Publishes `app:3000` to a public hostname without opening a port on the NAS. Skip with `docker compose up app db`. |

> **Historical note:** there used to be a third `scheduler` service written in Go that held `time.AfterFunc` timers in memory and called back into Node over HTTP, and later an all-Cloudflare port (`cf/`) that used Durable Object alarms. Both are gone from the main path — timing now lives in `SchedulerService`. Ignore any doc or comment that mentions `SCHEDULER_URL`, `NODE_SERVER_URL`, `/api/internal/execute-task`, or `src/scheduler-go/`.

### The scheduled check-in flow

All in `src/server`: read `hr.controller.ts` and `scheduler.service.ts` together.

1. Client → `POST /api/schedule/create`. `HRController.createSchedules` writes `ScheduledTask` rows, **randomizing the execution time within the user's requested range and jittering the GPS coords ~±10 m** so records look organic, then calls `SchedulerService.onTaskCreated(id, scheduledAt)`.
2. `SchedulerService` runs a **rolling window**: every 60 s it loads PENDING tasks due within the next 5 minutes (plus any that are past-due within a 10-minute catch-up grace, so a restart doesn't drop punches) and arms a precise `setTimeout` for each. A dedup map prevents double-arming. Tasks further out need no special handling — a later scan picks them up, so **cross-month schedules just work**.
3. On fire, `HRService.executeScheduledTask(taskId, { deferFailure })` does the real `InsertCardData` call, updates status, writes a `UsageLog`, and pushes a LINE notification.

**Retry policy (important — this is why scheduled check-ins were being missed):** 104's endpoint intermittently refuses connections. `executeScheduledTask` accepts `deferFailure`; when set and the error is a **connection-phase** failure (`ECONNREFUSED`/`ETIMEDOUT`/… — i.e. not a single byte was sent, so re-punching cannot double-record), it re-throws without marking the task FAILED and `SchedulerService` re-arms with backoff **30 s → 60 s → random ~60 s ×3**. Anything that could have reached 104 is never retried. Once retries are exhausted the task is marked FAILED **and the user gets a LINE message** — silent failures were the reason missed punches went unnoticed until month-end reconciliation.

Cancel / cancel-all call `SchedulerService.cancel` / `cancelMany` to drop timers. Two `node-cron` jobs (both pinned to `Asia/Taipei` in code, not reliant on host TZ): daily 00:00 cleanup (expire past-due PENDING older than 1 h, delete CANCELLED) and the 25th 10:00 monthly attendance check.

### The 104 integration layer

`src/server/adapters/hr104.adapter.ts` is the **only** place that talks to 104. It is a static class wrapping the legacy ASMX/SOAP endpoint, which returns **XML-wrapped JSON**: every call does `XMLParser.parse(...)` then `JSON.parse(result.FunctionExecResult.ReturnObject)` and reads `.Tables[0].Rows`. Auth is a `key` token plus session cookies captured at login. `groupUBINo === 'TEST'` short-circuits to mock responses for dev. When adding a 104 feature, add the raw call here and keep parsing/business logic in the corresponding `services/*.service.ts`.

### Auth & secrets model

- **104 credentials** are AES-256-CBC encrypted (`src/server/encryption.ts`) and stored in `UserBinding` (`encryptedToken` + `iv` + `cookies`). App sessions are **JWT** (7-day, `auth.service.ts`).
- `ENCRYPTION_KEY` (64-char hex = 32 bytes) and `JWT_SECRET` are **mandatory** — the server calls `process.exit(1)` on startup if either is missing/invalid.
- `authenticate` middleware (`auth.middleware.ts`) **enforces JWT** — a missing/invalid token returns 401 (the old permissive pass-through was removed). The frontend stores the JWT (`src/client/auth.ts`), attaching it via an axios request interceptor and via `authHeader()` for the `fetch`-based streaming endpoints. Public endpoints (`bind`/`check-binding`/`companies`/`internal/execute-task`) sit *before* `router.use(authenticate)` and stay open.
- `INTERNAL_API_SECRET` now only guards `/api/internal/monthly-check` (manual ops trigger). The `execute-task` endpoint it used to protect is gone.
- **Delegation (act-as / proxy):** `req.user` (from JWT) is the *actor*; the `lineUserId` in the request body/query is the *target*. `HRController.canAct` → `DelegationService.canActAs(actor, target)` gates every HR endpoint (self, or an active row in the `Delegation` table). **Salary endpoints are exempt — self-only, never proxyable.** `UsageLog.actorUserId` records who actually acted. The frontend "代理模式" (`DelegatePage` + `effectiveLineUserId` in `App.tsx`) swaps the *target* `lineUserId` while the JWT stays the actor's; salary/settings pages always pass self.

### Frontend

`src/client/App.tsx` is a **single-component state machine** — despite `react-router-dom` being a dependency, there is no router. Navigation is `useState<AppState>` + `history.pushState` with URL hashes; pages are lazy-loaded. LIFF initializes on mount, falling back to **mock mode** (`U_MOCK_USER_FOR_DEV`) when `VITE_LIFF_ID` is unset or the placeholder. A global Axios interceptor redirects 403 → BINDING page.

Streaming endpoints (`/api/check-in`, `/api/audit/approve`) respond with **NDJSON** (`application/x-ndjson`) — the server `res.write`s one JSON progress object per line via a `progressCallback`, not a single JSON body.

### Per-company configuration

`config/104.config.json` (gitignored; copy from `config/104.config.example.json`) maps each company (`groupUBINo` + `companyID`, `*` = wildcard) to its check-in worksheet ID, the keyword used to auto-find that worksheet, the display name, and a default GPS location. Loaded once at startup by `CompanyService`. Unknown companies fall back to live lookup via the 104 company-list API (LRU-cached 24 h).

## Conventions

- **Server runs through `tsx`, never compiled** — even in the Docker production image (`npm run start` = `tsx src/server/index.ts`). Only the client is built. `package.json` is `type: commonjs` but source uses ESM imports; tsx handles the transpile.
- Path aliases: `@/*` → `src/*` (Vite), `@server/*` / `@client/*` (tsconfig). `@` is mainly a client convention.
- Logging is **Pino** (`src/server/utils/logger.ts`); use the structured `logger`, not `console.log`.
- Validation is **Zod** schemas in `src/server/schemas/api.schema.ts`, parsed at the top of each controller.
- After changing `prisma/schema.prisma`, run `npx prisma migrate dev`. The container runs `prisma migrate deploy` on start, so `docker compose up --build` applies migrations automatically.
- `Dockerfile.server` **must** set `NODE_ENV=production` in the runtime stage: `logger.ts` uses a `pino-pretty` transport when it isn't production, but `pino-pretty` is a devDependency that `npm ci --only=production` never installs — without it the container crashes on boot.
- The `db` volume mounts at `/var/lib/postgresql`, **not** `/var/lib/postgresql/data`. The `postgres:18+` images changed this convention; the old path fails to start.
- CI (`.github/workflows/docker-image.yml`) builds and pushes a Docker image to GHCR on push to `main`/`master` and on `v*.*.*` tags — it does not run tests or lint.

> Note on `cf/`: that directory holds a complete all-Cloudflare port (Workers + Hono + D1 + Durable Objects). It is **no longer the deployment target** — Cloudflare's edge could not reach 104 reliably (~15 % of connections failed, measured against a same-moment 20/20 success rate from a Taiwan line), which is what drove the move back to self-hosting. Keep it for reference; don't treat it as live.
