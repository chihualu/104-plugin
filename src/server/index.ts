import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { rateLimit } from 'express-rate-limit';
import { XMLParser } from 'fast-xml-parser';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './encryption';
import { BindPayload, CheckInPayload } from '../shared/types';
import { COMPANY_CONFIGS, DEFAULT_CONFIG } from './company-config';

const app = express();
const prisma = new PrismaClient();
const parser = new XMLParser();
const PORT = process.env.PORT || 3001;

// Load Config
let APP_CONFIG: any = { default: { checkIn: { searchKeyword: '刷卡' } } };
try {
  const configPath = path.join(__dirname, '../../config/104.config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    APP_CONFIG = JSON.parse(raw);
    console.log('[Config] Loaded 104.config.json');
  } else {
    console.warn('[Config] No config found, using defaults.');
  }
} catch (e) {
  console.error('[Config] Failed to load config:', e);
}

// Enable proxy trust for rate limiter (Cloudflare/Nginx)
app.set('trust proxy', 1);

// --- Rate Limiters ---
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	limit: 100, 
	standardHeaders: 'draft-8',
	legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 5,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts, please try again in 15 minutes.' }
});

app.use(cors());
app.use(bodyParser.json());
app.use(apiLimiter);

const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

const BASE_URL = 'https://pro104.provision.com.tw:8443/wfmobileweb/Service/eHRFlowMobileService.asmx';

// --- Helpers ---
const logUsage = async (userId: number, action: 'CHECK_IN' | 'AUDIT', count: number, details?: string) => {
  try {
    await prisma.usageLog.create({
      data: { userId, action, count, details }
    });
  } catch (e) {
    console.error('[DB Error] Log Usage failed:', e);
  }
};

// --- Real 104 Service ---
const HR104Service = {
  getRequestWorksheets: async (data: { token: string, companyId: string, internalId: string, empId: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');

    const response = await axios.post(`${BASE_URL}/GetRequestListByWorksheet`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try {
      return JSON.parse(rawJson).Tables[0].Rows || [];
    } catch (e) { return []; }
  },

  getCompanyList: async (groupUBINo: string) => {
    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);

    const response = await axios.post(`${BASE_URL}/GetComapnyList`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.string;
    try {
      return JSON.parse(rawJson).Tables[0].Rows;
    } catch (e) { return []; }
  },

  login: async (groupUBINo: string, companyID: string, empId: string, password: string) => {
    if (groupUBINo === 'TEST') return 'mock_test_token';

    const params = new URLSearchParams();
    params.append('groupUBINo', groupUBINo);
    params.append('companyID', companyID);
    params.append('account', empId);
    params.append('credential', password);

    const response = await axios.post(`${BASE_URL}/Login`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const result = jsonObj.FunctionExecResult;

    if (result && result.IsSuccess === true) {
      return result.ReturnObject;
    } else {
      throw new Error(result?.ReturnMessage || 'Login failed');
    }
  },

  applyCheckInForm: async (data: { token: string, companyId: string, internalId: string, empId: string, date: string, startTime: string, endTime: string, reason: string }) => {
    if (data.companyId === 'TEST') return true;

    const companyConfig = APP_CONFIG.companies?.find((c: any) => 
      c.groupUBINo === data.companyId && (c.companyID === data.internalId || c.companyID === '*')
    )?.checkIn;
    
    const defaultConfig = APP_CONFIG.default?.checkIn;
    let worksheetId = companyConfig?.fixedWorksheetId;
    const searchKeyword = companyConfig?.searchKeyword || defaultConfig?.searchKeyword || '刷卡';

    if (!worksheetId) {
      try {
        const sheets = await HR104Service.getRequestWorksheets(data);
        const targetSheet = sheets.find((s: any) => s.WorksheetName && s.WorksheetName.includes(searchKeyword));
        if (targetSheet) {
          worksheetId = targetSheet.WORKSHEET_ID;
          console.log('[API] Resolved worksheetId: %s for %s', worksheetId, targetSheet.WorksheetName);
        }
      } catch (e) {
        console.warn('[API] Failed to resolve worksheetId dynamically');
      }
    }
    
    worksheetId = worksheetId || "23";

    let formVars: any = {
      WorksheetId: worksheetId,
      STARTDATE: data.date,
      STARTTIME: data.startTime,
      LEAVE_ID_1: "<=VALUE][NAME=>請選擇",
      ENDDATE: data.date,
      ENDTIME: data.endTime,
      LEAVE_ID_2: "<=VALUE][NAME=>請選擇",
      LEAVE_REASON: data.reason || "補打卡",
      FILE_UPLOAD: ""
    };

    if (companyConfig?.customPayload) {
      // JSON config doesn't support functions, so this is just placeholder for now
    }

    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('formVars', JSON.stringify(formVars));
    params.append('fileuploadid', '');

    const response = await axios.post(`${BASE_URL}/RequestFormApply`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Apply failed');
  },

  insertCard: async (data: { token: string, companyId: string, internalId: string, empId: string, lat: number, lng: number, address?: string, memo?: string }) => {
    if (data.companyId === 'TEST') return true;

    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('latitude', data.lat.toString());
    params.append('longitude', data.lng.toString());
    params.append('address', data.address || '');
    params.append('memo', data.memo || '');
    params.append('mobile_info', '');
    params.append('locationID', '0');
    params.append('Offset', '0');
    params.append('temperature', '');

    const response = await axios.post(`${BASE_URL}/InsertCardData`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Check-in failed');
  },

  // --- Salary APIs ---
  verifySalaryCode: async (data: { token: string, companyId: string, internalId: string, empId: string, code: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('code', data.code);

    const response = await axios.post(`${BASE_URL}/Verification`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Verification failed');
  },

  getSalaryYears: async (data: { token: string, companyId: string, internalId: string, empId: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');

    const response = await axios.post(`${BASE_URL}/GetEmpSalaryYear`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
  },

  getSalaryList: async (data: { token: string, companyId: string, internalId: string, empId: string, year: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('year', data.year);

    const response = await axios.post(`${BASE_URL}/GetEmpSalaryName`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) return [];
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
  },

  getSalaryDetail: async (data: { token: string, companyId: string, internalId: string, empId: string, id: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
    params.append('SALARY_CLOSE_ID', data.id);

    const response = await axios.post(`${BASE_URL}/GetEmpSalaryData`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('No data');
    try { 
        const rows = JSON.parse(rawJson).Tables[0].Rows;
        return rows.length > 0 ? rows[0].ShowData : '';
    } catch (e) { return ''; }
  },

  // --- Leave API ---
  getLeaveStatus: async (data: { token: string, companyId: string, internalId: string, empId: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');

    const response = await axios.post(`${BASE_URL}/GetEmpLeaveOp`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    });

    const jsonObj = parser.parse(response.data);
    const rawJson = jsonObj.FunctionExecResult?.ReturnObject;
    if (!rawJson) throw new Error('No leave data found');
    try {
      const rows = JSON.parse(rawJson).Tables[0].Rows;
      return rows.length > 0 ? rows[0].ShowData : '';
    } catch (e) { throw new Error('Parse leave data failed'); }
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
    try { return JSON.parse(rawJson).Tables[0].Rows || []; } catch (e) { return []; }
  },

  getApprovalList: async (data: { token: string, companyId: string, internalId: string, empId: string, worksheetId: string }) => {
    const params = new URLSearchParams();
    params.append('key', data.token);
    params.append('groupUBINo', data.companyId);
    params.append('companyID', data.internalId);
    params.append('account', data.empId);
    params.append('language', 'zh-tw');
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
      if (Array.isArray(rows) && rows.length > 0) return rows[0].ApprovalKey;
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
    if (jsonObj.FunctionExecResult?.IsSuccess === true) return true;
    else throw new Error(jsonObj.FunctionExecResult?.ReturnMessage || 'Approval failed');
  }
};

// --- API Routes ---

app.get('/api/companies', async (req, res) => {
  const { groupUBINo } = req.query;
  if (!groupUBINo || typeof groupUBINo !== 'string') return res.status(400).json({ success: false, message: 'Missing groupUBINo' });
  try {
    const list = await HR104Service.getCompanyList(groupUBINo);
    res.json({ success: true, data: list });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/check-binding', async (req, res) => {
  const { lineUserId } = req.query;
  if (!lineUserId || typeof lineUserId !== 'string') return res.status(400).json({ success: false, message: 'Missing lineUserId' });
  try {
    console.log('[API] GET /check-binding', { lineUserId });
    const user = await prisma.userBinding.findUnique({
      where: { lineUserId },
      include: { logs: true }
    });

    if (user) {
      const checkInCount = user.logs.filter(l => l.action === 'CHECK_IN').reduce((acc, cur) => acc + cur.count, 0);
      const auditCount = user.logs.filter(l => l.action === 'AUDIT').reduce((acc, cur) => acc + cur.count, 0);
      
      res.json({
        success: true,
        data: {
          isBound: true,
          empId: user.empId,
          companyId: user.companyId,
          internalId: user.internalCompanyId,
          stats: { checkIn: checkInCount, audit: auditCount }
        }
      });
    } else {
      res.json({ success: true, data: { isBound: false } });
    }
  } catch (error: any) {
    console.error('[API Error] check-binding:', error.message);
    res.status(500).json({ success: false, message: 'Database error: ' + error.message });
  }
});

app.post('/api/bind', authLimiter, async (req, res) => {
  const { lineUserId, groupUBINo, companyID, empId, password } = req.body;
  if (!lineUserId || !groupUBINo || !companyID || !empId || !password) return res.status(400).json({ success: false, message: 'Missing fields' });

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
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.companyId || !user.empId || !user.internalCompanyId) {
      res.write(JSON.stringify({ type: 'error', message: 'User not bound or missing info' }) + '\n');
      return res.end();
    }

    const token = decrypt(user.encryptedToken, user.iv);
    const fmtStart = (timeStart || '09:00').replace(':', '');
    const fmtEnd = (timeEnd || '18:00').replace(':', '');
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    let successCount = 0;
    res.write(JSON.stringify({ type: 'start', total: dates.length }) + '\n');

    for (const [index, date] of dates.entries()) {
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
        successCount++;
        res.write(JSON.stringify({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'success' }) + '\n');
        console.log('[API] Applied for %s success.', date);
      } catch (e: any) {
        console.error('[API] Apply failed for %s: %s', date, e.message);
        res.write(JSON.stringify({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'error', error: e.message }) + '\n');
      }
      if (index !== dates.length - 1) await sleep(500);
    }

    if (successCount > 0) {
      logUsage(user.id, 'CHECK_IN', successCount, `Dates: ${dates.join(', ')}`);
    }

    res.write(JSON.stringify({ type: 'done', successCount }) + '\n');
    res.end();
  } catch (error: any) {
    res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
    res.end();
  }
});

// New: Check-in Now API
app.post('/api/check-in/now', async (req, res) => {
  const { lineUserId, lat, lng, address } = req.body;
  if (!lineUserId || !lat || !lng) return res.status(400).json({ success: false, message: 'Missing location' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.companyId || !user.empId || !user.internalCompanyId) {
      return res.status(401).json({ success: false, message: 'User not bound' });
    }

    const token = decrypt(user.encryptedToken, user.iv);
    await HR104Service.insertCard({
      token,
      companyId: user.companyId!,
      internalId: user.internalCompanyId!,
      empId: user.empId!,
      lat,
      lng,
      address: '',
      memo: ''
    });

    logUsage(user.id, 'CHECK_IN', 1, `GPS: ${lat},${lng}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/salary/verify', async (req, res) => {
  const { lineUserId, code } = req.body;
  if (!lineUserId || !code) return res.status(400).json({ success: false, message: 'Missing fields' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    await HR104Service.verifySalaryCode({
      token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId!, code
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(403).json({ success: false, message: error.message });
  }
});

app.get('/api/salary/years', async (req, res) => {
  const { lineUserId } = req.query;
  if (typeof lineUserId !== 'string') return res.status(400).json({ success: false, message: 'Missing lineUserId' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    const years = await HR104Service.getSalaryYears({
      token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId!
    });
    res.json({ success: true, data: years });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/salary/list', async (req, res) => {
  const { lineUserId, year } = req.query;
  if (typeof lineUserId !== 'string' || typeof year !== 'string') return res.status(400).json({ success: false, message: 'Missing fields' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    const list = await HR104Service.getSalaryList({
      token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId!, year
    });
    res.json({ success: true, data: list });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/salary/detail', async (req, res) => {
  const { lineUserId, id } = req.query;
  if (typeof lineUserId !== 'string' || typeof id !== 'string') return res.status(400).json({ success: false, message: 'Missing fields' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    const html = await HR104Service.getSalaryDetail({
      token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId!, id
    });
    res.json({ success: true, data: html });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/leave/status', async (req, res) => {
  const { lineUserId } = req.query;
  if (typeof lineUserId !== 'string') return res.status(400).json({ success: false, message: 'Missing lineUserId' });

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) return res.status(401).json({ success: false, message: 'User not bound' });

    const token = decrypt(user.encryptedToken, user.iv);
    const html = await HR104Service.getLeaveStatus({
      token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId!
    });
    res.json({ success: true, data: html });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/audit/approve', async (req, res) => {
  const { lineUserId, approvalKeys } = req.body;
  if (!lineUserId || !Array.isArray(approvalKeys)) return res.status(400).json({ success: false, message: 'Invalid payload' });

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const user = await prisma.userBinding.findUnique({ where: { lineUserId } });
    if (!user || !user.internalCompanyId) {
      res.write(JSON.stringify({ type: 'error', message: 'User not bound' }) + '\n');
      return res.end();
    }

    const token = decrypt(user.encryptedToken, user.iv);
    const baseData = { token, companyId: user.companyId!, internalId: user.internalCompanyId!, empId: user.empId! };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    let successCount = 0;
    res.write(JSON.stringify({ type: 'start', total: approvalKeys.length }) + '\n');

    for (const [index, key] of approvalKeys.entries()) {
      try {
        await HR104Service.approveWorkflow({ ...baseData, approvalKey: key });
        successCount++;
        res.write(JSON.stringify({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'success' }) + '\n');
      } catch (e: any) {
        res.write(JSON.stringify({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'error', error: e.message }) + '\n');
      }
      if (index !== approvalKeys.length - 1) await sleep(500);
    }

    if (successCount > 0) {
      logUsage(user.id, 'AUDIT', successCount, `Keys: ${approvalKeys.length}`);
    }

    res.write(JSON.stringify({ type: 'done', successCount }) + '\n');
    res.end();
  } catch (error: any) {
    res.write(JSON.stringify({ type: 'error', message: error.message }) + '\n');
    res.end();
  }
});

app.get('/api/usages/stats', async (req, res) => {
  try {
    const logs = await prisma.usageLog.findMany({
      include: { user: true }
    });

    const companyStats: Record<string, any> = {};

    for (const log of logs) {
      const u = log.user;
      if (!u.companyId) continue;
      
      const key = `${u.companyId}_${u.internalCompanyId || '?'}`;
      if (!companyStats[key]) {
        companyStats[key] = {
          companyId: u.companyId,
          internalId: u.internalCompanyId || '?',
          checkInTotal: 0,
          auditTotal: 0,
          users: new Set()
        };
      }

      companyStats[key].users.add(u.empId);
      if (log.action === 'CHECK_IN') companyStats[key].checkInTotal += log.count;
      if (log.action === 'AUDIT') companyStats[key].auditTotal += log.count;
    }

    const data = Object.values(companyStats).map(s => ({
      ...s,
      userCount: s.users.size,
      users: undefined
    }));

    res.json({ success: true, data });
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