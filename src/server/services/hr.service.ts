import { PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import * as cheerio from 'cheerio';
import { AuthService } from './auth.service';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Cache setup: 10 mins TTL
const salaryCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 10,
});

let APP_CONFIG: any = { default: { checkIn: { searchKeyword: '刷卡' } } };
try {
  const configPath = path.join(__dirname, '../../../config/104.config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    APP_CONFIG = JSON.parse(raw);
  }
} catch (e) { logger.warn('Config load failed, using default'); }

export class HRService {
  
  static async applyCheckIn(lineUserId: string, payload: any, progressCallback?: (data: any) => void) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const { dates, timeStart, timeEnd, reason } = payload;
    const fmtStart = (timeStart || '09:00').replace(':', '');
    const fmtEnd = (timeEnd || '18:00').replace(':', '');

    // Get Worksheet ID
    let companyConfig;
    if (Array.isArray(APP_CONFIG.companies)) {
        companyConfig = APP_CONFIG.companies.find((c: any) => 
            c.groupUBINo === creds.companyId && 
            (c.companyID === creds.internalId || c.companyID === '*')
        )?.checkIn;
    }
    const defaultConfig = APP_CONFIG.default?.checkIn;
    let worksheetId = companyConfig?.fixedWorksheetId;
    const searchKeyword = companyConfig?.searchKeyword || defaultConfig?.searchKeyword || '刷卡';

    if (!worksheetId && creds.companyId !== 'TEST') {
        try {
            const sheets = await HR104Adapter.getRequestWorksheets(creds);
            const targetSheet = sheets.find((s: any) => s.WorksheetName && s.WorksheetName.includes(searchKeyword));
            if (targetSheet) worksheetId = targetSheet.WORKSHEET_ID;
        } catch (e) { logger.warn('Resolve worksheetId failed'); }
    }
    worksheetId = worksheetId || "23";

    let successCount = 0;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    if (progressCallback) progressCallback({ type: 'start', total: dates.length });

    for (const [index, date] of dates.entries()) {
        try {
            await HR104Adapter.applyCheckInForm(creds, {
                worksheetId, date, startTime: fmtStart, endTime: fmtEnd, reason
            });
            successCount++;
            if (progressCallback) progressCallback({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'success' });
        } catch (e: any) {
            if (progressCallback) progressCallback({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'error', error: e.message });
        }
        if (index !== dates.length - 1) await sleep(500);
    }

    if (successCount > 0) {
        await this.logUsage(creds.dbUser.id, 'CHECK_IN', successCount, `Dates: ${dates.join(', ')}`);
    }

    if (progressCallback) progressCallback({ type: 'done', successCount });
  }

  static async checkInNow(lineUserId: string, payload: any) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    await HR104Adapter.insertCard(creds, payload);
    await this.logUsage(creds.dbUser.id, 'CHECK_IN', 1, `GPS: ${payload.lat},${payload.lng}`);
  }

  static async verifySalaryCode(lineUserId: string, code: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const newCookies = await HR104Adapter.verifySalaryCode(creds, code);
    if (newCookies) {
        await prisma.userBinding.update({ where: { id: creds.dbUser.id }, data: { cookies: newCookies } });
    }
  }

  static async getSalaryYears(lineUserId: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    return HR104Adapter.getSalaryYears(creds);
  }

  static async getSalaryList(lineUserId: string, year: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    return HR104Adapter.getSalaryList(creds, year);
  }

  static async getSalaryDetail(lineUserId: string, id: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    return HR104Adapter.getSalaryDetail(creds, id);
  }

  static async getSalarySummary(lineUserId: string, year: string) {
    const cacheKey = `summary:${lineUserId}:${year}`;
    if (salaryCache.has(cacheKey)) return salaryCache.get(cacheKey);

    const creds = await AuthService.getUserCredentials(lineUserId);
    const list = await HR104Adapter.getSalaryList(creds, year);
    if (list.length === 0) return { tax: 0, income: 0, deduction: 0, real: 0 };

    const summary = { tax: 0, income: 0, deduction: 0, real: 0 };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let i = 0; i < list.length; i += 5) {
        const chunk = list.slice(i, i + 5);
        const details = await Promise.all(chunk.map((item: any) => 
            HR104Adapter.getSalaryDetail(creds, item.SALARY_CLOSE_ID)
        ));

        details.forEach((rawHtml: string) => {
            if (!rawHtml) return;
            const html = HR104Adapter.unescapeHTML(rawHtml);
            const $ = cheerio.load(html);
            const parseValue = (keyword: string) => {
                try {
                    const el = $(`span:contains('${keyword}'), td:contains('${keyword}')`).last();
                    if (el.length > 0) {
                        const tr = el.closest('tr');
                        const valueTd = tr.find('td[id$="_value"]');
                        if (valueTd.length > 0) return parseInt(valueTd.text().trim().replace(/,/g, ''), 10) || 0;
                    }
                } catch (e) {}
                return 0;
            };
            summary.tax += parseValue('應稅總額');
            summary.income += parseValue('應發總額');
            summary.deduction += parseValue('應扣總額');
            summary.real += parseValue('實發金額');
        });
        await sleep(200);
    }

    salaryCache.set(cacheKey, summary);
    return summary;
  }

  static async getTeamAttendance(lineUserId: string, year: string, month: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    
    // 1. Get Dates (01)
    const dateList = await HR104Adapter.getSubordinateCalendarList(creds, year, month);
    if (!dateList || dateList.length === 0) return { leaves: [], punches: [] };

    const dates = dateList.map((d: any) => d.QUERY_DATE);

    // 2. Get Details for each date (Serial Processing)
    const allDetails: any[] = [];
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (const dateStr of dates) {
        try {
            const day = dateStr.split('-')[2];
            const rows = await HR104Adapter.getSubordinateCalendarDetail(creds, year, month, day);
            const enrichedRows = rows.map((r: any) => ({ ...r, DATE: dateStr }));
            allDetails.push(...enrichedRows);
        } catch (e) {
            logger.warn(`Failed to fetch details for ${dateStr}, skipping.`);
        }
        await sleep(200); // Small delay between each request
    }

    // 3. Group by Type (LEAVE vs PUNCH)
    const result = {
        leaves: [] as any[],
        punches: [] as any[]
    };

    for (const item of allDetails) {
        const record = {
            empId: item.EMPLOYEE_ID,
            empName: item.EMPLOYEE_CNAME,
            dept: item.EMPLOYEE_JOB_DEPARTMENT,
            date: item.DATE,
            info: item.INFO_TYPE === '1' ? item.ASK_LEAVE_INFO : item.CARD_DATA_NAME
        };

        if (item.INFO_TYPE === '1') { // Leave
            result.leaves.push(record);
        } else if (item.INFO_TYPE === '2') { // Punch / Card Data
            // Include ALL card data, no filtering for "abnormal"
            if (record.info) {
                result.punches.push(record);
            }
        }
    }
    
    // Sort by empId, then date desc
    const sortFn = (a: any, b: any) => {
        if (a.empId !== b.empId) {
            return a.empId.localeCompare(b.empId);
        }
        return b.date.localeCompare(a.date);
    };
    result.leaves.sort(sortFn);
    result.punches.sort(sortFn);

    return result;
  }

  static async getLeaveStatus(lineUserId: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    return HR104Adapter.getLeaveStatus(creds);
  }

  static async getAuditList(lineUserId: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const categories = await HR104Adapter.getApprovalCategories(creds);
    let allItems: any[] = [];
    for (const cat of categories) {
      if (parseInt(cat.wsdCount) > 0) {
        const list = await HR104Adapter.getApprovalList(creds, cat.WORKSHEET_ID);
        list.forEach((item: any) => item._category = cat.WorksheetName);
        allItems = allItems.concat(list);
      }
    }
    return allItems;
  }

  static async approveWorkflows(lineUserId: string, approvalKeys: string[], progressCallback?: (data: any) => void) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    let successCount = 0;
    
    if (progressCallback) progressCallback({ type: 'start', total: approvalKeys.length });

    for (const [index, key] of approvalKeys.entries()) {
        try {
            await HR104Adapter.approveWorkflow(creds, key);
            successCount++;
            if (progressCallback) progressCallback({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'success' });
        } catch (e: any) {
            if (progressCallback) progressCallback({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'error', error: e.message });
        }
        if (index !== approvalKeys.length - 1) await sleep(500);
    }

    if (successCount > 0) {
        await this.logUsage(creds.dbUser.id, 'AUDIT', successCount, `Keys: ${approvalKeys.length}`);
    }

    if (progressCallback) progressCallback({ type: 'done', successCount });
  }

  static async getUsagesStats() {
    const logs = await prisma.usageLog.findMany({
      include: { user: true }
    });

    const companyStats: Record<string, any> = {};

    for (const log of logs) {
      const u = log.user;
      if (!u.companyId) continue;
      
      const key = `${u.companyId}_${u.internalCompanyId || '?'}`;
      if (!companyStats[key]) {
        // Find company name from config
        let companyName = u.companyId; // Default to UBI No
        if (Array.isArray(APP_CONFIG.companies)) {
            const config = APP_CONFIG.companies.find((c: any) => 
                c.groupUBINo === u.companyId && 
                (c.companyID === u.internalCompanyId || c.companyID === '*')
            );
            if (config && config.companyName) {
                companyName = config.companyName;
            }
        }

        companyStats[key] = {
          companyId: u.companyId, // Still needed for key but display name is separate
          companyName,
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

    return Object.values(companyStats).map(s => ({
      ...s,
      userCount: (s.users as Set<any>).size,
      users: undefined
    }));
  }

  private static async logUsage(userId: number, action: 'CHECK_IN' | 'AUDIT', count: number, details?: string) {
    try {
        await prisma.usageLog.create({ data: { userId, action, count, details } });
    } catch (e) { logger.error('Log Usage failed', e); }
  }
}
