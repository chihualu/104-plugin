import type { Env } from '../env';
import * as cheerio from 'cheerio';
import { AuthService } from './auth.service';
import { CompanyService } from './company.service';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { LineService } from './line.service';
import { DelegationService } from './delegation.service';
import { logger } from '../lib/logger';
import { TtlCache } from '../lib/cache';
import * as db from '../lib/db';

const salaryCache = new TtlCache<any>(1000 * 60 * 10, 500); // 10 min
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HRService {
  static async applyCheckIn(
    env: Env,
    lineUserId: string,
    payload: any,
    progressCallback?: (data: any) => void,
    actorLineUserId?: string,
  ) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    const { dates, timeStart, timeEnd, reason } = payload;
    const fmtStart = timeStart ? timeStart.replace(':', '') : '';
    const fmtEnd = timeEnd ? timeEnd.replace(':', '') : '';

    const companyConfig = CompanyService.getConfig(env, creds.companyId, creds.internalId);
    const defaultConfig = CompanyService.getDefaultConfig(env)?.checkIn;

    let worksheetId = companyConfig?.checkIn?.fixedWorksheetId;
    const searchKeyword = companyConfig?.checkIn?.searchKeyword || defaultConfig?.searchKeyword || '刷卡';

    if (!worksheetId && creds.companyId !== 'TEST') {
      try {
        const sheets = await HR104Adapter.getRequestWorksheets(creds);
        const targetSheet = sheets.find((s: any) => s.WorksheetName && s.WorksheetName.includes(searchKeyword));
        if (targetSheet) worksheetId = targetSheet.WORKSHEET_ID;
      } catch {
        logger.warn('Resolve worksheetId failed');
      }
    }
    worksheetId = worksheetId || '23';

    let successCount = 0;
    if (progressCallback) progressCallback({ type: 'start', total: dates.length });

    for (const [index, date] of (dates as string[]).entries()) {
      // 代理操作：每筆前重新確認授權仍有效（撤銷後立即停止）。本人 canActAs 短路。
      if (actorLineUserId && !(await DelegationService.canActAs(env, actorLineUserId, lineUserId))) {
        if (progressCallback)
          progressCallback({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'error', error: '代理授權已撤銷，停止後續' });
        break;
      }
      try {
        await HR104Adapter.applyCheckInForm(creds, { worksheetId, date, startTime: fmtStart, endTime: fmtEnd, reason });
        successCount++;
        if (progressCallback)
          progressCallback({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'success' });
      } catch (e: any) {
        if (progressCallback)
          progressCallback({ type: 'progress', index: index + 1, total: dates.length, key: date, status: 'error', error: e.message });
      }
      if (index !== dates.length - 1) await sleep(500);
    }

    if (successCount > 0) {
      await this.logUsage(env, creds.dbUser.id, 'CHECK_IN', successCount, `Dates: ${dates.join(', ')}`, actorLineUserId);
    }
    if (progressCallback) progressCallback({ type: 'done', successCount });
  }

  static async checkInNow(env: Env, lineUserId: string, payload: any, actorLineUserId?: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    await HR104Adapter.insertCard(creds, payload);
    await this.logUsage(env, creds.dbUser.id, 'CHECK_IN', 1, `GPS: ${payload.lat},${payload.lng}`, actorLineUserId);
  }

  static async executeScheduledTask(env: Env, taskId: number) {
    try {
      const task = await db.findScheduledTask(env.DB, taskId);
      if (!task || task.status !== 'PENDING') throw new Error('Task not found or not pending');

      const user = await db.findUserById(env.DB, task.userId);
      if (!user) throw new Error('User not found');

      const creds = await AuthService.getUserCredentials(env, user.lineUserId);

      await HR104Adapter.insertCard(creds, { lat: task.lat, lng: task.lng, address: '', memo: '' });

      await db.updateTaskStatus(env.DB, task.id, 'COMPLETED', 'Success');

      await db.createUsageLog(env.DB, {
        userId: task.userId,
        action: 'SCHEDULE',
        count: 1,
        details: 'Executed successfully',
      });

      const timeStr = new Date(task.scheduledAt).toLocaleTimeString('zh-TW', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Taipei',
      });
      await LineService.pushMessage(env, user.lineUserId, `【預約打卡通知】\n您預約於 ${timeStr} 的自動打卡已執行成功。`);

      logger.info({ msg: `Scheduled task ${task.id} for user ${user.empId} completed successfully` });
      return { success: true };
    } catch (e: any) {
      await db.updateTaskStatus(env.DB, taskId, 'FAILED', e.message);

      // 403（token 失效）：自動解綁並通知。
      if (e.response && e.response.status === 403) {
        const task = await db.findScheduledTask(env.DB, taskId);
        const user = task ? await db.findUserById(env.DB, task.userId) : null;
        if (user) {
          await this.handle403(env, user.lineUserId);
          await LineService.pushMessage(
            env,
            user.lineUserId,
            `【系統通知】由於您的 104 登入憑證已失效，系統已自動解除您的帳號綁定。請重新進入 App 進行綁定，以確保後續功能正常。`,
          );
        }
      }
      throw e;
    }
  }

  private static async handle403(env: Env, lineUserId: string) {
    logger.warn({ msg: '403 Detected, invalidating user binding', lineUserId });
    try {
      await db.deleteUserByLineId(env.DB, lineUserId);
    } catch {
      /* might already be deleted */
    }
  }

  static async verifySalaryCode(env: Env, lineUserId: string, code: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    const newCookies = await HR104Adapter.verifySalaryCode(creds, code);
    if (newCookies) {
      await db.updateUserCookies(env.DB, creds.dbUser.id, newCookies);
    }
  }

  static async getSalaryYears(env: Env, lineUserId: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    return HR104Adapter.getSalaryYears(creds);
  }

  static async getSalaryList(env: Env, lineUserId: string, year: string) {
    try {
      const creds = await AuthService.getUserCredentials(env, lineUserId);
      return await HR104Adapter.getSalaryList(creds, year);
    } catch (e: any) {
      if (e.response && e.response.status === 403) await this.handle403(env, lineUserId);
      throw e;
    }
  }

  static async getSalaryDetail(env: Env, lineUserId: string, id: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    const rawHtml = await HR104Adapter.getSalaryDetail(creds, id);
    if (!rawHtml) return { html: '', items: [] };

    const html = HR104Adapter.unescapeHTML(rawHtml);
    const $ = cheerio.load(html);
    const items: { label: string; value: string; type?: 'earning' | 'deduction' | 'info' }[] = [];

    $('table tr').each((_i, el) => {
      const tds = $(el).find('td');
      const addItem = (labelTd: any, valueTd: any) => {
        const label = $(labelTd).text().trim();
        const value = $(valueTd).text().trim();
        if (label && value) {
          let type: 'earning' | 'deduction' | 'info' = 'info';
          const num = parseFloat(value.replace(/,/g, ''));
          if (label.includes('扣') || label.includes('稅') || label.includes('勞保') || label.includes('健保')) {
            type = 'deduction';
          } else if (!isNaN(num) && num > 0 && !label.includes('費') && !label.includes('率')) {
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

  static async getSalarySummary(env: Env, lineUserId: string, year: string) {
    const cacheKey = `summary:${lineUserId}:${year}`;
    const cached = salaryCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const creds = await AuthService.getUserCredentials(env, lineUserId);
    const list = await HR104Adapter.getSalaryList(creds, year);
    if (list.length === 0) return { tax: 0, income: 0, deduction: 0, real: 0 };

    const summary = { tax: 0, income: 0, deduction: 0, real: 0 };

    for (let i = 0; i < list.length; i += 5) {
      const chunk = list.slice(i, i + 5);
      const details = await Promise.all(
        chunk.map((item: any) => HR104Adapter.getSalaryDetail(creds, item.SALARY_CLOSE_ID)),
      );

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
          } catch {
            /* ignore */
          }
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

  static async getTeamAttendance(env: Env, lineUserId: string, year: string, month: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);

    let dateList: any[];
    try {
      dateList = await HR104Adapter.getSubordinateCalendarList(creds, year, month);
    } catch (e: any) {
      // 與 getPersonalAttendance 一致：403（token 失效）→ 自動解綁後重丟。
      if (e.response && e.response.status === 403) await this.handle403(env, lineUserId);
      throw e;
    }
    if (!dateList || dateList.length === 0) return { leaves: [], punches: [] };

    const dates = dateList.map((d: any) => d.QUERY_DATE);
    const allDetails: any[] = [];

    for (const dateStr of dates) {
      try {
        const day = dateStr.split('-')[2];
        const rows = await HR104Adapter.getSubordinateCalendarDetail(creds, year, month, day);
        const enrichedRows = rows.map((r: any) => ({ ...r, DATE: dateStr }));
        allDetails.push(...enrichedRows);
      } catch {
        logger.warn(`Failed to fetch details for ${dateStr}, skipping.`);
      }
      await sleep(200);
    }

    const result = { leaves: [] as any[], punches: [] as any[] };

    for (const item of allDetails) {
      const record = {
        empId: item.EMPLOYEE_ID,
        empName: item.EMPLOYEE_CNAME,
        dept: item.EMPLOYEE_JOB_DEPARTMENT,
        date: item.DATE,
        info: item.INFO_TYPE === '1' ? item.ASK_LEAVE_INFO : item.CARD_DATA_NAME,
      };

      if (item.INFO_TYPE === '1') {
        result.leaves.push(record);
      } else if (item.INFO_TYPE === '2') {
        // 過濾掉「超時出勤」：那是加班/超時，不是要追補打卡的異常。
        if (record.info && !record.info.includes('超時')) result.punches.push(record);
      }
    }

    const sortFn = (a: any, b: any) => {
      if (a.empId !== b.empId) return a.empId.localeCompare(b.empId);
      return b.date.localeCompare(a.date);
    };
    result.leaves.sort(sortFn);
    result.punches.sort(sortFn);

    return result;
  }

  static async getPersonalAttendance(env: Env, lineUserId: string, year: string, month: string) {
    try {
      const creds = await AuthService.getUserCredentials(env, lineUserId);
      const rows = await HR104Adapter.getEmployeeCalendarList(creds, year, month);

      return rows.map((r: any) => ({
        date: r.QUERY_DATE,
        dayType: r.CALENDAR_NAME,
        isWorkDay: r.IS_WORKDAY === '1',
        punchText: r.CARD_DATA_DATE,
        holidayName: r.HOLIDAY_NAME,
        exceptionName: r.CARD_DATA_NAME,
      }));
    } catch (e: any) {
      if (e.response && e.response.status === 403) await this.handle403(env, lineUserId);
      throw e;
    }
  }

  static async checkMonthlyAttendance(env: Env, lineUserId: string, year: string, month: string) {
    const data = await this.getPersonalAttendance(env, lineUserId, year, month);
    const today = new Date().toISOString().split('T')[0];

    return data.filter((d: any) => {
      if (d.date > today) return false;
      if (d.exceptionName) return true;
      if (d.isWorkDay) {
        if (!d.punchText || d.punchText.includes('--')) return true;
      }
      return false;
    });
  }

  static async getLeaveStatus(env: Env, lineUserId: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    const rawHtml = await HR104Adapter.getLeaveStatus(creds);

    const $ = cheerio.load(rawHtml);
    const data: any[] = [];
    let currentLeave: any = null;

    $('table tr').each((_i, el) => {
      const tds = $(el).find('td');

      if (tds.length === 1 && $(tds[0]).attr('colspan') === '2') {
        const headerText = $(tds[0]).text().trim();
        if (headerText.includes('假勤名稱')) {
          if (currentLeave) data.push(currentLeave);
          currentLeave = { name: headerText.replace('假勤名稱', '').trim(), total: '', used: '', balance: '', expiry: '' };
        }
      } else if (tds.length === 2 && currentLeave) {
        const label = $(tds[0]).text().trim();
        const value = $(tds[1]).text().trim();

        if (label.includes('可休')) {
          currentLeave.total = value;
          if (value.includes('/')) currentLeave.expiry = value.split('/').pop()?.trim() || '';
        } else if (label.includes('已休')) currentLeave.used = value;
        else if (label.includes('剩餘')) currentLeave.balance = value;
      }
    });

    if (currentLeave) data.push(currentLeave);
    return data;
  }

  static async getAuditList(env: Env, lineUserId: string) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    const categories = await HR104Adapter.getApprovalCategories(creds);
    let allItems: any[] = [];
    for (const cat of categories) {
      if (parseInt(cat.wsdCount) > 0) {
        const list = await HR104Adapter.getApprovalList(creds, cat.WORKSHEET_ID);
        list.forEach((item: any) => (item._category = cat.WorksheetName));
        allItems = allItems.concat(list);
      }
    }
    return allItems;
  }

  static async approveWorkflows(
    env: Env,
    lineUserId: string,
    approvalKeys: string[],
    progressCallback?: (data: any) => void,
    actorLineUserId?: string,
  ) {
    const creds = await AuthService.getUserCredentials(env, lineUserId);
    let successCount = 0;

    if (progressCallback) progressCallback({ type: 'start', total: approvalKeys.length });

    for (const [index, key] of approvalKeys.entries()) {
      if (actorLineUserId && !(await DelegationService.canActAs(env, actorLineUserId, lineUserId))) {
        if (progressCallback)
          progressCallback({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'error', error: '代理授權已撤銷，停止後續' });
        break;
      }
      try {
        await HR104Adapter.approveWorkflow(creds, key);
        successCount++;
        if (progressCallback)
          progressCallback({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'success' });
      } catch (e: any) {
        if (progressCallback)
          progressCallback({ type: 'progress', index: index + 1, total: approvalKeys.length, key, status: 'error', error: e.message });
      }
      if (index !== approvalKeys.length - 1) await sleep(500);
    }

    if (successCount > 0) {
      await this.logUsage(env, creds.dbUser.id, 'AUDIT', successCount, `Keys: ${approvalKeys.length}`, actorLineUserId);
    }
    if (progressCallback) progressCallback({ type: 'done', successCount });
  }

  static async getUsagesStats(env: Env) {
    const userGroups = await db.groupUsersByCompany(env.DB);
    const companyStats: Record<string, any> = {};

    for (const g of userGroups) {
      if (!g.companyId) continue;
      const key = `${g.companyId}_${g.internalCompanyId || '?'}`;
      const companyName = await CompanyService.getCompanyName(env, g.companyId, g.internalCompanyId || '?');
      companyStats[key] = {
        companyId: g.companyId,
        companyName,
        internalId: g.internalCompanyId || '?',
        userCount: g.cnt,
        checkInTotal: 0,
        auditTotal: 0,
        scheduleTotal: 0,
      };
    }

    const logs = await db.findUsageLogsWithCompany(env.DB);
    for (const log of logs) {
      if (!log.companyId) continue;
      const key = `${log.companyId}_${log.internalCompanyId || '?'}`;
      if (!companyStats[key]) {
        const companyName = await CompanyService.getCompanyName(env, log.companyId, log.internalCompanyId || '?');
        companyStats[key] = {
          companyId: log.companyId,
          companyName,
          internalId: log.internalCompanyId || '?',
          userCount: 0,
          checkInTotal: 0,
          auditTotal: 0,
          scheduleTotal: 0,
        };
      }
      if (log.action === 'CHECK_IN') companyStats[key].checkInTotal += log.count;
      if (log.action === 'AUDIT') companyStats[key].auditTotal += log.count;
      if (log.action === 'SCHEDULE') companyStats[key].scheduleTotal += log.count;
    }

    return Object.values(companyStats);
  }

  private static async logUsage(
    env: Env,
    userId: number,
    action: 'CHECK_IN' | 'AUDIT',
    count: number,
    details?: string,
    actorLineUserId?: string,
  ) {
    try {
      let actorUserId: number | null = null;
      if (actorLineUserId) {
        const actor = await db.findUserByLineId(env.DB, actorLineUserId);
        actorUserId = actor?.id ?? null;
      }
      await db.createUsageLog(env.DB, { userId, action, count, details, actorUserId });
    } catch (e) {
      logger.error({ err: String(e) }, 'Log Usage failed');
    }
  }
}
