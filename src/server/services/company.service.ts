import { LRUCache } from 'lru-cache';
import { HR104Adapter } from '../adapters/hr104.adapter';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// In-memory cache for company names: groupUBINo_internalId -> companyName
const companyNameCache = new LRUCache<string, string>({
  max: 100,
  ttl: 1000 * 60 * 60 * 24, // 24 hours
});

let APP_CONFIG: any = { default: { checkIn: { searchKeyword: '刷卡' } } };
try {
  const configPath = path.join(__dirname, '../../../config/104.config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    APP_CONFIG = JSON.parse(raw);
  }
} catch (e) { logger.warn('Config load failed, using default'); }

export class CompanyService {
  
  static async getCompanyName(groupUBINo: string, internalId: string) {
        // 1. Try Config
        let companyName = groupUBINo; // Default
        let foundInConfig = false;
        
        if (Array.isArray(APP_CONFIG.companies)) {
            const config = APP_CONFIG.companies.find((c: any) => 
                c.groupUBINo === groupUBINo && 
                (c.companyID === internalId || c.companyID === '*')
            );
            if (config && config.companyName) {
                companyName = config.companyName;
                foundInConfig = true;
            }
        }

        // 2. Try Cache / API if not in config
        if (!foundInConfig) {
            const cacheKey = `${groupUBINo}_${internalId}`;
            if (companyNameCache.has(cacheKey)) {
                companyName = companyNameCache.get(cacheKey)!;
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
                                 companyName = companies[0].COMPANY_CNAME + " (All)";
                                 companyNameCache.set(cacheKey, companyName);
                             }
                        }
                    }
                } catch (e) { }
            }
        }
        return companyName;
  }

  static getConfig(groupUBINo: string, internalId: string) {
    if (Array.isArray(APP_CONFIG.companies)) {
        return APP_CONFIG.companies.find((c: any) => 
            c.groupUBINo === groupUBINo && 
            (c.companyID === internalId || c.companyID === '*')
        );
    }
    return null;
  }

  static getDefaultConfig() {
      return APP_CONFIG.default;
  }
}
