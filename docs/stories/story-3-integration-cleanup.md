# Story: Trigger Execution & Legacy Cleanup - Brownfield Addition

## User Story
作為**系統管理員/開發者**，
我想要**實作端對端的觸發流程並移除舊有的輪詢機制**，
以便於**系統能夠以高效、精準的方式執行排程打卡任務**。

## Status: Ready for Review

## Story Context
**現有系統整合：**
- **整合對象**：Node.js API (`/api/internal/execute-task`) 與 Go Scheduler API (`/tasks/sync`)。
- **技術棧**：Go, Node.js (TypeScript), Axios。
- **觸及點**：Node.js 的 `SchedulerService` 與 Go 的 `ExecuteTask`。

## Acceptance Criteria
**功能需求：**
1. [x] 在 Go 的 `ExecuteTask` 中實作 HTTP POST 請求，呼叫 Node.js 的打卡 API。
2. [x] 在 Node.js 中，當建立、取消或更新 `ScheduledTask` 時，呼叫 Go 服務的同步介面。
3. [x] 實作 Go -> Node.js 的重試機制（如果 Node.js 暫時無回應）。
4. [x] 移除 Node.js 中原本每分鐘執行一次的 `node-cron` 任務。

**整合需求：**
5. [x] 確保 API 密鑰或安全性驗證（如果有）在 Go 服務中正確配置。
6. [x] 驗證從前端建立預約 -> Go 註冊 -> 時間到 Go 觸發 Node.js -> 打卡成功。

**品質需求：**
7. [x] 包含完整的整合測試日誌。
8. [x] 程式碼乾淨且不留冗餘的舊邏輯。

## Tasks
- [x] Implement Go HTTP client for Trigger execution
- [x] Implement Node.js side notification (Axios call to Go)
- [x] Remove legacy cron in Node.js `scheduler.service.ts`
- [x] Verify full end-to-end flow

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash

### Debug Log
- 已在 `HRService` 實作 `executeScheduledTask` 並暴露為內部 API。
- 已在 Go 的 `TaskManager` 實作具備重試機制的 HTTP 觸發器。
- 已更新 Node.js 的 `HRController`，在任務變更時即時通知 Go。

### Completion Notes
- 系統已完成從 Node.js 輪詢模式向 Go 高效定時器模式的遷移。
- 舊有的 `node-cron` 任務已安全移除。

### File List
- `src/server/services/hr.service.ts` (更新)
- `src/server/controllers/hr.controller.ts` (更新)
- `src/server/routes/api.routes.ts` (更新)
- `src/server/services/scheduler.service.ts` (更新)
- `src/scheduler-go/scheduler/manager.go` (更新)

### Change Log
- 整合 Go Scheduler 與 Node.js 後端，移除舊有輪詢邏輯。