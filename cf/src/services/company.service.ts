import type { Env } from '../env';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { TtlCache } from '../lib/cache';
import { logger } from '../lib/logger';

/**
 * 每公司設定 + 公司名稱解析。
 * 原本讀 gitignored 的 config/104.config.json；Workers 無檔案系統，改由
 * env.COMPANY_CONFIG_JSON（整包 JSON 字串）提供，解析後快取。
 */

const DEFAULT_CONFIG = {
  default: {
    checkIn: { searchKeyword: '刷卡' },
    location: { lat: 25.04791, lng: 121.55823 },
  },
};

let cachedRaw: string | undefined | null = undefined;
let cachedParsed: any = null;

function loadConfig(env: Env): any {
  const raw = env.COMPANY_CONFIG_JSON;
  if (cachedParsed && cachedRaw === raw) return cachedParsed;
  let parsed: any = DEFAULT_CONFIG;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.warn('COMPANY_CONFIG_JSON parse failed, using default');
      parsed = DEFAULT_CONFIG;
    }
  }
  cachedRaw = raw;
  cachedParsed = parsed;
  return parsed;
}

const companyNameCache = new TtlCache<string>(1000 * 60 * 60 * 24, 100); // 24h

export class CompanyService {
  static async getCompanyName(env: Env, groupUBINo: string, internalId: string): Promise<string> {
    const APP_CONFIG = loadConfig(env);
    let companyName = groupUBINo;
    let foundInConfig = false;

    if (Array.isArray(APP_CONFIG.companies)) {
      const config = APP_CONFIG.companies.find(
        (c: any) => c.groupUBINo === groupUBINo && (c.companyID === internalId || c.companyID === '*'),
      );
      if (config && config.companyName) {
        companyName = config.companyName;
        foundInConfig = true;
      }
    }

    if (!foundInConfig) {
      const cacheKey = `${groupUBINo}_${internalId}`;
      const cached = companyNameCache.get(cacheKey);
      if (cached !== undefined) {
        companyName = cached;
      } else {
        try {
          const companies = await HR104Adapter.getCompanyList(groupUBINo);
          if (companies && companies.length > 0) {
            const matched = companies.find((c: any) => c.COMPANY_ID === internalId);
            if (matched && matched.COMPANY_CNAME) {
              companyName = matched.COMPANY_CNAME;
              companyNameCache.set(cacheKey, companyName);
            } else if (companies[0] && companies[0].COMPANY_CNAME) {
              if (internalId === '*') {
                companyName = companies[0].COMPANY_CNAME + ' (All)';
                companyNameCache.set(cacheKey, companyName);
              }
            }
          }
        } catch {
          /* ignore — fallback to groupUBINo */
        }
      }
    }
    return companyName;
  }

  static getConfig(env: Env, groupUBINo: string, internalId: string): any {
    const APP_CONFIG = loadConfig(env);
    if (Array.isArray(APP_CONFIG.companies)) {
      return APP_CONFIG.companies.find(
        (c: any) => c.groupUBINo === groupUBINo && (c.companyID === internalId || c.companyID === '*'),
      );
    }
    return null;
  }

  static getDefaultConfig(env: Env): any {
    return loadConfig(env).default;
  }
}
