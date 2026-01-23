# 104 eHR Assistant (LIFF App)

這是一個專為 **104 eHR 系統** 打造的優化工具，旨在提升員工與主管的操作體驗。透過 LINE LIFF 整合，提供更現代化、更快速的自動化操作介面。

## 🚀 核心功能

*   **LINE Login 整合**: 自動辨識使用者身分，無需重複登入。
*   **即時 GPS 打卡 (新)**: 
    *   自動抓取手機 GPS 座標並轉換為地址（供參考）。
    *   一鍵完成 104 即時打卡。
*   **補打卡申請**: 
    *   支援日期多選（可跳選非連續日期）。
    *   自訂上班、下班時間。
    *   一鍵批次發送申請單（間隔 0.5 秒）。
*   **表單簽核**:
    *   自動抓取所有分類的待簽核單據。
    *   支援全選與一鍵批次核准。
*   **薪資查詢 (新)**: 
    *   支援二段式安全驗證。
    *   按年份查詢歷史薪資單並顯示 HTML 詳情。
*   **假勤紀錄 (新)**: 
    *   在個人資訊頁面即時顯示各類假別（事假、病假、特休）之剩餘時數。
*   **使用統計 (新)**: 
    *   管理員可按公司維度查看系統使用總量。
*   **靈活配置**: 支援透過 `config/104.config.json` 客製化不同公司的表單 ID 與搜尋關鍵字。

## 🛠 技術堆疊

*   **前端**: React 18, Vite, Ant Design Mobile (Lazy Loading)
*   **後端**: Node.js (Express), Prisma (PostgreSQL)
*   **容器化**: Docker, Docker Compose

## 📦 快速開始

### 1. 設定環境變數
```bash
cp .env.example .env
cp config/104.config.example.json config/104.config.json
```

### 2. 啟動服務 (Docker)
```bash
docker-compose up --build -d
```

## 📝 授權協議

本專案採用 MIT 授權協議。