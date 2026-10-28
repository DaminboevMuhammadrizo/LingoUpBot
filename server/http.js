// Web server for the Mini App, no framework. Every response is prepared once and kept in memory
// already compressed (brotli + gzip): a request is a Map lookup and a socket write.
//   GET /                      app shell (skeleton + inlined CSS/JS)        no-cache + ETag (→ 304)
//   GET /sw.js                 service worker                                no-cache
//   GET /c/*.js, /icons/*      hashed chunks, icons                          cached for a year
//   GET /api/init              everything the first screen needs, one request; 304 when unchanged
//   GET /api/flix/:id?lang=    one story (text, translation, glossary, test)  LFU cache
//   GET /img/:name             pictures from Telegram (file_id) / disk         LFU cache, spills to disk
//   POST /api/me               the app reports level + learning stats (signed Telegram initData)
//   /api/admin/*               admin API (server/admin.js)
//   GET /api/health            liveness for deploys and monitoring
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, brotliDecompressSync, constants as Z } from 'node:zlib';
import { env, ROOT } from './env.js';
import { ByteLFU } from './cache.js';
import { loadImage } from './media.js';
import { db, touch } from './db.js';
import { handleAdmin } from './admin.js';
import { userFromRequest, isAdminId } from './auth.js';
import { updateProfile } from './users.js';

const PUB = resolve(ROOT, 'public');
const log = (...a) => console.log(new Date().toISOString(), '[http]', ...a);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
};
const YEAR = 'public, max-age=31536000, immutable';
const etagOf = (buf) => `"${createHash('sha1').update(buf).digest('base64url').slice(0, 16)}"`;

/** A response body in every encoding we may send. */
function pack(raw, type, cache, etag = etagOf(raw)) {
  const text = /^(text|application\/json|image\/svg)/.test(type);
  return {
    type,
    cache,
    etag,
    raw: text ? null : raw, // text is kept compressed only; plain is decoded on the rare client without br/gzip
    br: text ? brotliCompressSync(raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_SIZE_HINT]: raw.length } }) : null,
    gz: text ? gzipSync(raw, { level: 9 }) : null,
  };
}
const packSize = (p) => (p.raw?.length || 0) + (p.br?.length || 0) + (p.gz?.length || 0) + 200;

// ---------------------------------------------------------------- pinned files (small, always in RAM)
const pinned = new Map();
function loadPinned() {
  pinned.clear();
  const add = (url, file, cache) => {
    const raw = readFileSync(file);
    pinned.set(url, pack(raw, TYPES[extname(file)] || 'application/octet-stream', cache));
  };
  add('/', resolve(PUB, 'index.html'), 'no-cache');
  add('/sw.js', resolve(PUB, 'sw.js'), 'no-cache');
  add('/favicon.svg', resolve(PUB, 'favicon.svg'), 'public, max-age=604800');
  add('/privacy', resolve(PUB, 'privacy.html'), 'public, max-age=3600');
  for (const dir of ['c', 'icons'])
    if (existsSync(resolve(PUB, dir)))
      for (const n of readdirSync(resolve(PUB, dir))) add(`/${dir}/${n}`, resolve(PUB, dir, n), dir === 'c' ? YEAR : 'public, max-age=604800');
}

// ---------------------------------------------------------------- /api/init (one bootstrap request)
let init = null;
let knownIds = new Set(); // only real stories and pictures reach the cache
let knownImages = new Set();
let campaignState = () => ({ collected: 0, bot: env.botUsername || null });
export function refreshInit() {
  const base = JSON.parse(readFileSync(resolve(PUB, 'data/index.json'), 'utf8'));
  const { collected, bot } = campaignState();
  knownIds = new Set(base.flix.map((f) => f.id));
  knownImages = new Set([...(existsSync(resolve(PUB, 'img')) ? readdirSync(resolve(PUB, 'img')) : []), ...Object.keys(db.files || {})]);
  const v = `${base.v}.${collected}`;
  const body = Buffer.from(JSON.stringify({ ...base, v, bot, campaign: base.campaign && { ...base.campaign, collected } }));
  init = pack(body, TYPES['.json'], 'no-cache', `"${v}"`);
}

// ---------------------------------------------------------------- cache for stories and pictures
const cache = new ByteLFU({
  maxBytes: env.cacheMb * 2 ** 20,
  diskDir: resolve(ROOT, 'data/cache'),
  diskMaxBytes: env.diskCacheMb * 2 ** 20,
});

function flix(id, lang) {
  return cache.getOrLoad(`f:${id}:${lang}`, async () => {
    const p = pack(readFileSync(resolve(PUB, `data/f/${id}.${lang}.json`)), TYPES['.json'], YEAR);
    return { value: p, size: packSize(p) };
  });
}

const imgFromBuf = (name, buf) => {
  const p = pack(buf, TYPES[extname(name)] || 'application/octet-stream', YEAR);
  return { value: p, size: packSize(p), encode: (v) => v.raw };
};
function image(name) {
  return cache.getOrLoad(
    `i:${name}`,
    async () => {
      const r = await loadImage(name);
      if (!r) return { value: null, size: 64 };
      return { ...imgFromBuf(name, r.data), spill: r.fromTelegram };
    },
    (buf) => imgFromBuf(name, buf),
  );
}

// ---------------------------------------------------------------- responses
function send(req, res, p, cacheOverride) {
  if (!p) return notFound(res);
  const headers = {
    'content-type': p.type,
    'cache-control': cacheOverride || p.cache,
    etag: p.etag,
    vary: 'accept-encoding',
    'x-content-type-options': 'nosniff',
  };
  if (req.headers['if-none-match'] === p.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = p.raw;
  if (!body) {
    const ae = req.headers['accept-encoding'] || '';
    if (/\bbr\b/.test(ae)) (body = p.br), (headers['content-encoding'] = 'br');
    else if (/\bgzip\b/.test(ae)) (body = p.gz), (headers['content-encoding'] = 'gzip');
    else body = brotliDecompressSync(p.br);
  }
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}
function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
  res.end('not found');
}

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        fail(new Error('too large'));
        req.destroy();
      } else parts.push(c);
    });
    req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
    req.on('error', fail);
  });
}
const reply = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

// POST /api/me: { level, lang, watched, tests, avg, words } from the app of a signed-in user
async function me(req, res) {
  const tgUser = userFromRequest(req);
  if (!tgUser) return reply(res, 401, { error: 'unauthorized' });
  let body;
  try {
    body = JSON.parse(await readBody(req, 2048));
  } catch {
    return reply(res, 400, { error: 'bad body' });
  }
  const u = (db.users[tgUser.id] ||= { id: tgUser.id, joinedAt: null, phone: null, lastSeen: Date.now() });
  u.name ||= [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ');
  u.username ??= tgUser.username || null;
  updateProfile(u, body);
  touch();
  reply(res, 200, { ok: true, admin: isAdminId(tgUser.id) });
}

async function handle(req, res) {
  const q = req.url.indexOf('?');
  const path = q < 0 ? req.url : req.url.slice(0, q);
  const query = q < 0 ? '' : req.url.slice(q + 1);
  if (path === '/api/me' && req.method === 'POST') return me(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    return res.end();
  }
  if (path.startsWith('/api/admin/')) return handleAdmin(req, res, path, query);

  const hit = pinned.get(path === '/index.html' ? '/' : path);
  if (hit) return send(req, res, hit);
  if (path === '/api/init') return send(req, res, init);
  if (path === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()), rssMb: Math.round(process.memoryUsage.rss() / 2 ** 20) }));
  }
  let m = path.match(/^\/api\/flix\/(\d{1,6})$/);
  if (m && knownIds.has(Number(m[1]))) {
    const lang = /(?:^|&)lang=ru(?:&|$)/.test(query) ? 'ru' : 'uz';
    // without the version hash in the URL the answer may change, so it is not cached for a year
    return send(req, res, await flix(Number(m[1]), lang), /(?:^|&)h=/.test(query) ? null : 'no-cache');
  }
  m = path.match(/^\/img\/([\w-]{1,64}\.(?:avif|webp|jpe?g|png))$/);
  if (m && knownImages.has(m[1])) return send(req, res, await image(m[1]), /(?:^|&)h=/.test(query) ? null : 'public, max-age=3600');
  // anything else inside the app (e.g. reloads on a sub-path) gets the shell
  if (req.headers.accept?.includes('text/html')) return send(req, res, pinned.get('/'));
  notFound(res);
}

// ---------------------------------------------------------------- start
export function stats() {
  const mu = process.memoryUsage();
  const mb = (n) => Math.round(n / 2 ** 20);
  return { rssMb: mb(mu.rss), heapMb: mb(mu.heapUsed), externalMb: mb(mu.external + mu.arrayBuffers), cache: cache.info(), uptimeMin: Math.round(process.uptime() / 60) };
}

export async function startHttp({ campaign } = {}) {
  if (campaign) campaignState = campaign;
  loadPinned();
  refreshInit();
  const server = createServer((req, res) =>
    handle(req, res).catch((e) => {
      log('error:', e.message);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }),
  );
  server.keepAliveTimeout = 65_000; // longer than the proxy's, so it reuses connections
  server.headersTimeout = 66_000;
  await new Promise((r) => server.listen(env.port, env.host, r));
  log(`listening on http://${env.host}:${env.port} · cache ${env.cacheMb} MB RAM + ${env.diskCacheMb} MB disk`);

  // memory guard: give cache memory back long before pm2's hard restart limit
  setInterval(() => {
    const rss = process.memoryUsage.rss() / 2 ** 20;
    if (rss > env.rssSoftMb) {
      cache.shrink(0.5);
      log(`rss ${Math.round(rss)} MB > ${env.rssSoftMb} MB: cache shrunk to ${cache.info().mb} MB`);
    }
  }, 15_000).unref();

  // warm-up: every story in both languages is compressed and in RAM before anyone asks
  setTimeout(async () => {
    const ids = JSON.parse(readFileSync(resolve(PUB, 'data/index.json'), 'utf8')).flix.map((f) => f.id);
    for (const id of ids) for (const lang of ['uz', 'ru']) await flix(id, lang);
    log(`warm: ${ids.length * 2} stories in RAM (${cache.info().mb} MB)`);
  }, 200).unref();
  return server;
}
