/**
 * AES-256-CBC（Web Crypto），與原 node:crypto 版本的密文格式完全相容：
 *   - key：64-char hex → 32 bytes
 *   - iv：16 random bytes，輸出 hex
 *   - ciphertext：hex，PKCS7 padding（Web Crypto AES-CBC 與 node 預設一致）
 * 因此 D1 沿用 Postgres 既有的 encryptedToken/iv 不需重新加密。
 */

const keyCache = new Map<string, Promise<CryptoKey>>();

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function importKey(hexKey: string): Promise<CryptoKey> {
  let p = keyCache.get(hexKey);
  if (!p) {
    const raw = hexToBytes(hexKey);
    if (raw.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be a 32-byte (64 hex char) string');
    }
    p = crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
    keyCache.set(hexKey, p);
  }
  return p;
}

export async function encrypt(hexKey: string, text: string): Promise<{ encryptedData: string; iv: string }> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, new TextEncoder().encode(text));
  return { encryptedData: bytesToHex(new Uint8Array(ct)), iv: bytesToHex(iv) };
}

export async function decrypt(hexKey: string, hexCipher: string, hexIv: string): Promise<string> {
  const key = await importKey(hexKey);
  const iv = hexToBytes(hexIv);
  const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, hexToBytes(hexCipher));
  return new TextDecoder().decode(pt);
}
