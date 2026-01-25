# 104-plugin 架構優化建議書 (Infrastructure & Architecture Suggestion)

## 1. 後端架構重構：採用分層架構 (Layered Architecture)

**現狀觀察：**
目前 `src/server/index.ts` 承擔了太多責任。它同時包含了 HTTP 路由定義、請求驗證 (Zod)、業務邏輯、資料庫存取 (Prisma) 以及外部 API 呼叫 (104 Service)。

**建議方案：**
應將後端重構為 **Controller-Service-Repository** 三層架構：
1.  **Routes / Controllers (介面層)**：只負責處理 HTTP 請求、解析參數、呼叫 Service、回傳 Response。
2.  **Services (業務邏輯層)**：處理核心邏輯（如：計算薪資摘要、判斷打卡規則）。此層應與 HTTP 框架解耦。
3.  **Adapters / Utils (基礎設施層)**：
    *   將 `HR104Service` 封裝為獨立的 Adapter，專門處理與外部系統的通訊。
    *   將 Prisma 呼叫封裝在 Repository 層或 Service 層中，與 Routing 分離。

## 2. 外部系統整合：建立防腐層 (Anti-Corruption Layer, ACL)

**現狀觀察：**
系統高度依賴 `HR104Service` 解析 HTML/XML。一旦 104 改版，整個 Application 就會失效。

**建議方案：**
1.  **明確定義內部模型 (Internal Domain Model)**：定義系統內部的資料結構，而非直接透傳外部原始資料。
2.  **Adapter Pattern**：在 `HR104Service` 內處理所有髒亂的 HTML 解析，對外僅回傳乾淨的、強型別的物件。
3.  **錯誤處理與熔斷機制 (Circuit Breaker)**：實作 Timeout 機制，並定義標準化的外部服務錯誤，避免外部系統延遲拖垮整體 API 效能。

## 3. 身份驗證與授權：從 Binding 轉向 Session/Token

**現狀觀察：**
目前 API 驗證過於依賴前端傳入的 `lineUserId`。在資安架構上，這屬於弱驗證，容易產生 IDOR 風險。

**建議方案：**
實作標準的 JWT (JSON Web Token) 驗證機制：
1.  **登入/綁定流程**：驗證成功後簽發 JWT，包含加密的識別資訊與過期時間。
2.  **API 請求**：前端所有後續請求皆需在 Header 帶上 `Authorization: Bearer <token>`。
3.  **安全性提升**：後端 Middleware 僅需驗證 Token 簽章，無需頻繁查詢 DB，且可徹底杜絕越權存取問題。

## 4. 可觀測性 (Observability) 與日誌策略

**現狀觀察：**
目前僅使用 `console.log`，在容器化環境中難以進行自動化分析與高效除錯。

**建議方案：**
1.  **導入結構化日誌 (Structured Logging)**：使用 `pino` 或 `winston` 輸出 JSON 格式日誌。
2.  **追蹤機制**：為每個 Request 加入 `traceId`，方便追蹤單次請求的完整歷程。
3.  **集中式錯誤處理**：使用 Express Global Error Handling Middleware，確保 API 回傳格式一致且不洩漏敏感堆疊資訊。

## 5. 效能與組態管理

**建議方案：**
1.  **快取策略 (Caching Strategy)**：針對薪資單、請假餘額等不常變動的資料，引入 `Redis` 或 `LRU Cache`（設定 5~10 分鐘 TTL），提升響應速度並降低被外部系統封鎖 IP 的風險。
2.  **組態管理**：對於 `104.config.json` 等動態規則，考慮移入資料庫管理，並提供 Admin API 進行即時調整。

---
**建議優先執行順序：**
1. **Phase 1**: 拆解 `index.ts` 並導入結構化日誌。
2. **Phase 2**: 實作 JWT 驗證機制與強型別 Adapter。
3. **Phase 3**: 導入快取機制優化效能。
