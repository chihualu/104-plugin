import { PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import * as cheerio from 'cheerio';
import { AuthService } from './auth.service';
import { CompanyService } from './company.service';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Cache setup: 10 mins TTL
const salaryCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 10,
});

export class HRService {
  
  static async applyCheckIn(lineUserId: string, payload: any, progressCallback?: (data: any) => void) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const { dates, timeStart, timeEnd, reason } = payload;
    const fmtStart = timeStart ? timeStart.replace(':', '') : '';
    const fmtEnd = timeEnd ? timeEnd.replace(':', '') : '';

    // Get Worksheet ID from CompanyService
    const companyConfig = CompanyService.getConfig(creds.companyId, creds.internalId);
    const defaultConfig = CompanyService.getDefaultConfig()?.checkIn;
    
    let worksheetId = companyConfig?.checkIn?.fixedWorksheetId;
    const searchKeyword = companyConfig?.checkIn?.searchKeyword || defaultConfig?.searchKeyword || '刷卡';

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
    const rawHtml = await HR104Adapter.getSalaryDetail(creds, id);
    
    if (!rawHtml) return { html: '', items: [] };

    const html = HR104Adapter.unescapeHTML(rawHtml);
    const $ = cheerio.load(html);
    const items: { label: string, value: string, type?: 'earning' | 'deduction' | 'info' }[] = [];

    // Heuristic parsing for 104 Salary HTML Table
    // Strategy: Look for rows with 2 or 4 columns.
    $('table tr').each((i, el) => {
        const tds = $(el).find('td');
        
        // Helper to add item
        const addItem = (labelTd: any, valueTd: any) => {
            const label = $(labelTd).text().trim();
            const value = $(valueTd).text().trim();
            if (label && value) {
                // Guess type based on value or label
                let type: 'earning' | 'deduction' | 'info' = 'info';
                const num = parseFloat(value.replace(/,/g, ''));
                
                // Common keywords for Deductions
                if (label.includes('扣') || label.includes('稅') || label.includes('勞保') || label.includes('健保')) {
                    type = 'deduction';
                } else if (!isNaN(num) && num > 0 && !label.includes('費') && !label.includes('率')) {
                    // Likely earning if positive number and not a rate/fee info
                    type = 'earning';
                }
                
                items.push({ label, value, type });
            }
        };

        if (tds.length === 2) {
             addItem(tds[0], tds[1]);
        } else if (tds.length === 4) {
             addItem(tds[0], tds[1]);
             addItem(tds[2], tds[3]);
        }
    });

    return { html, items };
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

  static async getPersonalAttendance(lineUserId: string, year: string, month: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const rows = await HR104Adapter.getEmployeeCalendarList(creds, year, month);
    
    return rows.map((r: any) => ({
        date: r.QUERY_DATE,
        dayType: r.CALENDAR_NAME, // 工作日, 休息日...
        isWorkDay: r.IS_WORKDAY === '1',
        punchText: r.CARD_DATA_DATE, // 上班08:45 / 下班17:45
        holidayName: r.HOLIDAY_NAME,
        exceptionName: r.CARD_DATA_NAME // 異常資訊，如：忘記刷卡
    }));
  }

  static async checkMonthlyAttendance(lineUserId: string, year: string, month: string) {
    const data = await this.getPersonalAttendance(lineUserId, year, month);
    const today = new Date().toISOString().split('T')[0];
    
    const abnormalities = data.filter(d => {
        if (d.date > today) return false; // Skip future
        
        // 1. Explicit Exception
        if (d.exceptionName) return true;

        // 2. Missing Punch on Workday
        if (d.isWorkDay) {
            // Check if punchText indicates missing data (e.g. "上班--", "下班--")
            // Or if it's completely empty? Usually 104 returns "上班-- / 下班--" for missing
            if (!d.punchText || d.punchText.includes('--')) return true;
        }
        
        return false;
    });

    return abnormalities;
  }

  static async getLeaveStatus(lineUserId: string) {
    const creds = await AuthService.getUserCredentials(lineUserId);
    const rawHtml = await HR104Adapter.getLeaveStatus(creds);
    
    // Parse HTML to JSON
    const $ = cheerio.load(rawHtml);
    const data: any[] = [];
    let currentLeave: any = null;

    $('table tr').each((i, el) => {
        const tds = $(el).find('td');
        
        // Header Row: contains "假勤名稱" and spans 2 columns
        if (tds.length === 1 && $(tds[0]).attr('colspan') === '2') {
            const headerText = $(tds[0]).text().trim();
            if (headerText.includes('假勤名稱')) {
                if (currentLeave) data.push(currentLeave);
                currentLeave = {
                    name: headerText.replace('假勤名稱', '').trim(),
                    total: '',
                    used: '',
                    balance: '',
                    expiry: ''
                };
            }
        } 
        // Detail Row: contains attribute name and value in two cells
        else if (tds.length === 2 && currentLeave) {
            const label = $(tds[0]).text().trim();
            const value = $(tds[1]).text().trim();
            
            if (label.includes('可休')) {
                currentLeave.total = value;
                // Sometimes validity is in the same string, e.g. "112 小時 / 2026/12/31"
                if (value.includes('/')) {
                    currentLeave.expiry = value.split('/').pop()?.trim() || '';
                }
            }
            else if (label.includes('已休')) currentLeave.used = value;
            else if (label.includes('剩餘')) currentLeave.balance = value;
        }
    });
    
    if (currentLeave) data.push(currentLeave);
    
    return data;
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
    // 1. Get User Counts (Bound Users)
    const userGroups = await prisma.userBinding.groupBy({
        by: ['companyId', 'internalCompanyId'],
        _count: { id: true }
    });

    const companyStats: Record<string, any> = {};

    // Initialize stats with user counts
    for (const g of userGroups) {
        if (!g.companyId) continue;
        const key = `${g.companyId}_${g.internalCompanyId || '?'}`;
        const companyName = await CompanyService.getCompanyName(g.companyId, g.internalCompanyId || '?');
        
        companyStats[key] = {
            companyId: g.companyId,
            companyName,
            internalId: g.internalCompanyId || '?',
            userCount: g._count.id,
            checkInTotal: 0,
            auditTotal: 0,
            scheduleTotal: 0
        };
    }

    // 2. Get Usage Logs
    const logs = await prisma.usageLog.findMany({
      include: { user: true }
    });

    for (const log of logs) {
      const u = log.user;
      if (!u.companyId) continue;
      
      const key = `${u.companyId}_${u.internalCompanyId || '?'}`;
      
      // If we have logs for a company that somehow has no current users (e.g. all unbound), create entry
      if (!companyStats[key]) {
          const companyName = await CompanyService.getCompanyName(u.companyId, u.internalCompanyId || '?');
          companyStats[key] = {
            companyId: u.companyId,
            companyName,
            internalId: u.internalCompanyId || '?',
            userCount: 0,
            checkInTotal: 0,
            auditTotal: 0,
            scheduleTotal: 0
          };
      }

      if (log.action === 'CHECK_IN') companyStats[key].checkInTotal += log.count;
      if (log.action === 'AUDIT') companyStats[key].auditTotal += log.count;
      if (log.action === 'SCHEDULE') companyStats[key].scheduleTotal += log.count;
    }

    return Object.values(companyStats);
  }

  private static async logUsage(userId: number, action: 'CHECK_IN' | 'AUDIT', count: number, details?: string) {
    try {
        await prisma.usageLog.create({ data: { userId, action, count, details } });
    } catch (e) { logger.error('Log Usage failed', e); }
  }
}
