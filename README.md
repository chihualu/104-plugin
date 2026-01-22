# 104 eHR Assistant (LIFF App)

這是一個專為 **104 eHR 系統** 打造的優化工具，旨在提升員工與主管的操作體驗。透過 LINE LIFF 整合，提供更現代化、更快速的自動化操作介面。

## 🚀 核心功能

*   **LINE Login 整合**: 自動辨識使用者身分，無需重複登入。
*   **統編自動查詢**: 輸入統編即可動態選擇所屬公司，降低輸入錯誤。
*   **批次補打卡申請**: 
    *   支援日期多選（可跳選非連續日期）。
    *   自訂上班、下班時間。
    *   一鍵發送多筆申請單，並自動加入間隔以符合 API 限制。
*   **自動表單簽核**:
    *   自動抓取所有分類的待簽核單據。
    *   支援全選與一鍵批次核准。
*   **安全加密**: 所有 104 Token 均採 AES-256-CBC 加密存儲於資料庫中。
*   **極速入口**: 支援透過 NFC 或 QR Code 直接開啟 LIFF 進行快速打卡流程。

## 🛠 技術堆疊

*   **前端**: React 18, TypeScript, Vite, Ant Design Mobile
*   **後端**: Node.js (Express), tsx
*   **資料庫**: PostgreSQL
*   **ORM**: Prisma
*   **容器化**: Docker, Docker Compose
*   **SDK**: @line/liff

## 📦 快速開始

### 1. 環境準備
請確保您的機器已安裝：
*   Docker & Docker Compose
*   Node.js 20+ (用於本機開發)

### 2. 設定環境變數
將 `.env.example` 複製為 `.env` 並填入您的資訊：
```bash
cp .env.example .env
```
*   `LIFF_ID`: 您的 LINE LIFF ID。
*   `ENCRYPTION_KEY`: 64 字元的十六進位字串（用於加密 Token）。

### 3. 啟動服務 (Docker)
使用 Docker 一鍵啟動全環境：
```bash
docker-compose up --build -d
```

啟動後即可透過 `http://localhost:3000` (或您的 Cloudflare Tunnel 網域) 進行存取。

### 4. 資料庫遷移 (第一次啟動需執行)
```bash
npx prisma migrate dev
```

## 📝 授權協議

本專案採用 MIT 授權協議。詳見 [LICENSE](./LICENSE) 檔案。
