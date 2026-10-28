// Admin API. Every request must carry Telegram's signed launch data of a user listed in ADMIN_IDS:
//   Authorization: tma <initData>
//   GET /api/admin/me                         → { admin: true, id }
//   GET /api/admin/summary                    → counts, new users today/7d/30d, levels with %, donations
//   GET /api/admin/users?limit=&before=&level=&q=  → page of users, newest first (+ next cursor)
//   GET /api/admin/users/new?since=<ms>       → users who registered after `since`
//   GET /api/admin/users/<id>                 → one user
//   GET /api/admin/events                     → live stream (SSE): "user" on every new registration,
//                                               "summary" whenever the numbers change
import { gzipSync } from 'node:zlib';
import { userFromRequest, isAdminId } from './auth.js';
import { db } from './db.js';
import * as users from './users.js';

const json = (req, res, status, body, extra = {}) => {
  let buf = Buffer.from(JSON.stringify(body));
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', ...extra };
  if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = gzipSync(buf, { level: 5 }); // fast level: these answers are built per request
    headers['content-encoding'] = 'gzip';
  }
  headers['content-length'] = buf.length;
  res.writeHead(status, headers);
  res.end(buf);
};

// the summary is rebuilt only when something changed (users.rev), otherwise served from memory
let cached = { rev: -1, body: null, etag: '' };
function summary() {
  if (cached.rev !== users.rev) {
    const body = users.summary();
    cached = { rev: users.rev, body, etag: `"s${users.rev}"` };
  }
  return cached;
}

const streams = new Set();
users.events.on('user', (u) => broadcast('user', u));
let pendingSummary = null;
users.events.on('change', () => {
  // many changes in a burst → one "summary" event
  pendingSummary ||= setTimeout(() => {
    pendingSummary = null;
    broadcast('summary', summary().body);
  }, 1000);
});
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams) res.write(msg);
}
setInterval(() => {
  for (const res of streams) res.write(': ping\n\n');
}, 25_000).unref();

export function handleAdmin(req, res, path, query) {
  const me = userFromRequest(req, 86400);
  if (!me) return json(req, res, 401, { error: 'unauthorized: send Telegram initData as "Authorization: tma <initData>"' });
  if (!isAdminId(me.id)) return json(req, res, 403, { error: 'forbidden: not in ADMIN_IDS' });
  const p = new URLSearchParams(query);

  if (path === '/api/admin/me') return json(req, res, 200, { admin: true, id: me.id });
  if (path === '/api/admin/summary') {
    const s = summary();
    if (req.headers['if-none-match'] === s.etag) {
      res.writeHead(304, { etag: s.etag });
      return res.end();
    }
    return json(req, res, 200, s.body, { etag: s.etag, 'cache-control': 'private, no-cache' });
  }
  if (path === '/api/admin/users')
    return json(req, res, 200, users.listUsers({ limit: Number(p.get('limit') || 50), before: Number(p.get('before')) || Infinity, level: p.get('level'), q: p.get('q') || '' }));
  if (path === '/api/admin/users/new') return json(req, res, 200, { items: users.newUsers(Number(p.get('since') || 0)) });
  const m = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (m) {
    const u = db.users[m[1]];
    return u ? json(req, res, 200, users.publicUser(u)) : json(req, res, 404, { error: 'not found' });
  }
  if (path === '/api/admin/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`event: summary\ndata: ${JSON.stringify(summary().body)}\n\n`);
    streams.add(res);
    req.on('close', () => streams.delete(res));
    return;
  }
  json(req, res, 404, { error: 'unknown admin endpoint' });
}
