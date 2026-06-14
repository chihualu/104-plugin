/**
 * 與 104 eHR（ASMX/SOAP，回 XML-wrapped JSON）唯一的對接層。
 * 由原 src/server/adapters/hr104.adapter.ts 移植：axios → connect() socket（http104）。
 * 行為盡量 1:1：相同 headers、相同 endpoint（含原本 GetComapnyList 的拼字）、相同解析。
 *
 * 與原版差異（刻意保留語意）：
 *   - axios 預設對 HTTP >= 400 會 throw 且帶 e.response.status；這裡用 Http104Error 重現，
 *     讓 service 端 `e.response?.status === 403`（token 失效自動解綁）邏輯不變。
 */

import { http104 } from '../lib/http104';
import { parseXml, isSuccess, unescapeHTML } from '../lib/xml';

const HOST = 'pro104.provision.com.tw';
const PORT = 8443;
const BASE_PATH = '/wfmobileweb/Service/eHRFlowMobileService.asmx';

export interface AuthParams {
  token: string;
  companyId: string; // groupUBINo
  internalId: string; // companyID
  empId: string; // account
  cookies?: string | null;
}

export class Http104Error extends Error {
  status: number;
  response: { status: number; data: string };
  constructor(status: number, data: string) {
    super(`104 HTTP ${status}`);
    this.name = 'Http104Error';
    this.status = status;
    this.response = { status, data };
  }
}

function headers(cookies?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    Origin: 'https://pro104.provision.com.tw:8443',
    Referer: 'https://pro104.provision.com.tw:8443/wfmobileweb/Default.aspx',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  };
  if (cookies) h['Cookie'] = cookies;
  return h;
}

/** POST 一個 endpoint。HTTP >= 400 視為錯誤（比照 axios），丟 Http104Error。 */
async function post(endpoint: string, params: URLSearchParams, cookies?: string | null) {
  const resp = await http104({
    method: 'POST',
    host: HOST,
    port: PORT,
    path: `${BASE_PATH}/${endpoint}`,
    headers: headers(cookies),
    body: params.toString(),
  });
  if (resp.status >= 400) throw new Http104Error(resp.status, resp.body);
  return resp;
}

function cookieFromSetCookies(setCookies: string[]): string {
  return setCookies.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

export class HR104Adapter {
  static async login(groupUBINo: string, companyID: string, empId: string, password: string) {
    if (groupUBINo === 'TEST') return { token: 'mock_test_token', cookies: '' };

    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);
    params.append('companyID', companyID);
    params.append('account', empId);
    params.append('credential', password);

    try {
      const resp = await http104({
        method: 'POST',
        host: HOST,
        port: PORT,
        path: `${BASE_PATH}/Login`,
        headers: headers(),
        body: params.toString(),
      });
      const jsonObj = parseXml(resp.body);
      const result = jsonObj.FunctionExecResult;

      if (result && isSuccess(result)) {
        const cookies = cookieFromSetCookies(resp.setCookies);
        return { token: String(result.ReturnObject), cookies };
      }
      throw new Error(result?.ReturnMessage || 'Login failed');
    } catch {
      throw new Error('External Service Error: Login failed');
    }
  }

  static async getCompanyList(groupUBINo: string) {
    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);
    const resp = await post('GetComapnyList', params); // 注意：原始端點即為此拼字
    const jsonObj = parseXml(resp.body);
    try {
      return JSON.parse(jsonObj.string).Tables[0].Rows;
    } catch {
      return [];
    }
  }

  static async getRequestWorksheets(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');

    const resp = await post('GetRequestListByWorksheet', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch {
      return [];
    }
  }

  static async getEmployeeCalendarList(auth: AuthParams, year: string, month: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('QUERY_YEAR', year);
    params.append('QUERY_MONTH', month);
    params.append('LANG', 'zh-tw');

    try {
      const resp = await post('GetEmployeeCalendarList', params, auth.cookies);
      const jsonObj = parseXml(resp.body);
      if (jsonObj.FunctionExecResult && jsonObj.FunctionExecResult.IsSuccess === false) return [];
      const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
      if (!rawJson) return [];
      const parsed = JSON.parse(rawJson);
      return parsed.Tables[0].Rows || [];
    } catch (e) {
      // 原版用 axios 把「所有」錯誤吞成 []；這裡只把 403（token 失效）往外拋，讓 service
      // 觸發自動解綁（原版那條 403 分支因 adapter 全面 catch 而形同死碼，這裡讓它生效）。
      // 其餘錯誤（500/網路…）一律吞成 []，與原版一致。
      if (e instanceof Http104Error && e.status === 403) throw e;
      return [];
    }
  }

  static async getSubordinateCalendarList(auth: AuthParams, year: string, month: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('QUERY_YEAR', year);
    params.append('QUERY_MONTH', month);

    try {
      const resp = await post('GetSubordinateCalendarList', params, auth.cookies);
      const jsonObj = parseXml(resp.body);
      if (jsonObj.FunctionExecResult && jsonObj.FunctionExecResult.IsSuccess === false) return [];
      const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
      if (!rawJson) return [];
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch (e) {
      // 同 getEmployeeCalendarList：只把 403 往外拋（觸發解綁），其餘吞成 []。
      if (e instanceof Http104Error && e.status === 403) throw e;
      return [];
    }
  }

  static async getSubordinateCalendarDetail(auth: AuthParams, year: string, month: string, day: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('QUERY_YEAR', year);
    params.append('QUERY_MONTH', month);
    params.append('QUERY_DAY', day);
    params.append('LANG', 'zh-tw');

    let retries = 2;
    while (retries >= 0) {
      try {
        const resp = await post('GetSubordinateCalendarDetail', params, auth.cookies);
        const jsonObj = parseXml(resp.body);
        if (jsonObj.FunctionExecResult && jsonObj.FunctionExecResult.IsSuccess === false) {
          throw new Error(jsonObj.FunctionExecResult.ReturnMessage || 'API Error');
        }
        const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
        if (!rawJson) return [];
        return JSON.parse(rawJson).Tables[0].Rows || [];
      } catch {
        if (retries === 0) return [];
        retries--;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return [];
  }

  static async applyCheckInForm(
    auth: AuthParams,
    payload: { worksheetId: string; date: string; startTime: string; endTime: string; reason: string },
  ) {
    if (auth.companyId === 'TEST') return true;

    const formVars = {
      WorksheetId: payload.worksheetId,
      STARTDATE: payload.startTime ? payload.date : '',
      STARTTIME: payload.startTime,
      LEAVE_ID_1: '<=VALUE][NAME=>請選擇',
      ENDDATE: payload.endTime ? payload.date : '',
      ENDTIME: payload.endTime,
      LEAVE_ID_2: '<=VALUE][NAME=>請選擇',
      LEAVE_REASON: payload.reason || '補打卡',
      FILE_UPLOAD: '',
    };

    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('formVars', JSON.stringify(formVars));
    params.append('fileuploadid', '');

    const resp = await post('RequestFormApply', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    if (jsonObj.FunctionExecResult && isSuccess(jsonObj.FunctionExecResult)) return true;
    throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Apply failed');
  }

  static async insertCard(auth: AuthParams, payload: { lat: number; lng: number; address?: string; memo?: string }) {
    if (auth.companyId === 'TEST') return true;

    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('latitude', payload.lat.toString());
    params.append('longitude', payload.lng.toString());
    params.append('address', payload.address || '');
    params.append('memo', payload.memo || '');
    params.append('mobile_info', '');
    params.append('locationID', '0');
    params.append('Offset', '0');
    params.append('temperature', '');

    const resp = await post('InsertCardData', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    if (jsonObj.FunctionExecResult && isSuccess(jsonObj.FunctionExecResult)) return true;
    throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Check-in failed');
  }

  static async verifySalaryCode(auth: AuthParams, code: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('code', code);

    const resp = await post('Verification', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    if (jsonObj.FunctionExecResult && isSuccess(jsonObj.FunctionExecResult)) {
      return resp.setCookies.length > 0 ? cookieFromSetCookies(resp.setCookies) : null;
    }
    throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Verification failed');
  }

  static async getSalaryYears(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');

    const resp = await post('GetEmpSalaryYear', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch {
      return [];
    }
  }

  static async getSalaryList(auth: AuthParams, year: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('year', year);

    const resp = await post('GetEmpSalaryName', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch {
      return [];
    }
  }

  static async getSalaryDetail(auth: AuthParams, id: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('SALARY_CLOSE_ID', id);

    const resp = await post('GetEmpSalaryData', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('No data');
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      return rows.length > 0 ? rows[0].ShowData : '';
    } catch {
      return '';
    }
  }

  static async getLeaveStatus(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');

    const resp = await post('GetEmpLeaveOp', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('No leave data found');
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      return rows.length > 0 ? rows[0].ShowData : '';
    } catch {
      throw new Error('Parse leave data failed');
    }
  }

  static async getApprovalCategories(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('viewID', '');
    params.append('EmpName', '');
    params.append('startDate', '2000/01/01');
    params.append('endDate', '2050/12/31');
    params.append('worksheetID', '');
    params.append('empID', '');
    params.append('pointStatus', '0');

    const resp = await post('GetApprovalCountGroupByWorksheet', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch {
      return [];
    }
  }

  static async getApprovalList(auth: AuthParams, worksheetId: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('viewID', '');
    params.append('EmpName', '');
    params.append('empID', '');
    params.append('startDate', '2000/01/01');
    params.append('endDate', '2050/12/31');
    params.append('worksheetID', worksheetId);
    params.append('pointStatus', '0');
    params.append('pageIndex', '0');
    params.append('pageSize', '100');
    params.append('sort', 'WORKSHEET_DATA_ID DESC');

    const resp = await post('GetApprovalListByWorksheet', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      const tables = JSON.parse(rawJson).Tables;
      return tables.length > 1 ? tables[1].Rows || [] : [];
    } catch {
      return [];
    }
  }

  static async getApprovalKey(auth: AuthParams, wsdID: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('wsdID', wsdID);

    const resp = await post('GetWSDShowDataByID', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('Failed to get detail data');
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      if (Array.isArray(rows) && rows.length > 0) return rows[0].ApprovalKey;
      throw new Error('No ApprovalKey found');
    } catch {
      throw new Error('Parse detail failed');
    }
  }

  static async approveWorkflow(auth: AuthParams, approvalKey: string) {
    let realKey = '';
    try {
      realKey = await this.getApprovalKey(auth, approvalKey);
    } catch (e: any) {
      throw new Error(`Get ApprovalKey failed: ${e.message}`);
    }

    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('approvalKey', realKey);
    params.append('comment', '同意');

    const resp = await post('Approval', params, auth.cookies);
    const jsonObj = parseXml(resp.body);
    if (jsonObj.FunctionExecResult && isSuccess(jsonObj.FunctionExecResult)) return true;
    throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Approval failed');
  }

  static unescapeHTML = unescapeHTML;
}
