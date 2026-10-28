// Telegram Mini App authentication. The app sends Telegram's signed launch data (initData) in
//   Authorization: tma <initData>
// and the server checks the HMAC with the bot token — a user id alone could be faked by anyone.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

let secret = null;
const seen = new Map(); // initData -> { user, at } — the same launch data is checked once
const MAX_SEEN = 5000;

/** Returns the Telegram user ({ id, first_name, ... }) or null. */
export function verifyInitData(raw, maxAgeSec = 7 * 86400) {
  if (!raw || !env.token || raw.length > 4096) return null;
  const now = Math.floor(Date.now() / 1000);
  const cached = seen.get(raw);
  if (cached) return now - cached.authDate <= maxAgeSec ? cached.user : null;

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  secret ||= createHmac('sha256', 'WebAppData').update(env.token).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date') || 0);
  let user = null;
  try {
    user = JSON.parse(params.get('user'));
  } catch {}
  if (!user?.id) return null;
  if (seen.size >= MAX_SEEN) seen.delete(seen.keys().next().value);
  seen.set(raw, { user, authDate });
  return now - authDate <= maxAgeSec ? user : null;
}

export function userFromRequest(req, maxAgeSec) {
  const h = req.headers.authorization || '';
  return h.startsWith('tma ') ? verifyInitData(h.slice(4), maxAgeSec) : null;
}

export const isAdminId = (id) => env.admins.includes(Number(id));
