// Entry point (pm2 runs this): web server for the Mini App + the Telegram bot in one process.
import { env } from './env.js';
import { initDb, flushSync, backup } from './db.js';
import { rebuildIndex } from './users.js';
import { startHttp, refreshInit, stats } from './http.js';
import { startBot, collected } from './bot.js';
import { syncMedia } from './media.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);

await initDb();
rebuildIndex();
await startHttp({ campaign: () => ({ collected: collected(), bot: env.botUsername || null }) });
// The bot starts in the background and retries while Telegram is unreachable: the Mini App keeps
// being served in the meantime instead of the whole process going down.
async function bootBot(attempt = 1) {
  try {
    await startBot({ onCampaignChange: refreshInit, stats });
    // pictures to Telegram (file_id); once done, they are served from there
    setTimeout(() => void syncMedia().catch((e) => log('media sync:', e.message)), 5_000);
  } catch (e) {
    const wait = Math.min(60, 5 * attempt);
    log(`bot start failed (${e.message}), retrying in ${wait} s; the web app keeps running`);
    setTimeout(() => void bootBot(attempt + 1), wait * 1000);
  }
}
if (env.token) void bootBot();
else log('BOT_TOKEN is not set: running the web server only');

// pm2 sends SIGINT on stop/reload: save the database and its Telegram copy first
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  log('stopping, saving the database...');
  flushSync();
  await Promise.race([backup().catch(() => {}), new Promise((r) => setTimeout(r, 6000))]);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('unhandledRejection', (e) => log('unhandled:', e?.message || e));
if (process.send) process.send('ready'); // pm2 wait_ready
