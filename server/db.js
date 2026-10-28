// The database is one JSON object. It lives in data/db.json and — so that no server disk is needed —
// a copy is kept in Telegram itself: a document pinned in a private channel (STORAGE_CHAT_ID).
// On a fresh machine with no data/db.json the bot downloads that pinned copy and continues.
// Moving to a real server/database later = take data/db.json (or /export) and import it.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { env, ROOT } from './env.js';
import { api, download } from './tg.js';

const DIR = resolve(ROOT, 'data');
const FILE = resolve(DIR, 'db.json');

export const db = {
  users: {}, // telegram id -> { id, name, username, lang, phone, joinedAt, lastSeen, state, blocked }
  donations: [], // { id, userId, amount, status: pending|confirmed|rejected, fileId, at }
  support: {}, // message id in the admin chat -> user id (for replies)
  files: {}, // picture name -> { id: Telegram file_id, h, size }
  seq: 1,
  backup: null, // { messageId } of the pinned copy
  updatedAt: 0,
};

const log = (...a) => console.log(new Date().toISOString(), '[db]', ...a);

export async function initDb() {
  mkdirSync(DIR, { recursive: true });
  if (existsSync(FILE)) {
    Object.assign(db, JSON.parse(readFileSync(FILE, 'utf8')));
    log(`loaded ${Object.keys(db.users).length} users from data/db.json`);
    return;
  }
  if (!env.storageChat) return log('new empty database (STORAGE_CHAT_ID is not set: no Telegram copy)');
  try {
    const chat = await api('getChat', { chat_id: env.storageChat });
    const doc = chat.pinned_message?.document;
    if (doc) {
      Object.assign(db, JSON.parse((await download(doc.file_id)).toString('utf8')));
      db.backup = { messageId: chat.pinned_message.message_id };
      writeLocal();
      log(`restored ${Object.keys(db.users).length} users from the Telegram copy`);
    } else log('no pinned copy in the storage channel yet — starting empty');
  } catch (e) {
    log('could not read the storage channel:', e.message);
  }
}

function writeLocal() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, FILE);
}

let localTimer = 0;
let backupTimer = 0;
let backupDue = Infinity;
/** Call after every change: written to disk at once (debounced), copied to Telegram within a minute. */
export function touch({ urgent = false } = {}) {
  db.updatedAt = Date.now();
  // at most one disk write every 2 s, however many changes arrive (the file can be large)
  if (!localTimer)
    localTimer = setTimeout(() => {
      localTimer = 0;
      writeLocal();
    }, 2000);
  if (!env.storageChat) return;
  // new changes never push a planned copy further away, so a busy bot still backs up every minute
  const due = Date.now() + (urgent ? 3_000 : 60_000);
  if (due >= backupDue) return;
  clearTimeout(backupTimer);
  backupDue = due;
  backupTimer = setTimeout(() => void backup(), due - Date.now());
}

export async function backup() {
  clearTimeout(backupTimer);
  backupDue = Infinity;
  if (!env.storageChat) return;
  const data = JSON.stringify(db);
  const caption = `🗄 LingoUp DB · ${Object.keys(db.users).length} users · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const file = { name: 'lingoup-db.json', data, type: 'application/json' };
  try {
    if (db.backup?.messageId) {
      // replace the pinned document in place: the channel keeps one message
      await api(
        'editMessageMedia',
        { chat_id: env.storageChat, message_id: db.backup.messageId, media: { type: 'document', media: 'attach://file', caption } },
        { file },
      );
      return;
    }
  } catch (e) {
    if (!/not modified/.test(e.message)) log('edit failed, sending a new copy:', e.message);
    else return;
  }
  try {
    const msg = await api('sendDocument', { chat_id: env.storageChat, caption, disable_notification: true }, { document: file });
    await api('pinChatMessage', { chat_id: env.storageChat, message_id: msg.message_id, disable_notification: true }).catch((e) =>
      log('pin failed (make the bot an admin of the channel):', e.message),
    );
    db.backup = { messageId: msg.message_id };
    writeLocal();
  } catch (e) {
    log('backup failed:', e.message);
  }
}

export function flushSync() {
  clearTimeout(localTimer);
  localTimer = 0;
  writeLocal();
}
