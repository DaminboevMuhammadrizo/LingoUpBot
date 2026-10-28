// Builds public/ (what the server sends) from web/src/ and content/:
//   public/index.html            first screen: skeleton + inlined minified CSS and core JS (one request)
//   public/c/<chunk>.<hash>.js   player and test, loaded on demand
//   public/sw.js                 service worker with this build's version and file list
//   public/data/index.json       Flix list (no texts); the server adds the bot name and donation sum
//   public/data/f/<id>.<lang>.json  one Flix for one language: text, translation, glossary, test
//   public/img/<id>[-s].avif|webp   picture 720px / thumbnail 360px
// Usage: node tools/build.mjs            full build (needs ImageMagick for new pictures)
//        node tools/build.mjs --validate only check content/quizzes.txt (used by CI)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, copyFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(ROOT, 'web/src');
const OUT = resolve(ROOT, 'public');
const VALIDATE_ONLY = process.argv.includes('--validate');
const LANGS = ['uz', 'ru'];
const flix = JSON.parse(readFileSync(resolve(ROOT, 'content/flix.json'), 'utf8'));
const campaign = JSON.parse(readFileSync(resolve(ROOT, 'content/campaign.json'), 'utf8'));
const handWritten = parseQuizzes(readFileSync(resolve(ROOT, 'content/quizzes.txt'), 'utf8'));
const hash = (s, n = 10) => createHash('sha1').update(s).digest('hex').slice(0, n);

// ---------- hand-written questions ----------
function parseQuizzes(src) {
  const out = {};
  let cur = null;
  src.split('\n').forEach((line, i) => {
    line = line.trim();
    if (!line || line.startsWith('# ')) return;
    const head = line.match(/^#(\d+)$/);
    if (head) return void (cur = out[head[1]] = []);
    const [type, ...parts] = line.split('|').map((s) => s.trim());
    const fail = (m) => {
      throw new Error(`quizzes.txt:${i + 1}: ${m}`);
    };
    if (!cur) fail('question before #id');
    if (type === 'T') {
      if (parts.length !== 2 || !/^[01]$/.test(parts[1])) fail('T|statement|1/0');
      cur.push({ t: 'tf', q: parts[0], a: parts[1] === '1' });
    } else if (type === 'M') {
      if (parts.length < 4 || parts.length > 5) fail('M|question|right|wrong|wrong[|wrong]');
      cur.push({ t: 'mc', q: parts[0], o: parts.slice(1) });
    } else if (type === 'I') {
      if (parts.length !== 2 || !parts[0].includes('___')) fail('I|sentence with ___|answer');
      cur.push({ t: 'in', q: parts[0], a: parts[1].split('/').map((s) => s.trim()) });
    } else fail(`unknown type "${type}"`);
  });
  return out;
}

// ---------- vocabulary questions from the glossary ----------
const STOP = new Set(
  `about above after again against because before being below between could didn't doesn't during
  every from have having here itself just more most other over same should some such than that their
  them then there these they this those through under until very what when where which while whole
  will with would your yours yourself into onto upon once only also even still never always another
  himself herself themselves myself something nothing everything someone anyone everyone nobody
  thought said asked looked began started came went took gave made told answered replied`.split(/\s+/),
);
function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}
const shuffle = (a, r) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const clean = (t) => t && !t.startsWith('(') && !t.includes('(ism)') && !t.includes('(имя)') && t.length <= 40;

function vocabQuestions(f, avoid) {
  const g = f.glossary ?? {};
  const words = new Set(f.text.toLowerCase().match(/[a-z]+/g));
  const pool = Object.keys(g.uz ?? {}).filter((w) => /^[a-z]{5,}$/.test(w) && words.has(w) && !STOP.has(w) && !avoid.has(w) && clean(g.uz[w]) && clean(g.ru?.[w]));
  const r = rng(f.id);
  const picked = [];
  const seenUz = new Set();
  const seenRu = new Set();
  // longer words are usually the interesting ones
  for (const w of shuffle(pool.sort((a, b) => b.length - a.length).slice(0, 40), r)) {
    if (seenUz.has(g.uz[w]) || seenRu.has(g.ru[w])) continue;
    seenUz.add(g.uz[w]);
    seenRu.add(g.ru[w]);
    picked.push(w);
  }
  const distractors = (w) => shuffle(picked.filter((x) => x !== w), r).slice(0, 3);
  // 11–13 questions per Flix in total: 5 hand-written + 6–8 vocabulary
  const nMeaning = 2 + (f.id % 3);
  const out = [];
  let k = 0;
  for (let i = 0; i < nMeaning && k < picked.length; i++, k++) out.push({ t: 'vm', w: picked[k], o: [picked[k], ...distractors(picked[k])] });
  for (let i = 0; i < 2 && k < picked.length; i++, k++) out.push({ t: 'vr', w: picked[k], o: [picked[k], ...distractors(picked[k])] });
  for (let i = 0; i < 2 && k < picked.length; i++, k++) out.push({ t: 'vt', w: picked[k] });
  return out;
}

const problems = [];
const quizzes = {};
for (const f of flix) {
  const hand = handWritten[f.id] ?? [];
  if (hand.length < 5) problems.push(`#${f.id} ${f.title}: only ${hand.length} hand-written questions`);
  for (const q of hand.filter((q) => q.t === 'in'))
    if (!q.a.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(f.text)))
      problems.push(`#${f.id}: answer "${q.a[0]}" is not in the text`);
  const avoid = new Set(hand.filter((q) => q.t === 'in').flatMap((q) => q.a.map((a) => a.toLowerCase())));
  quizzes[f.id] = [...hand, ...vocabQuestions(f, avoid)];
  if (quizzes[f.id].length < 10 || quizzes[f.id].length > 15) problems.push(`#${f.id}: ${quizzes[f.id].length} questions (need 10–15)`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
if (VALIDATE_ONLY) {
  console.log(`content ok: ${flix.length} Flix, ${Object.values(quizzes).reduce((n, q) => n + q.length, 0)} questions`);
  process.exit(0);
}

// ---------- pictures: AVIF + WebP, two sizes, dominant colour as placeholder ----------
const magick = ['magick', 'convert'].find((bin) => {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
const metaFile = resolve(ROOT, 'content/img-meta.json');
const imgMeta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
mkdirSync(resolve(OUT, 'img'), { recursive: true });
function pictures(f) {
  if (!f.image) return null;
  const src = resolve(ROOT, 'content/img', f.image);
  const i = hash(readFileSync(src), 8);
  const outs = [
    [`${f.id}.avif`, 720, 50],
    [`${f.id}-s.avif`, 360, 45],
    [`${f.id}.webp`, 720, 68],
    [`${f.id}-s.webp`, 360, 65],
  ];
  const fresh = imgMeta[f.image]?.i === i;
  for (const [name, width, q] of outs) {
    const out = resolve(OUT, 'img', name);
    if (fresh && existsSync(out)) continue;
    if (!magick) throw new Error('ImageMagick (magick/convert) is needed to convert pictures');
    execFileSync(magick, [src, '-resize', `${width}x>`, '-strip', '-quality', String(q), out]);
  }
  if (!fresh) {
    const hex = execFileSync(magick, [src, '-resize', '1x1!', '-format', '%[hex:p{0,0}]', 'info:']).toString().trim().slice(0, 6);
    imgMeta[f.image] = { i, c: `#${hex}` };
  }
  return imgMeta[f.image];
}

// ---------- stories, split by language ----------
const DATA = resolve(OUT, 'data');
rmSync(resolve(DATA, 'f'), { recursive: true, force: true });
mkdirSync(resolve(DATA, 'f'), { recursive: true });
const feed = [];
for (const f of flix) {
  const bodies = LANGS.map((lang) => JSON.stringify({ id: f.id, text: f.text, tr: f.translations?.[lang] ?? null, gl: f.glossary?.[lang] ?? {}, quiz: quizzes[f.id] }));
  bodies.forEach((b, k) => writeFileSync(resolve(DATA, `f/${f.id}.${LANGS[k]}.json`), b));
  const img = pictures(f);
  feed.push({
    id: f.id,
    title: f.title,
    tt: f.translations ? { uz: f.translations.uz?.title, ru: f.translations.ru?.title } : undefined,
    d: f.description,
    level: f.level,
    sec: f.durationSec,
    q: quizzes[f.id].length,
    h: hash(bodies.join(''), 8), // story version: the device keeps a story until this changes
    i: img?.i ?? null, // picture version
    c: img?.c ?? null, // placeholder colour
  });
}
writeFileSync(metaFile, JSON.stringify(imgMeta, null, 1));
feed.sort((a, b) => b.id - a.id); // newest first
const indexBody = JSON.stringify({ flix: feed, campaign });
writeFileSync(resolve(DATA, 'index.json'), JSON.stringify({ v: hash(indexBody), flix: feed, campaign }));

// ---------- code: minify, split, inline ----------
const esbuild = await import('esbuild').catch(() => {
  console.error('esbuild is missing: run `npm install` (dev dependency, only needed for building)');
  process.exit(1);
});
const min = async (file, loader, format) =>
  (await esbuild.transform(readFileSync(resolve(SRC, file), 'utf8'), { loader, minify: true, target: 'es2020', format, legalComments: 'none' })).code;

// older chunks stay: an app that is open during a deploy can still load the ones it knows
mkdirSync(resolve(OUT, 'c'), { recursive: true });
const chunkFiles = {};
for (const name of ['player', 'test', 'admin']) {
  const code = await min(`${name}.js`, 'js', 'esm');
  chunkFiles[name] = `c/${name}.${hash(code, 8)}.js`;
  writeFileSync(resolve(OUT, chunkFiles[name]), code);
}
const css = await min('style.css', 'css');
const core = (await min('core.js', 'js')).replace('__CHUNKS__', JSON.stringify(chunkFiles)).replace(/<\/(script)/gi, '<\\/$1');
if (core.includes('__CHUNKS__') || !core.includes(chunkFiles.player)) throw new Error('chunk map was not inlined');
const html = readFileSync(resolve(SRC, 'index.html'), 'utf8')
  .replace(/<!--(?!\s*\/?\w).*?-->\n?/gs, '')
  .replace(/\n\s*/g, '')
  .replace('/*CSS*/', () => css.trim())
  .replace('/*CORE*/', () => core.trim());
writeFileSync(resolve(OUT, 'index.html'), html);

copyFileSync(resolve(SRC, 'favicon.svg'), resolve(OUT, 'favicon.svg'));
cpSync(resolve(SRC, 'icons'), resolve(OUT, 'icons'), { recursive: true });
const shell = ['./', 'favicon.svg', 'icons/icon-192.png', ...Object.values(chunkFiles)];
const version = hash(html + Object.values(chunkFiles).join() + indexBody);
const sw = (await esbuild.transform(readFileSync(resolve(SRC, 'sw.js'), 'utf8'), { minify: true, target: 'es2020' })).code
  .replace('__VERSION__', version)
  .replace('__SHELL__', JSON.stringify(shell));
writeFileSync(resolve(OUT, 'sw.js'), sw);

// leftovers of older builds
for (const old of ['app.js', 'style.css'].map((n) => resolve(OUT, n))) rmSync(old, { force: true });

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const { brotliCompressSync } = await import('node:zlib');
const br = (s) => brotliCompressSync(Buffer.from(s)).length;
console.log(
  `built ${feed.length} Flix, ${feed.reduce((n, f) => n + f.q, 0)} questions, version ${version}\n` +
    `  index.html ${kb(html.length)} (brotli ${kb(br(html))}) · player ${kb(br(readFileSync(resolve(OUT, chunkFiles.player))))} · test ${kb(br(readFileSync(resolve(OUT, chunkFiles.test))))} (brotli)\n` +
    `  feed ${kb(br(JSON.stringify({ flix: feed })))} (brotli)`,
);
