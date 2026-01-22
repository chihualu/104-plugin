import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path'; // Import path
import { rateLimit } from 'express-rate-limit'; // Rate limiting
import { XMLParser } from 'fast-xml-parser';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './encryption';
import { BindPayload, CheckInPayload } from '../shared/types';

const app = express();
const prisma = new PrismaClient();
const parser = new XMLParser();
const PORT = process.env.PORT || 3001;

// Enable proxy trust for rate limiter (Cloudflare/Nginx)
app.set('trust proxy', 1);

// --- Rate Limiters ---
// General limiter: 100 requests per 15 minutes
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	limit: 100, 
	standardHeaders: 'draft-8',
	legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

// Strict limiter for Auth/Binding: 5 attempts per 15 minutes
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 5,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' }
});

app.use(cors());
app.use(bodyParser.json());
// Apply general rate limit to all routes (API and static files)
app.use(apiLimiter);

// Serve Static Files (Frontend Build)
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

const BASE_URL = 'https://pro104.provision.com.tw:8443/wfmobileweb/Service/eHRFlowMobileService.asmx';

// --- Real 104 Service ---
const HR104Service = {
  getCompanyList: async (groupUBINo: string) => {
    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);

    const response = await axios.post(`${BASE_URL}/GetComapnyList`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.string;
    try {
      return JSON.parse(rawJson).Tables[0].Rows;
    } catch (e) {
      return [];
    }
  },

  login: async (groupUBINo: string, companyID: string, empId: string, password: string) => {
    if (groupUBINo === 'TEST') return 'mock_test_token';

    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);
    params.append('companyID', companyID);
    params.append('account', empId);
    params.append('credential', password);

    const response = await axios.post(`${BASE_URL}/Login`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });

    const jsonObj = parser.parse(response.data);
    const result = jsonObj.FunctionExecResult;

    if (result && result.IsSuccess === true) {
      return result.ReturnObject;
    } else {
      throw new Error(result?.ReturnMessage || 'Login failed');
    }
  },

  applyCheckInForm: async (data: {
    token: string,
    companyId: string,
    internalId: string,
    empId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string
  }) => {
    if (data.companyId === 'TEST') {
        console.log('[Test Mode] Apply Form for', data.date);
        return true;
    }

    const formVars = {
      WorksheetId: "23",
      STARTDATE: data.date,
      STARTTIME: data.startTime,
      LEAVE_ID_1: "<=VALUE][NAME=>請選擇",
      ENDDATE: data.date,
      ENDTIME: data.endTime,
      LEAVE_ID_2: "<=VALUE][NAME=>請選擇",
      LEAVE_REASON: data.reason || "補打卡",
      FILE_UPLOAD: ""
    };

    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('formVars', JSON.stringify(formVars));
    params.append('fileuploadid', '');

    const response = await axios.post(`${BASE_URL}/RequestFormApply`, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      }
    });

    const jsonObj = parser.parse(response.data);
    const result = jsonObj.FunctionExecResult;

    if (result && result.IsSuccess === true) {
      return true;
    } else {
      throw new Error(result?.ReturnMessage || 'Apply failed');
    }
  },

  // --- Approval APIs ---

  getApprovalCategories: async (data: { token: string, companyId: string, internalId: string, empId: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('viewID', '');
    params.append('EmpName', '');
    params.append('startDate', '2000/01/01');
    params.append('endDate', '2050/12/31');
    params.append('worksheetID', '');
    params.append('empID', '');
    params.append('pointStatus', '0');

    const response = await axios.post(`${BASE_URL}/GetApprovalCountGroupByWorksheet`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });
    
    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch (e) { return []; }
  },

  getApprovalList: async (data: { token: string, companyId: string, internalId: string, empId: string, worksheetId: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    // 補上缺少的參數
    params.append('viewID', '');
    params.append('EmpName', '');
    params.append('empID', '');
    
    params.append('startDate', '2000/01/01');
    params.append('endDate', '2050/12/31');
    params.append('worksheetID', data.worksheetId);
    params.append('pointStatus', '0');
    params.append('pageIndex', '0');
    params.append('pageSize', '100');
    params.append('sort', 'WORKSHEET_DATA_ID DESC');

    const response = await axios.post(`${BASE_URL}/GetApprovalListByWorksheet`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      const tables = JSON.parse(rawJson).Tables;
      return tables.length > 1 ? (tables[1].Rows || []) : [];
    } catch (e) { return []; }
  },

  getApprovalKey: async (data: { token: string, companyId: string, internalId: string, empId: string, wsdID: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('wsdID', data.wsdID);

    const response = await axios.post(`${BASE_URL}/GetWSDShowDataByID`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('Failed to get detail data');
    
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0].ApprovalKey;
      }
      throw new Error('No ApprovalKey found');
    } catch (e) { throw new Error('Parse detail failed'); }
  },

  approveWorkflow: async (data: { token: string, companyId: string, internalId: string, empId: string, approvalKey: string }) => {
    let realKey = '';
    try {
        realKey = await HR104Service.getApprovalKey({
            token: data.token,
            companyId: data.companyId,
            internalId: data.internalId,
            empId: data.empId,
            wsdID: data.approvalKey 
        });
    } catch (e: any) {
        throw new Error(`Get ApprovalKey failed: ${e.message}`);
    }

    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('approvalKey', realKey); 
    params.append('comment', '同意');

    const response = await axios.post(`${BASE_URL}/Approval`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) {
      return true;
    } else {
      throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Approval failed');
    }
  }
};

// --- API Routes ---

app.get('/api/companies', async (req, res) => {
  const { groupUBINo } = req.query;
  if (!groupUBINo || typeof groupUBINo !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing groupUBINo' });
  }
  try {
    const list = await HR104Service.getCompanyList(groupUBINo);
    res.json({ success: true, data: list });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/check-binding', async (req, res) => {
  const { lineUserId } = req.query;
  
  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing lineUserId' });
  }

  try {
    console.log('[API] GET /check-binding', { lineUserId });
    const user = await prisma.userBinding.findUnique({
      where: { lineUserId },
    });

    res.json({
      success: true,
      data: {
        isBound: !!user,
        empId: user?.empId
      }
    });
  } catch (error: any) {
    console.error('[API Error] check-binding:', error.message);
    res.status(500).json({ success: false, message: 'Database error: ' + error.message });
  }
});

// Apply strict rate limiting to bind
app.post('/api/bind', authLimiter, async (req, res) => {
  const { lineUserId, groupUBINo, companyID, empId, password } = req.body;

  if (!lineUserId || !groupUBINo || !companyID || !empId || !password) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  try {
    const token = await HR104Service.login(groupUBINo, companyID, empId, password);
    const { encryptedData, iv } = encrypt(token);

    await prisma.userBinding.upsert({
      where: { lineUserId },
      update: {
        companyId: groupUBINo,
        internalCompanyId: companyID,
        empId,
        encryptedToken: encryptedData,
        iv,
      },
      create: {
        lineUserId,
        companyId: groupUBINo,
        internalCompanyId: companyID,
        empId,
        encryptedToken: encryptedData,
        iv,
      },
    });

    res.json({ success: true, message: 'Binding successful' });
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message });
  }
});

app.post('/api/check-in', async (req, res) => {
  const { lineUserId, dates, timeStart, timeEnd, reason } = req.body as CheckInPayload;

  try {
    const user = await prisma.userBinding.findUnique({
      where: { lineUserId },
    });

    if (!user || !user.companyId || !user.empId || !user.internalCompanyId) {
      return res.status(401).json({ success: false, message: 'User not bound or missing info' });
    }

    const token = decrypt(user.encryptedToken, user.iv);
    const fmtStart = (timeStart || '09:00').replace(':', '');
    const fmtEnd = (timeEnd || '18:00').replace(':', '');
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const results = [];
    for (const date of dates) {
      try {
        await HR104Service.applyCheckInForm({
          token,
          companyId: user.companyId!,
          internalId: user.internalCompanyId!,
          empId: user.empId!,
          date: date,
          startTime: fmtStart,
          endTime: fmtEnd,
          reason: reason
        });
        results.push({ date, success: true });
        console.log('[API] Applied for %s success.', date);
      } catch (e: any) {
        console.error('[API] Apply failed for %s: %s', date, e.message);
        results.push({ date, success: false, error: e.message });
      }
      if (date !== dates[dates.length - 1]) await sleep(1000);
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ 
      success: true, 
      message: `已處理 ${results.length} 筆申請 (成功: ${successCount})`,
      results 
    });

  } catch (error: any) {
    console.error('[Check-in Error]', error.message);
    res.status(500).json({ success: false, message: error.message || 'Check-in failed' });
  }
});

app.get('/api/audit/list', async (req, res) => {
  const { lineUserId } = req.query;
  if (!lineUserId || typeof lineUserId !== 'string') return res.status(400).json({ success: false, message: 'Missing lineUserId' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    const baseData = { token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId! };

    const categories = await HR104Service.getApprovalCategories(baseData);
    
    let allItems: any[] = [];
    for (const cat of categories) {
      if (parseInt(cat.wsdCount) > 0) {
        const list = await HR104Service.getApprovalList({ ...baseData, worksheetId: cat.WORKSHEET_ID });
        list.forEach((item: any) => item._category = cat.WorksheetName);
        allItems = allItems.concat(list);
      }
    }

    res.json({ success: true, data: allItems });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/audit/approve', async (req, res) => {
  const { lineUserId, approvalKeys } = req.body;
  if (!lineUserId || !Array.isArray(approvalKeys)) return res.status(400).json({ success: false, message: 'Invalid payload' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    const baseData = { token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId! };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const results = [];
    for (const key of approvalKeys) {
      try {
        await HR104Service.approveWorkflow({ ...baseData, approvalKey: key });
        results.push({ key, success: true });
      } catch (e: any) {
        results.push({ key, success: false, error: e.message });
      }
      if (key !== approvalKeys[approvalKeys.length - 1]) await sleep(1000);
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ success: true, message: `已簽核 ${successCount}/${results.length} 筆`, results });

  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});