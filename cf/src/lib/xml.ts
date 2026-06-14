import { XMLParser } from 'fast-xml-parser';

// 與原 adapter 相同：new XMLParser() 預設選項（ignoreAttributes: true）。
const parser = new XMLParser();

export function parseXml(xml: string): any {
  return parser.parse(xml);
}

/**
 * 104 的 FunctionExecResult.IsSuccess 在不同 parser 版本可能是 boolean 或 "true" 字串。
 * 一律用這兩個 helper 判斷，避免 === true 在字串情形誤判。
 */
export function isSuccess(result: any): boolean {
  const v = result?.IsSuccess;
  return v === true || v === 'true';
}

export function isFailure(result: any): boolean {
  const v = result?.IsSuccess;
  return v === false || v === 'false';
}

export function unescapeHTML(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}
