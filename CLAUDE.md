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
npm run dev:server           # server only — nodemon + tsx, watches src/server
npm run dev:client           # Vite client only
npm run build                # Vite build → dist/ (CLIENT ONLY; server is never compiled)
npm run start                # production server: tsx src/server/index.ts (no build step)

# Go scheduler microservice (separate process, separate module)
cd src/scheduler-go && go run .      # or: go build -o scheduler .

# Full stack (app + Go scheduler + Postgres)
docker compose up --build
```

**There is no test runner.** `npm test` intentionally errors. `test/api-test.ts` and `test-parse-leave.ts` are ad-hoc scripts — run a single one directly with `tsx test/api-test.ts`.

**Port gotcha (read before running locally):** the values are inconsistent across the repo. `src/server/index.ts` defaults to `PORT || 3001`, but `vite.config.ts` proxies `/api` → `http://localhost:3000`, and the client itself serves on **3002** (not Vite's usual 5173). For local dev to work you must set `PORT=3000` in `.env` (as `.env.example` already does) so the Vite proxy target matches the server. Inside Docker the app listens on 3000 and the Go scheduler on 4000.

## Architecture: three processes, one database

This is **not** a single Node app. `docker-compose.yml` runs three services that must agree on the database schema and on two callback URLs:

| Service | Stack | Role |
|---|---|---|
| `app` | Node 20 / Express 5 / Prisma | Serves the React SPA + all `/api` routes. **Does every actual 104 API call.** |
| `scheduler` | Go 1.25 / Gin / pgx | In-memory timer engine for scheduled check-ins. **Never calls 104 itself** — it only fires timers and calls back into Node. |
| `db` | PostgreSQL 18 | Shared. Schema is owned by Prisma; Go reads the same tables with raw SQL. |

`prisma/schema.prisma` is the single source of truth for the DB. The Go service reads tables with **quoted camelCase identifiers** (`"ScheduledTask"`, `"scheduledAt"`) because Prisma generates them that way, and strips `?schema=public` from `DATABASE_URL` because pgx rejects it (see `src/scheduler-go/db/db.go`).

### The scheduled check-in flow (the subtle part — crosses all three services)

Understanding this requires reading `hr.controller.ts`, `scheduler/manager.go`, and `hr.service.ts` together:

1. Client → `POST /api/schedule/create`. Node (`HRController.createSchedules`) writes `ScheduledTask` rows, **randomizing the execution time within the user's requested range and jittering the GPS coords ~±10 m** so records look organic. It then fires `notifyGoScheduler(taskId)` → `POST {SCHEDULER_URL}/tasks/sync`.
2. Go (`TaskManager.SyncTaskFromDB`) reads the row and registers an in-memory `time.AfterFunc` timer — **only if the task is `PENDING` and falls within the current calendar month.** Future-month tasks are deliberately not held in memory.
3. When the timer fires, Go calls back → `POST {NODE_SERVER_URL}/api/internal/execute-task` with `{taskId}` (with a 3× retry).
4. Node (`HRService.executeScheduledTask`, routed via `/api/internal/execute-task`) does the real `InsertCardData` 104 call, updates task status, writes a `UsageLog`, and pushes a LINE notification.

Cancel / cancel-all also call `notifyGoScheduler` so Go drops the timer. On startup and on the 1st of each month at 01:00, Go bulk-loads that month's PENDING tasks; a daily cleaner expires past-due PENDING tasks and deletes CANCELLED ones.

**The Node side also has a `SchedulerService` (`scheduler.service.ts`), but its per-minute `processTasks` is legacy and unused** — `init()` only wires the monthly attendance-check cron (25th, 10:00). All real task timing lives in Go now.

Cross-service env vars: `SCHEDULER_URL` (Node→Go, default `http://localhost:4000`) and `NODE_SERVER_URL` (Go→Node, default `http://localhost:3000`).

### The 104 integration layer

`src/server/adapters/hr104.adapter.ts` is the **only** place that talks to 104. It is a static class wrapping the legacy ASMX/SOAP endpoint, which returns **XML-wrapped JSON**: every call does `XMLParser.parse(...)` then `JSON.parse(result.FunctionExecResult.ReturnObject)` and reads `.Tables[0].Rows`. Auth is a `key` token plus session cookies captured at login. `groupUBINo === 'TEST'` short-circuits to mock responses for dev. When adding a 104 feature, add the raw call here and keep parsing/business logic in the corresponding `services/*.service.ts`.

### Auth & secrets model

- **104 credentials** are AES-256-CBC encrypted (`src/server/encryption.ts`) and stored in `UserBinding` (`encryptedToken` + `iv` + `cookies`). App sessions are **JWT** (7-day, `auth.service.ts`).
- `ENCRYPTION_KEY` (64-char hex = 32 bytes) and `JWT_SECRET` are **mandatory** — the server calls `process.exit(1)` on startup if either is missing/invalid.
- `authenticate` middleware (`auth.middleware.ts`) **enforces JWT** — a missing/invalid token returns 401 (the old permissive pass-through was removed). The frontend stores the JWT (`src/client/auth.ts`), attaching it via an axios request interceptor and via `authHeader()` for the `fetch`-based streaming endpoints. Public endpoints (`bind`/`check-binding`/`companies`/`internal/execute-task`) sit *before* `router.use(authenticate)` and stay open.
- **Delegation (act-as / proxy):** `req.user` (from JWT) is the *actor*; the `lineUserId` in the request body/query is the *target*. `HRController.canAct` → `DelegationService.canActAs(actor, target)` gates every HR endpoint (self, or an active row in the `Delegation` table). **Salary endpoints are exempt — self-only, never proxyable.** `UsageLog.actorUserId` records who actually acted. The frontend "代理模式" (`DelegatePage` + `effectiveLineUserId` in `App.tsx`) swaps the *target* `lineUserId` while the JWT stays the actor's; salary/settings pages always pass self.
- The internal `/api/internal/execute-task` endpoint's localhost IP allowlist is still **commented out** (effectively open) — known caveat if hardening.

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
- After changing `prisma/schema.prisma`, run `npx prisma migrate dev` **and** restart the Go scheduler (it caches the schema shape in raw SQL).
- CI (`.github/workflows/docker-image.yml`) builds and pushes a Docker image to GHCR on push to `main`/`master` and on `v*.*.*` tags — it does not run tests or lint.

> Note: `GEMINI.md` is partially stale — it states the Go backend was removed, but it has since been re-introduced as the `scheduler` service described above. Trust this file and the code over `GEMINI.md` on the scheduler.
