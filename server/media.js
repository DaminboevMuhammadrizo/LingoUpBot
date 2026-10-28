// Pictures are kept in Telegram: each file is uploaded once to the storage channel as a document
// (no recompression) and its file_id is remembered in the database. The server downloads a picture by
// file_id the first time someone needs it and then serves it from RAM (and the disk level of the cache).
// The local public/img copy is only a fallback and the source for the first upload.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { env, ROOT } from './env.js';
import { api, download, sleep } from './tg.js';
import { db, touch } from './db.js';

const IMG = resolve(ROOT, 'public/img');
const log = (...a) => console.log(new Date().toISOString(), '[media]', ...a);
const sha = (b) => createHash('sha1').update(b).digest('hex').slice(0, 12);

/** Uploads pictures that Telegram does not have yet (or that changed). Runs in the background. */
export async function syncMedia() {
  if (!env.token || !env.storageChat || !existsSync(IMG)) return;
  db.files ||= {};
  const todo = readdirSync(IMG)
    .filter((n) => /\.(avif|webp|jpe?g|png)$/.test(n))
    .map((name) => ({ name, data: readFileSync(resolve(IMG, name)) }))
    .filter((f) => db.files[f.name]?.h !== sha(f.data));
  if (!todo.length) return log(`all ${Object.keys(db.files).length} pictures are in Telegram`);
  log(`uploading ${todo.length} pictures to Telegram...`);
  // Telegram must keep the bytes as a plain file: a ".webp" name would turn it into a sticker (and
  // stickers cannot be in an album), ".avif" into a photo. The real name is kept in db.files.
  const asFile = (f) => ({ name: `${f.name}.bin`, data: f.data, type: 'application/octet-stream' });
  const remember = (f, m) => (db.files[f.name] = { id: m.document.file_id, h: sha(f.data), size: f.data.length });
  const fatal = (e) => /chat not found|forbidden|not enough rights|bot is not a member/i.test(e.message);
  let done = 0;
  for (let i = 0; i < todo.length; i += 10) {
    const group = todo.slice(i, i + 10);
    try {
      const files = Object.fromEntries(group.map((f, k) => [`f${k}`, asFile(f)]));
      const media = group.map((f, k) => ({ type: 'document', media: `attach://f${k}`, ...(k === 0 ? { caption: `🖼 ${group.map((g) => g.name).join(' ')}` } : {}) }));
      const msgs = await api('sendMediaGroup', { chat_id: env.storageChat, media, disable_notification: true }, files);
      msgs.forEach((m, k) => remember(group[k], m));
      done += group.length;
    } catch (e) {
      // the channel itself is unreachable: the other groups would fail the same way
      if (fatal(e)) return log(`stopped (${e.message}): add the bot to STORAGE_CHAT_ID as an admin, then \`pm2 restart lingoup\` (pictures are served from public/img meanwhile)`);
      log(`album failed (${e.message}), sending these ${group.length} one by one`);
      for (const f of group) {
        try {
          remember(f, await api('sendDocument', { chat_id: env.storageChat, caption: `🖼 ${f.name}`, disable_notification: true }, { document: asFile(f) }));
          done++;
        } catch (e2) {
          log(`upload of ${f.name} failed:`, e2.message);
          if (fatal(e2)) return;
        }
        await sleep(3100);
      }
    }
    touch();
    await sleep(3500); // channels allow ~20 messages a minute
  }
  touch({ urgent: true });
  log(`pictures in Telegram: ${done}/${todo.length} uploaded now, ${Object.keys(db.files).length} in total`);
}

/** Bytes of a picture: Telegram (by file_id) first, local file as fallback. */
export async function loadImage(name) {
  const tgFile = db.files?.[name];
  const local = resolve(IMG, name);
  if (tgFile && env.token && env.mediaSource !== 'local') {
    try {
      return { data: await download(tgFile.id), fromTelegram: true };
    } catch (e) {
      log(`telegram download of ${name} failed (${e.message}), using the local copy`);
    }
  }
  if (existsSync(local)) return { data: readFileSync(local), fromTelegram: false };
  return null;
}
