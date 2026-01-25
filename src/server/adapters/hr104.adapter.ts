import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { logger } from '../utils/logger';

const BASE_URL = 'https://pro104.provision.com.tw:8443/wfmobileweb/Service/eHRFlowMobileService.asmx';
const parser = new XMLParser();

export interface AuthParams {
  token: string;
  companyId: string;
  internalId: string;
  empId: string;
  cookies?: string | null;
}

export class HR104Adapter {
  private static getAxiosConfig(cookies?: string | null) {
    const config: any = {
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded', 
        'X-Requested-With': 'XMLHttpRequest' 
      },
      timeout: 15000 // 15s timeout
    };
    if (cookies) {
      config.headers['Cookie'] = cookies;
    }
    return config;
  }

  static async login(groupUBINo: string, companyID: string, empId: string, password: string) {
    if (groupUBINo === 'TEST') return 'mock_test_token';

    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);
    params.append('companyID', companyID);
    params.append('account', empId);
    params.append('credential', password);

    try {
        const response = await axios.post(`${BASE_URL}/Login`, params.toString(), this.getAxiosConfig());
        const jsonObj = parser.parse(response.data);
        const result = jsonObj.FunctionExecResult;

        if (result && result.IsSuccess === true) {
            return result.ReturnObject;
        } else {
            throw new Error(result?.ReturnMessage || 'Login failed');
        }
    } catch (e: any) {
        logger.error({ msg: 'Login 104 failed', error: e.message });
        throw new Error('External Service Error: Login failed');
    }
  }

  static async getCompanyList(groupUBINo: string) {
    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);
    const response = await axios.post(`${BASE_URL}/GetComapnyList`, params.toString(), this.getAxiosConfig());
    const jsonObj = parser.parse(response.data);
    try {
      return JSON.parse(jsonObj.string).Tables[0].Rows;
    } catch (e) { return []; }
  }

  static async getRequestWorksheets(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');

    const response = await axios.post(`${BASE_URL}/GetRequestListByWorksheet`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
  }

  static async applyCheckInForm(auth: AuthParams, payload: { worksheetId: string, date: string, startTime: string, endTime: string, reason: string }) {
    if (auth.companyId === 'TEST') return true;
    
    const formVars = {
        WorksheetId: payload.worksheetId,
        STARTDATE: payload.date,
        STARTTIME: payload.startTime,
        LEAVE_ID_1: "<=VALUE][NAME=>請選擇",
        ENDDATE: payload.date,
        ENDTIME: payload.endTime,
        LEAVE_ID_2: "<=VALUE][NAME=>請選擇",
        LEAVE_REASON: payload.reason || "補打卡",
        FILE_UPLOAD: ""
    };

    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('formVars', JSON.stringify(formVars));
    params.append('fileuploadid', '');

    const response = await axios.post(`${BASE_URL}/RequestFormApply`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Apply failed');
  }

  static async insertCard(auth: AuthParams, payload: { lat: number, lng: number, address?: string, memo?: string }) {
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

    const response = await axios.post(`${BASE_URL}/InsertCardData`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Check-in failed');
  }

  static async verifySalaryCode(auth: AuthParams, code: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('code', code);

    const response = await axios.post(`${BASE_URL}/Verification`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    
    if (jsonObj.FunctionExecResult?.IsSuccess === true) {
      const setCookie = response.headers['set-cookie'];
      return setCookie ? setCookie.join('; ') : null;
    }
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Verification failed');
  }

  static async getSalaryYears(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');

    const response = await axios.post(`${BASE_URL}/GetEmpSalaryYear`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
  }

  static async getSalaryList(auth: AuthParams, year: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('year', year);

    const response = await axios.post(`${BASE_URL}/GetEmpSalaryName`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
  }

  static async getSalaryDetail(auth: AuthParams, id: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('SALARY_CLOSE_ID', id);

    const response = await axios.post(`${BASE_URL}/GetEmpSalaryData`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('No data');
    try { 
        const rows = JSON.parse(rawJson).Tables[0].Rows;
        return rows.length > 0 ? rows[0].ShowData : '';
    } catch (e) { return ''; }
  }

  static async getLeaveStatus(auth: AuthParams) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');

    const response = await axios.post(`${BASE_URL}/GetEmpLeaveOp`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('No leave data found');
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      return rows.length > 0 ? rows[0].ShowData : '';
    } catch (e) { throw new Error('Parse leave data failed'); }
  }

  // Approval methods...
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

    const response = await axios.post(`${BASE_URL}/GetApprovalCountGroupByWorksheet`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
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

    const response = await axios.post(`${BASE_URL}/GetApprovalListByWorksheet`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      const tables = JSON.parse(rawJson).Tables;
      return tables.length > 1 ? (tables[1].Rows || []) : [];
    } catch (e) { return []; }
  }

  static async getApprovalKey(auth: AuthParams, wsdID: string) {
    const params = new URLSearchParams();
    params.append('key', auth.token);
    params.append('groupUBINo', auth.companyId);
    params.append('companyID', auth.internalId);
    params.append('account', auth.empId);
    params.append('language', 'zh-tw');
    params.append('wsdID', wsdID);

    const response = await axios.post(`${BASE_URL}/GetWSDShowDataByID`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('Failed to get detail data');
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      if (Array.isArray(rows) && rows.length > 0) return rows[0].ApprovalKey;
      throw new Error('No ApprovalKey found');
    } catch (e) { throw new Error('Parse detail failed'); }
  }

  static async approveWorkflow(auth: AuthParams, approvalKey: string) {
    // We assume the caller might pass wsdID as approvalKey initially, so we resolve it first
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

    const response = await axios.post(`${BASE_URL}/Approval`, params.toString(), this.getAxiosConfig(auth.cookies));
    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Approval failed');
  }

  static unescapeHTML(str: string) {
    return str.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
}
