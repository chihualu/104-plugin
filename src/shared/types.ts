// API Response 格式
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

// 綁定請求 Payload
export interface BindPayload {
  lineUserId: string;
  companyId: string; // 統編
  empId: string;     // 員編
  password: string;  // 密碼
}

// 檢查綁定狀態 Response
export interface BindingStatus {
  isBound: boolean;
  empId?: string;
}

// 打卡請求 Payload
export interface CheckInPayload {
  lineUserId: string;
  dates: string[]; // ['2026-01-20', '2026-01-21']
  timeStart: string; // '09:00'
  timeEnd: string;   // '18:00'
  reason: string;
}
