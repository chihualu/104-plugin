# 104 eHR Assistant (LIFF App)

這是一個專為 **104 eHR 系統** 打造的優化工具，旨在提升員工與主管的操作體驗。透過 LINE LIFF 整合，提供更現代化、更快速的自動化操作介面。

## ✨ 全新現代化 UI/UX 升級 (v1.3.0+)

*   **奶茶色系視覺設計**: 採用溫暖舒適的奶茶與咖啡色調，搭配抹茶綠輔助色，打造專業且具親和力的操作環境。
*   **全螢幕細節視窗**: 薪資明細與打卡詳情改用自定義全螢幕 Overlay 顯示，解決傳統 Modal 在手機上的顯示與捲動問題。
*   **高對比排版**: 全域加粗 Form Label 與導覽列標題，文字層次分明，確保在行動裝置上的極佳閱讀性。
*   **統一載入體驗**: 實作全螢幕模糊效果的 Loading Overlay，提供更流暢的頁面切換反饋。

## 🚀 核心功能

*   **LINE Login 整合**: 自動辨識使用者身分，無需重複登入。
*   **預約自動打卡 (新)**: 
    *   支援在指定日期範圍內隨機時間自動打卡。
    *   **GPS 座標隨機化**: 自動在目標半徑 10 公尺內隨機微調座標，讓打卡紀錄更顯自然。
*   **即時 GPS 打卡**: 
    *   自動定位目前位置，一鍵完成 104 即時打卡。
*   **批次補打卡**: 
    *   支援日期多選、自訂上下班時間，一鍵自動批次發送申請。
*   **高效表單簽核**:
    *   自動匯總跨類別待簽單據，支援全選與一鍵批次快速核准。
*   **優化薪資查詢**: 
    *   具備二段式安全驗證。
    *   **結構化明細**: 將原始 HTML 薪資單自動解析為 JSON 結構，區分應發、應扣項目並以色彩標註。
*   **視覺化假勤餘額**: 
    *   自動解析複雜表格，以簡潔的列表顯示各類假別之剩餘與總額。
*   **系統使用統計**: 
    *   管理員可按公司維度即時監控系統使用狀況。

## 🛠 技術堆疊

*   **前端**: React 18, Vite, Ant Design Mobile (SaaS UI 精修)
*   **後端**: Node.js (Express), Prisma (PostgreSQL), Cheerio (HTML 解析)
*   **排程**: Node-Cron (自動化預約任務)
*   **容器化**: Docker, Docker Compose

## 🤖 LINE Messaging API 設定指南 (啟用出勤通知)

為了讓系統能主動發送**出勤異常通知**與**打卡結果通知**，您需要到 LINE Developers Console 進行設定：

### 1. 建立 Messaging API Channel
1.  前往 [LINE Developers Console](https://developers.line.biz/)
2.  建立一個新的 Channel，類型選擇 **Messaging API**。
3.  在該 Channel 的 **Messaging API** 頁籤下，取得 **Channel Access Token (Long-lived)**。
4.  將 Token 填入專案的 `.env` 檔案中：
    ```env
    LINE_CHANNEL_ACCESS_TOKEN=your_token_here
    VITE_LINE_BOT_ID=@your_bot_id  (例如: @123abcde)
    ```

### 2. 連結 LINE Login 與 Messaging API (Linked OA)
此步驟是為了讓使用者在**登入**時，能順便**加入官方帳號好友**。

1.  在 LINE Developers Console 點選您的 **LINE Login Channel**。
2.  進入 **Basic settings** (基本設定) 頁籤，往下捲找到 **Linked OA**。
3.  點選 **Edit**，在選單中選擇您剛剛建立的 **Messaging API Channel**。
4.  點選 **Update**。

### 3. 設定加入好友選項 (Friendship option)
1.  維持在 **LINE Login Channel** 的 **Basic settings** 頁面。
2.  找到 **Friendship option**。
3.  將其設定為 **Aggressive** (強制/主動)。
    *   這樣使用者在 LIFF 登入授權時，會預設勾選「加入官方帳號好友」，確保後續能收到通知。

## 📄 授權條款

本專案採用 MIT 授權條款。