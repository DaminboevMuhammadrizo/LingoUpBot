// Reads .env (KEY=value lines) into process.env without any dependency.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
const file = resolve(ROOT, '.env');
if (existsSync(file))
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
export const env = {
  token: process.env.BOT_TOKEN || '',
  webappUrl: process.env.WEBAPP_URL || '',
  admins: list(process.env.ADMIN_IDS).map(Number),
  adminChat: Number(process.env.ADMIN_CHAT_ID || list(process.env.ADMIN_IDS)[0] || 0),
  storageChat: process.env.STORAGE_CHAT_ID || '',
  botUsername: process.env.BOT_USERNAME || '',
  // web server
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  // RAM for the response cache (Flix + pictures), disk for what does not fit, and the RSS level at which
  // the cache gives memory back before the process gets near pm2's restart limit
  cacheMb: Number(process.env.CACHE_MAX_MB || 400),
  diskCacheMb: Number(process.env.DISK_CACHE_MAX_MB || 2048),
  rssSoftMb: Number(process.env.RSS_SOFT_MB || 700),
  // telegram (default): pictures come from Telegram by file_id; local: from public/img only
  mediaSource: process.env.MEDIA_SOURCE || 'telegram',
  // a local Bot API server or a test stub can be used instead of Telegram's
  apiBase: (process.env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, ''),
};
