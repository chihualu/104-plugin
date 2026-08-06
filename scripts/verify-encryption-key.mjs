/**
 * 驗證候選的 ENCRYPTION_KEY 能不能解開現有使用者的 104 token。
 *
 * 遷移前一定要先跑這個：鑰匙不對的話 37 個使用者全部要重新綁定，
 * 而且是「部署下去、使用者打不開 App」才會發現。
 *
 * 用法（在 repo 根目錄）：
 *   ENCRYPTION_KEY="<候選的 64 字元 hex>" node scripts/verify-encryption-key.mjs
 *
 * 資料來源預設是 Cloudflare D1（現行正式環境）。已經匯進 Postgres 的話：
 *   SOURCE=pg DATABASE_URL="postgresql://..." ENCRYPTION_KEY="..." node scripts/verify-encryption-key.mjs
 *
 * 本腳本只讀取，不寫入任何資料庫，也**不會**把金鑰或解密後的 token 印出來——
 * 只回報成功與否，以及遮蔽過的長度／前後綴，足以判斷結果是否合理。
 */

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const KEY_HEX = process.env.ENCRYPTION_KEY || '';
const SOURCE = process.env.SOURCE || 'd1';
const D1_NAME = process.env.D1_NAME || 'ehr-104';
const SAMPLE = Number(process.env.SAMPLE || 5);

if (!KEY_HEX) {
  console.error('ERROR: 請設定 ENCRYPTION_KEY，例如：');
  console.error('  ENCRYPTION_KEY="<64 字元 hex>" node scripts/verify-encryption-key.mjs');
  process.exit(2);
}

let keyBuffer;
try {
  keyBuffer = Buffer.from(KEY_HEX, 'hex');
  if (keyBuffer.length !== 32) throw new Error(`長度是 ${keyBuffer.length} bytes，應為 32`);
} catch (e) {
  console.error(`ERROR: ENCRYPTION_KEY 格式不對（${e.message}）。應該是 64 個十六進位字元。`);
  process.exit(2);
}

/** 遮蔽輸出：只露出長度與頭尾各 3 字元，足以人工判斷但不外洩。 */
function mask(s) {
  if (s.length <= 8) return `<${s.length} chars>`;
  return `${s.slice(0, 3)}…${s.slice(-3)} (${s.length} chars)`;
}

async function loadRows() {
  if (SOURCE === 'pg') {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const r = await client.query(
      'SELECT "empId", "encryptedToken", "iv" FROM "UserBinding" ORDER BY id LIMIT $1',
      [SAMPLE],
    );
    await client.end();
    return r.rows;
  }
  const out = execSync(
    `npx wrangler d1 execute ${D1_NAME} --remote --json --command ` +
      `"SELECT empId, encryptedToken, iv FROM UserBinding ORDER BY id LIMIT ${SAMPLE}"`,
    { cwd: 'cf', encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const lines = out.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '[');
  if (start === -1) throw new Error(`wrangler 沒有回傳 JSON:\n${out.slice(0, 400)}`);
  return JSON.parse(lines.slice(start).join('\n'))[0]?.results ?? [];
}

function decrypt(encryptedHex, ivHex) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString();
}

const rows = await loadRows();
if (rows.length === 0) {
  console.error('沒有讀到任何 UserBinding，無法驗證。');
  process.exit(2);
}

let ok = 0;
for (const r of rows) {
  try {
    const token = decrypt(r.encryptedToken, r.iv);
    // 解錯鑰匙時 AES-CBC 多半會在 padding 檢查就丟錯；少數情況會解出亂碼，
    // 所以再檢查一次結果是不是可列印字元組成的合理字串。
    const printable = /^[\x20-\x7e]+$/.test(token) && token.length >= 8;
    if (printable) {
      ok++;
      console.log(`  ${r.empId}: OK  token=${mask(token)}`);
    } else {
      console.log(`  ${r.empId}: FAIL（解出來是亂碼，鑰匙不對）`);
    }
  } catch (e) {
    console.log(`  ${r.empId}: FAIL（${e.message}）`);
  }
}

console.log(`\n${ok}/${rows.length} 筆解密成功。`);
if (ok === rows.length) {
  console.log('✅ 這把 ENCRYPTION_KEY 正確，可以安全沿用，使用者不需重新綁定。');
  process.exit(0);
}
console.log('❌ 鑰匙不對。若確定找不回原本那把，就得讓所有使用者重新綁定。');
process.exit(1);
