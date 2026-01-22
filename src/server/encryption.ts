import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ''; 
const IV_LENGTH = 16; // AES block size

// 解析 Key
let keyBuffer: Buffer;
try {
  keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (keyBuffer.length !== 32) {
      throw new Error('Key length is not 32 bytes');
  }
} catch (e) {
  console.warn('Invalid ENCRYPTION_KEY format. Using fallback (INSECURE for production).');
  // Fallback for development only
  keyBuffer = crypto.scryptSync('default_password', 'salt', 32);
}

export function encrypt(text: string): { encryptedData: string; iv: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted.toString('hex'),
  };
}

export function decrypt(text: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(text, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
