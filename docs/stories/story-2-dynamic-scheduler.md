# Story: Dynamic Scheduler Implementation & Internal API - Brownfield Addition

## User Story
作為**系統管理員/開發者**，
我想要**在 Go 服務中實作高效的計時器管理與內部 API**，
以便於**能夠精準觸發排程任務，並即時回應來自 Node.js 的任務變更通知**。

## Status: Ready for Review

## Story Context
**現有系統整合：**
- **整合對象**：Node.js Server（透過 HTTP 通知）。
- **技術棧**：Go (Golang), `Gin` (HTTP Server), Go Timers。
- **觸及點**：提供 `POST /tasks/sync` 接口。

## Acceptance Criteria
**功能需求：**
1. [x] 實作一個任務管理器 (Task Manager)，能夠註冊、更新與取消 Go Timers。
2. [x] 在服務啟動時，將所有從 DB 讀取的 PENDING 任務註冊到計時器中。
3. [x] 使用 `Gin` 框架建立一個 HTTP Server，監聽內部連接埠（預設 4000）。
4. [x] 實作 `POST /tasks/sync` 接口，接收 `{ "taskId": number }` 並重新從 DB 同步該任務。

**整合需求：**
5. [x] 確保任務觸發時能夠在 Console 輸出日誌（暫不執行實際 API 呼叫，留待 Story 3）。
6. [x] 支援處理超過 200 個以上的計時器。

**品質需求：**
7. [x] 實作併發安全（使用 `sync.Map` 管理計時器）。
8. [x] 包含適當的錯誤處理（如任務已過期、ID 不存在等）。

## Tasks
- [x] Install `Gin` dependency
- [x] Implement `Manager` struct to handle `time.Timer` mappings
- [x] Set up `Gin` router and internal API
- [x] Implement synchronization logic (DB -> Timer)
- [x] Test dynamic timer registration via API

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash

### Debug Log
- 使用 `sync.Map` 確保多執行緒安全。
- 計時器使用 `time.AfterFunc` 實作，輕量且高效。
- `Gin` 伺服器已成功監聽 4000 端口。

### Completion Notes
- 核心排程邏輯已完成。
- 已支援透過 HTTP API 即時同步單一任務。
- 啟動時會自動加載所有 PENDING 任務。

### File List
- `src/scheduler-go/scheduler/manager.go`
- `src/scheduler-go/api/server.go`
- `src/scheduler-go/main.go` (更新)

### Change Log
- 實作高效任務管理系統與動態同步 API。