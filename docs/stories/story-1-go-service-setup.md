# Story: Go Service Setup & Database Integration - Brownfield Addition

## User Story
作為**系統管理員/開發者**，
我想要**建立一個基礎的 Go 服務並連結到現有的 PostgreSQL 資料庫**，
以便於**能夠開始讀取待執行的預約任務，為後續的排程邏輯打下基礎**。

## Status: Ready for Review

## Acceptance Criteria
**功能需求：**
1. [x] 初始化 Go 專案於 `src/scheduler-go`。
2. [x] 實作資料庫連線池，並讀取 `.env` 中的 `DATABASE_URL`。
3. [x] 建立一個映射 `ScheduledTask` 資料表的 Go Struct。
4. [x] 服務啟動時，查詢並在終端機輸出所有 `status = 'PENDING'` 的任務列表。

**整合需求：**
5. [x] 不修改現有的資料庫 Schema。
6. [x] 使用與 Node.js 相同的環境變數名稱（`DATABASE_URL`）。

**品質需求：**
7. [x] 包含基本的連線錯誤處理與重連機制。
8. [x] 程式碼結構符合 Go 慣例。

## Tasks
- [x] Initialize Go module in `src/scheduler-go`
- [x] Set up project structure (`main.go`, `db/`, `models/`)
- [x] Implement DB connection logic using `pgx/v5`
- [x] Implement Task model and query logic
- [x] Verify connection and data retrieval with a test run

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash

### Debug Log
- 修復了 `main.go` 中的 SQL 字串引號不對稱語法錯誤。
- 發現 Prisma 格式的 `DATABASE_URL` 包含 `schema=public` 參數會導致 `pgx` 報錯，已在 `db/db.go` 中實作過濾邏輯。

### Completion Notes
- 已建立基本的 Go 服務架構。
- 成功讀取並顯示資料庫中所有 PENDING 狀態的任務。

### File List
- `src/scheduler-go/go.mod`
- `src/scheduler-go/go.sum`
- `src/scheduler-go/main.go`
- `src/scheduler-go/db/db.go`
- `src/scheduler-go/models/task.go`

### Change Log
- 建立 Go 排程服務基礎建設。
- 實作 PostgreSQL 資料庫連線與任務查詢功能。
