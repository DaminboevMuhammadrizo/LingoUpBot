// Indexes over db.users kept up to date on every change, so admin requests never scan or sort:
//   counters  — total, registered, per level   (O(1) to read)
//   joined    — registered users ordered by join time (append-only; new users / pages = slices)
// `rev` changes with every update: the admin summary is built once per rev and served from memory.
import { EventEmitter } from 'node:events';
import { db } from './db.js';

export const LEVELS = [
  { id: 'beginner', name: 'Beginner', code: 'A1' },
  { id: 'elementary', name: 'Elementary', code: 'A2' },
  { id: 'pre-intermediate', name: 'Pre-Intermediate', code: 'B1-' },
  { id: 'intermediate', name: 'Intermediate', code: 'B1+' },
  { id: 'ielts', name: 'IELTS', code: 'B2+' },
];
const LEVEL_IDS = new Set(LEVELS.map((l) => l.id));

export const events = new EventEmitter(); // 'user' (new registration), 'change'
events.setMaxListeners(100);

const counts = { registered: 0, levels: Object.fromEntries(LEVELS.map((l) => [l.id, 0])), noLevel: 0 };
let joined = []; // registered users, oldest first
export let rev = 0;

const levelOf = (u) => (LEVEL_IDS.has(u.level) ? u.level : null);
function count(u, sign) {
  if (!u.phone) return;
  counts.registered += sign;
  const l = levelOf(u);
  if (l) counts.levels[l] += sign;
  else counts.noLevel += sign;
}

export function rebuildIndex() {
  counts.registered = 0;
  counts.noLevel = 0;
  for (const k of Object.keys(counts.levels)) counts.levels[k] = 0;
  joined = Object.values(db.users).filter((u) => u.phone);
  joined.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  for (const u of joined) count(u, 1);
  blobDirty = true;
  rev++;
}

/** the user has just shared the phone number */
export function userRegistered(u) {
  count(u, 1);
  joined.push(u);
  blobDirty = true;
  rev++;
  events.emit('user', publicUser(u));
  events.emit('change');
}

/** fields reported by the Mini App: level and learning statistics */
export function updateProfile(u, p) {
  const before = levelOf(u);
  count(u, -1);
  if (p.level === null || LEVEL_IDS.has(p.level)) u.level = p.level;
  for (const k of ['watched', 'tests', 'avg', 'words']) if (Number.isFinite(p[k])) u[k] = Math.max(0, Math.min(1e6, Math.round(p[k])));
  if (p.lang === 'uz' || p.lang === 'ru') u.appLang = p.lang;
  u.appSeen = Date.now();
  count(u, 1);
  rev++;
  if (before !== levelOf(u)) events.emit('change');
}

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    phone: u.phone,
    lang: u.appLang || u.lang,
    level: levelOf(u),
    joinedAt: u.joinedAt,
    lastSeen: Math.max(u.lastSeen || 0, u.appSeen || 0) || null,
    watched: u.watched ?? 0,
    tests: u.tests ?? 0,
    avg: u.avg ?? 0,
    words: u.words ?? 0,
    blocked: !!u.blocked,
  };
}

// ---------------------------------------------------------------- queries
const DAY = 864e5;
/** index of the first registered user who joined at or after `ts` (binary search) */
function firstSince(ts) {
  let lo = 0;
  let hi = joined.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((joined[mid].joinedAt || 0) < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function summary() {
  const now = Date.now();
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const reg = counts.registered;
  const pct = (n, of) => (of ? Math.round((n / of) * 1000) / 10 : 0);
  const withLevel = reg - counts.noLevel;
  let active7 = 0;
  let blocked = 0;
  for (const u of joined) {
    if (Math.max(u.lastSeen || 0, u.appSeen || 0) > now - 7 * DAY) active7++;
    if (u.blocked) blocked++;
  }
  return {
    users: {
      total: Object.keys(db.users).length,
      registered: reg,
      today: joined.length - firstSince(startOfDay),
      last7d: joined.length - firstSince(now - 7 * DAY),
      last30d: joined.length - firstSince(now - 30 * DAY),
      active7d: active7,
      blocked,
    },
    levels: LEVELS.map((l) => ({
      ...l,
      count: counts.levels[l.id],
      pct: pct(counts.levels[l.id], reg), // share of all registered users
      pctOfChosen: pct(counts.levels[l.id], withLevel), // share of those who picked a level
    })),
    noLevel: { count: counts.noLevel, pct: pct(counts.noLevel, reg) },
    donations: {
      confirmed: db.donations.filter((d) => d.status === 'confirmed').reduce((s, d) => s + d.amount, 0),
      pending: db.donations.filter((d) => d.status === 'pending').length,
    },
    generatedAt: now,
  };
}

// Search: one string with every registered user's "name username phone id" (lower-case), in join order,
// separated by \n. lastIndexOf walks it from the end, so matches come newest first and a page stops as
// soon as it is full. Rebuilt lazily after registrations or name changes.
let blob = '';
let starts = []; // starts[i] = offset of joined[i] in blob
let blobDirty = true;
export const searchChanged = () => void (blobDirty = true);
function buildBlob() {
  const parts = new Array(joined.length);
  starts = new Array(joined.length);
  let pos = 0;
  for (let i = 0; i < joined.length; i++) {
    const u = joined[i];
    parts[i] = `${u.name || ''} ${u.username || ''} ${u.phone || ''} ${u.id}`.toLowerCase().replace(/\n/g, ' ');
    starts[i] = pos;
    pos += parts[i].length + 1;
  }
  blob = parts.join('\n');
  blobDirty = false;
}
function indexAt(pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** newest first; cursor = joinedAt of the last item of the previous page */
export function listUsers({ limit = 50, before = Infinity, level = null, q = '' }) {
  limit = Math.max(1, Math.min(500, limit | 0));
  const needle = q.replace(/\s+/g, ' ').trim().toLowerCase().replace(/^@/, '');
  const okLevel = (u) => !level || (level === 'none' ? !levelOf(u) : levelOf(u) === level);
  const items = [];
  let i = Math.min(joined.length, firstSince(before)) - 1;
  if (!needle) {
    for (; i >= 0 && items.length < limit; i--) if (okLevel(joined[i])) items.push(publicUser(joined[i]));
  } else if (i >= 0) {
    if (blobDirty || starts.length !== joined.length) buildBlob();
    let pos = blob.indexOf('\n', starts[i]); // end of joined[i]'s line
    if (pos < 0) pos = blob.length;
    for (;;) {
      const hit = blob.lastIndexOf(needle, pos - needle.length);
      if (hit < 0) {
        i = -1;
        break;
      }
      i = indexAt(hit);
      if (okLevel(joined[i])) items.push(publicUser(joined[i]));
      if (items.length >= limit) {
        i--;
        break;
      }
      pos = starts[i] - 1; // continue before this user's line
      if (pos < 0) {
        i = -1;
        break;
      }
    }
  }
  const last = items.at(-1);
  return { items, next: i >= 0 && last ? last.joinedAt : null, total: counts.registered };
}

export function newUsers(since) {
  return joined.slice(firstSince(since + 1)).reverse().slice(0, 500).map(publicUser);
}
