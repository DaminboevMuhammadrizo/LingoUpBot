// LingoUp Telegram bot: registration by phone number, the Mini App button, donations and support.
// Runs inside the same process as the web server (server/main.js). Long polling, no dependencies.
import { env } from './env.js';
import { api, sleep, TgError } from './tg.js';
import { db, touch, backup } from './db.js';
import { userRegistered, searchChanged } from './users.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);
// set by startBot: refresh /api/init after a donation is confirmed, server stats for /cache
let hooks = { onCampaignChange: () => {}, stats: () => ({}) };

// ---------------------------------------------------------------- texts
const TXT = {
  uz: {
    askPhone: (n) => `Assalomu alaykum, ${n}! 👋\n\n<b>LingoUp</b> — ingliz tilini qiziqarli hikoyalar (Flix) orqali o'rganing:\n🎬 rasm va matnli qisqa hikoyalar\n👆 notanish so'zga bosing — tarjimasi chiqadi\n🎯 har bir Flix'dan keyin test\n\nDavom etish uchun pastdagi tugma orqali <b>telefon raqamingizni</b> yuboring 👇`,
    phoneBtn: '📱 Telefon raqamni yuborish',
    notYours: "Iltimos, pastdagi tugma orqali <b>o'zingizning</b> raqamingizni yuboring.",
    thanks: "✅ Rahmat, ro'yxatdan o'tdingiz!",
    welcome: (n) => `${n}, ilovaga xush kelibsiz! 🎉\n\nPastdagi tugmani bosing — LingoUp ochiladi. Ilova telefoningizda saqlanib qoladi va keyingi safar juda tez ochiladi.`,
    open: '📱 Ilovani ochish',
    help: "ℹ️ <b>LingoUp</b>\n\n/app — ilovani ochish\n/support — taklif yoki shikoyat yozish\n\nIstalgan savolingizni shu yerga yozing — admin javob beradi.",
    support: '✍️ Taklif, shikoyat yoki savolingizni shu yerga yozing (matn, rasm yoki ovozli xabar). Admin shu chatda javob beradi.',
    supportSent: '📨 Xabaringiz adminga yuborildi. Javobni shu yerda olasiz.',
    adminReply: '💬 <b>LingoUp jamoasi javobi:</b>',
    donAmount: "💳 Donat uchun rahmat!\n\nQancha summa o'tkazdingiz? Faqat raqam yozing (masalan: <code>50000</code>).\n\nBekor qilish: /cancel",
    donBadAmount: "Summani raqam bilan yozing, masalan: <code>50000</code>",
    donPhoto: "🧾 Endi to'lov chekining rasmini (skrinshot) yuboring.",
    donNeedPhoto: '🧾 Iltimos, chekni <b>rasm</b> sifatida yuboring yoki /cancel',
    donSent: '🙏 Rahmat! To\'lovingiz admin tasdiqlashini kutmoqda. Tasdiqlangach xabar beramiz.',
    donOk: (a) => `✅ Donatingiz (${a} so'm) tasdiqlandi! LingoUp'ni qo'llab-quvvatlaganingiz uchun katta rahmat ❤️`,
    donNo: (a) => `❌ Donatingiz (${a} so'm) tasdiqlanmadi. Savol bo'lsa shu yerga yozing.`,
    cancelled: 'Bekor qilindi.',
    blockedOld: "Telegram ilovangizni yangilang — eski versiyada ilova ochilmasligi mumkin.",
  },
  ru: {
    askPhone: (n) => `Здравствуйте, ${n}! 👋\n\n<b>LingoUp</b> — учите английский через интересные истории (Flix):\n🎬 короткие истории с картинками\n👆 нажмите на незнакомое слово — появится перевод\n🎯 после каждого Flix — тест\n\nЧтобы продолжить, отправьте <b>номер телефона</b> кнопкой ниже 👇`,
    phoneBtn: '📱 Отправить номер телефона',
    notYours: 'Пожалуйста, отправьте <b>свой</b> номер кнопкой ниже.',
    thanks: '✅ Спасибо, вы зарегистрированы!',
    welcome: (n) => `${n}, добро пожаловать! 🎉\n\nНажмите кнопку ниже — откроется LingoUp. Приложение сохранится на телефоне и в следующий раз откроется мгновенно.`,
    open: '📱 Открыть приложение',
    help: 'ℹ️ <b>LingoUp</b>\n\n/app — открыть приложение\n/support — предложение или жалоба\n\nНапишите сюда любой вопрос — админ ответит.',
    support: '✍️ Напишите сюда предложение, жалобу или вопрос (текст, фото или голосовое). Админ ответит в этом чате.',
    supportSent: '📨 Сообщение отправлено админу. Ответ придёт сюда.',
    adminReply: '💬 <b>Ответ команды LingoUp:</b>',
    donAmount: 'Спасибо за поддержку! 💳\n\nКакую сумму вы перевели? Напишите только число (например: <code>50000</code>).\n\nОтмена: /cancel',
    donBadAmount: 'Напишите сумму числом, например: <code>50000</code>',
    donPhoto: '🧾 Теперь отправьте фото (скриншот) чека.',
    donNeedPhoto: '🧾 Пожалуйста, отправьте чек <b>фотографией</b> или /cancel',
    donSent: '🙏 Спасибо! Платёж ожидает подтверждения админом. Мы сообщим, когда он будет подтверждён.',
    donOk: (a) => `✅ Ваш донат (${a} сум) подтверждён! Огромное спасибо за поддержку LingoUp ❤️`,
    donNo: (a) => `❌ Ваш донат (${a} сум) не подтверждён. Если есть вопросы — напишите сюда.`,
    cancelled: 'Отменено.',
    blockedOld: 'Обновите Telegram — в старой версии приложение может не открыться.',
  },
};
const langOf = (u) => (u?.lang === 'ru' ? 'ru' : 'uz');
const tx = (u, key, ...a) => {
  const v = TXT[langOf(u)][key];
  return typeof v === 'function' ? v(...a) : v;
};
const money = (n) => Number(n).toLocaleString('ru-RU').replace(/\s/g, ' ');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const isAdmin = (id) => env.admins.includes(id);

// ---------------------------------------------------------------- Mini App link
let me = null;
export const collected = () => db.donations.filter((d) => d.status === 'confirmed').reduce((s, d) => s + d.amount, 0);
function appUrl(extra = {}) {
  const u = new URL(env.webappUrl);
  u.searchParams.set('b', me.username);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}
// admins get ?a=1: the app then shows the admin screen (the API itself still checks the signature)
const openButton = (user) => ({ inline_keyboard: [[{ text: tx(user, 'open'), web_app: { url: appUrl({ r: '1', ...(isAdmin(user?.id) ? { a: '1' } : {}) }) } }]] });

async function setupBot() {
  me = await api('getMe');
  env.botUsername ||= me.username;
  hooks.onCampaignChange();
  await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open App', web_app: { url: appUrl() } } });
  for (const id of env.admins)
    await api('setChatMenuButton', { chat_id: id, menu_button: { type: 'web_app', text: 'Open App', web_app: { url: appUrl({ a: '1' }) } } }).catch(() => {});
  const cmds = (lang) =>
    lang === 'ru'
      ? [
          { command: 'start', description: 'Начать' },
          { command: 'app', description: 'Открыть приложение' },
          { command: 'support', description: 'Предложения и жалобы' },
          { command: 'help', description: 'Помощь' },
        ]
      : [
          { command: 'start', description: 'Boshlash' },
          { command: 'app', description: 'Ilovani ochish' },
          { command: 'support', description: 'Taklif va shikoyatlar' },
          { command: 'help', description: 'Yordam' },
        ];
  await api('setMyCommands', { commands: cmds('uz') });
  await api('setMyCommands', { commands: cmds('ru'), language_code: 'ru' });
  for (const id of env.admins)
    await api('setMyCommands', {
      scope: { type: 'chat', chat_id: id },
      commands: [
        ...cmds('uz'),
        { command: 'stats', description: '📊 Statistika' },
        { command: 'export', description: '📦 Bazani yuklab olish (JSON + CSV)' },
        { command: 'broadcast', description: '📣 Xabarga reply qilib hammaga yuborish' },
        { command: 'backup', description: '🗄 Telegram nusxasini hozir yangilash' },
        { command: 'cache', description: '🧠 Server xotirasi va kesh holati' },
      ],
    }).catch((e) => log('admin commands:', e.message));
  log(`@${me.username} is running. Mini App: ${env.webappUrl}`);
}
// ---------------------------------------------------------------- helpers
const send = (chat_id, text, extra = {}) => api('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

function upsertUser(from) {
  const u = (db.users[from.id] ||= { id: from.id, joinedAt: null, phone: null });
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
  if (u.phone && (u.name !== name || u.username !== (from.username || null))) searchChanged();
  u.name = name;
  u.username = from.username || null;
  u.lang = from.language_code === 'ru' ? 'ru' : 'uz';
  u.lastSeen = Date.now();
  u.blocked = false;
  return u;
}

async function askPhone(u) {
  await send(u.id, tx(u, 'askPhone', esc(u.name)), {
    reply_markup: { keyboard: [[{ text: tx(u, 'phoneBtn'), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true, is_persistent: true },
  });
}

async function sendWelcome(u) {
  await send(u.id, tx(u, 'welcome', esc(u.name)), { reply_markup: openButton(u) });
}

async function notifyAdmins(text, extra = {}) {
  if (!env.adminChat) return null;
  return send(env.adminChat, text, extra).catch((e) => log('admin chat:', e.message));
}

async function handleStart(u, param) {
  if (param === 'donate') {
    u.state = { name: 'donate_amount' };
    touch();
    return send(u.id, tx(u, 'donAmount'));
  }
  if (param === 'support') {
    u.state = null;
    touch();
    return send(u.id, tx(u, 'support'));
  }
  return sendWelcome(u);
}

// ---------------------------------------------------------------- updates
async function onMessage(m) {
  const from = m.from;
  if (!from || from.is_bot) return;

  // admin replies to a forwarded support message (in the admin group or in the admin's own chat)
  if (m.reply_to_message && db.support[`${m.chat.id}:${m.reply_to_message.message_id}`]) {
    const userId = db.support[`${m.chat.id}:${m.reply_to_message.message_id}`];
    const target = db.users[userId];
    try {
      await send(userId, tx(target, 'adminReply'));
      await api('copyMessage', { chat_id: userId, from_chat_id: m.chat.id, message_id: m.message_id });
      await api('setMessageReaction', { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: 'emoji', emoji: '👍' }] }).catch(() =>
        send(m.chat.id, '✅', { reply_parameters: { message_id: m.message_id } }),
      );
    } catch (e) {
      await send(m.chat.id, `⚠️ ${esc(e.message)}`);
    }
    return;
  }
  if (m.chat.type !== 'private') return;

  const u = upsertUser(from);
  const text = m.text || '';
  const [cmd, ...rest] = text.startsWith('/') ? text.split(/\s+/) : [''];
  const command = cmd.replace(/@.*$/, '').toLowerCase();
  const arg = rest.join(' ');

  // ---- admin commands (work without a phone number)
  if (isAdmin(from.id)) {
    if (command === '/stats') return stats(u);
    if (command === '/export') return exportDb(u);
    if (command === '/backup') {
      await backup();
      return send(u.id, env.storageChat ? '🗄 Telegram nusxasi yangilandi.' : 'STORAGE_CHAT_ID sozlanmagan.');
    }
    if (command === '/broadcast') return broadcast(u, m);
    if (command === '/cache') return send(u.id, `<pre>${esc(JSON.stringify(hooks.stats(), null, 1))}</pre>`);
  }

  // ---- registration: phone number first
  if (m.contact) {
    if (m.contact.user_id !== from.id) return send(u.id, tx(u, 'notYours'));
    const isNew = !u.phone;
    u.phone = m.contact.phone_number.replace(/^\+?/, '+');
    u.joinedAt ||= Date.now();
    touch({ urgent: isNew });
    if (isNew) userRegistered(u);
    await send(u.id, tx(u, 'thanks'), { reply_markup: { remove_keyboard: true } });
    if (isNew)
      await notifyAdmins(
        `🆕 <b>Yangi foydalanuvchi</b> #${Object.values(db.users).filter((x) => x.phone).length}\n👤 ${esc(u.name)}${u.username ? ` (@${esc(u.username)})` : ''}\n📱 ${esc(u.phone)}\n🆔 <code>${u.id}</code>`,
      );
    const pending = u.pendingStart;
    u.pendingStart = null;
    return handleStart(u, pending);
  }
  if (!u.phone) {
    if (command === '/start' && arg) u.pendingStart = arg;
    touch();
    return askPhone(u);
  }

  // ---- commands
  if (command === '/start') {
    u.state = null;
    touch();
    return handleStart(u, arg);
  }
  if (command === '/app') return sendWelcome(u);
  if (command === '/help') return send(u.id, tx(u, 'help'), { reply_markup: openButton(u) });
  if (command === '/support') {
    u.state = null;
    touch();
    return send(u.id, tx(u, 'support'));
  }
  if (command === '/cancel') {
    u.state = null;
    touch();
    return send(u.id, tx(u, 'cancelled'), { reply_markup: openButton(u) });
  }
  if (command) return send(u.id, tx(u, 'help'), { reply_markup: openButton(u) });

  // ---- donation flow
  if (u.state?.name === 'donate_amount') {
    const amount = Number(text.replace(/[\s.,]/g, '').replace(/so'?m|sum|сум/gi, ''));
    if (!Number.isFinite(amount) || amount < 1000) return send(u.id, tx(u, 'donBadAmount'));
    u.state = { name: 'donate_photo', amount };
    touch();
    return send(u.id, tx(u, 'donPhoto'));
  }
  if (u.state?.name === 'donate_photo') {
    const fileId = m.photo?.at(-1)?.file_id || (m.document?.mime_type?.startsWith('image/') || m.document?.mime_type === 'application/pdf' ? m.document.file_id : null);
    if (!fileId) return send(u.id, tx(u, 'donNeedPhoto'));
    const d = { id: db.seq++, userId: u.id, amount: u.state.amount, status: 'pending', fileId, isPhoto: !!m.photo, at: Date.now() };
    db.donations.push(d);
    u.state = null;
    touch({ urgent: true });
    await send(u.id, tx(u, 'donSent'), { reply_markup: openButton(u) });
    if (env.adminChat) {
      const caption = `💳 <b>Donat #${d.id}</b>\n💰 ${money(d.amount)} so'm\n👤 ${esc(u.name)}${u.username ? ` (@${esc(u.username)})` : ''}\n📱 ${esc(u.phone)}\n🆔 <code>${u.id}</code>`;
      const kb = { inline_keyboard: [[{ text: '✅ Tasdiqlash', callback_data: `don:ok:${d.id}` }, { text: '❌ Rad etish', callback_data: `don:no:${d.id}` }]] };
      await api(d.isPhoto ? 'sendPhoto' : 'sendDocument', { chat_id: env.adminChat, [d.isPhoto ? 'photo' : 'document']: fileId, caption, parse_mode: 'HTML', reply_markup: kb }).catch(
        (e) => log('donation to admins:', e.message),
      );
    }
    return;
  }

  // ---- anything else is a message for the admins (support)
  if (!env.adminChat || from.id === env.adminChat) return send(u.id, tx(u, 'help'), { reply_markup: openButton(u) });
  const head = await notifyAdmins(
    `💬 <b>Murojaat</b> · ${esc(u.name)}${u.username ? ` (@${esc(u.username)})` : ''} · ${esc(u.phone)} · <code>${u.id}</code>\n<i>Javob berish uchun pastdagi xabarga reply qiling.</i>`,
  );
  const copy = await api('copyMessage', { chat_id: env.adminChat, from_chat_id: u.id, message_id: m.message_id }).catch(() => null);
  for (const msg of [head, copy]) if (msg?.message_id) db.support[`${env.adminChat}:${msg.message_id}`] = u.id;
  pruneSupport();
  touch();
  await send(u.id, tx(u, 'supportSent'));
}

function pruneSupport() {
  const keys = Object.keys(db.support);
  if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete db.support[k];
}

async function onCallback(q) {
  const [kind, action, id] = (q.data || '').split(':');
  if (kind !== 'don') return api('answerCallbackQuery', { callback_query_id: q.id });
  if (!isAdmin(q.from.id)) return api('answerCallbackQuery', { callback_query_id: q.id, text: 'Faqat admin uchun', show_alert: true });
  const d = db.donations.find((x) => x.id === Number(id));
  if (!d) return api('answerCallbackQuery', { callback_query_id: q.id, text: 'Topilmadi' });
  if (d.status !== 'pending') return api('answerCallbackQuery', { callback_query_id: q.id, text: `Allaqachon: ${d.status}` });
  d.status = action === 'ok' ? 'confirmed' : 'rejected';
  d.by = q.from.id;
  touch({ urgent: true });
  const u = db.users[d.userId];
  await send(d.userId, tx(u, action === 'ok' ? 'donOk' : 'donNo', money(d.amount))).catch(() => {});
  const mark = action === 'ok' ? '✅ Tasdiqlandi' : '❌ Rad etildi';
  await api('editMessageCaption', {
    chat_id: q.message.chat.id,
    message_id: q.message.message_id,
    caption: `${q.message.caption}\n\n${mark} — ${q.from.first_name}`,
  }).catch(() => {});
  await api('answerCallbackQuery', { callback_query_id: q.id, text: mark });
  if (action === 'ok') hooks.onCampaignChange();
}

// ---------------------------------------------------------------- admin tools
async function stats(u) {
  const users = Object.values(db.users);
  const reg = users.filter((x) => x.phone);
  const day = 864e5;
  const since = (ms) => reg.filter((x) => x.joinedAt > Date.now() - ms).length;
  const active = users.filter((x) => x.lastSeen > Date.now() - 7 * day).length;
  const pending = db.donations.filter((d) => d.status === 'pending').length;
  await send(
    u.id,
    `📊 <b>Statistika</b>\n\n👥 Ro'yxatdan o'tgan: <b>${reg.length}</b> (raqamsiz: ${users.length - reg.length})\n🆕 Bugun: ${since(day)} · 7 kun: ${since(7 * day)} · 30 kun: ${since(30 * day)}\n🔥 7 kunda faol: ${active}\n🚫 Botni bloklagan: ${users.filter((x) => x.blocked).length}\n\n💳 Donat: <b>${money(collected())} so'm</b> (${db.donations.filter((d) => d.status === 'confirmed').length} ta)\n⏳ Kutilmoqda: ${pending}`,
  );
}

async function exportDb(u) {
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const date = (ms) => (ms ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : '');
  const rows = [['id', 'name', 'username', 'phone', 'lang', 'joined', 'last_seen', 'blocked']].concat(
    Object.values(db.users).map((x) => [x.id, x.name, x.username, x.phone, x.lang, date(x.joinedAt), date(x.lastSeen), x.blocked ? 1 : 0]),
  );
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
  const stamp = new Date().toISOString().slice(0, 10);
  await api('sendDocument', { chat_id: u.id, caption: `👥 ${rows.length - 1} foydalanuvchi` }, { document: { name: `lingoup-users-${stamp}.csv`, data: csv, type: 'text/csv' } });
  await api('sendDocument', { chat_id: u.id, caption: "🗄 To'liq baza (serverga ko'chirish uchun)" }, { document: { name: `lingoup-db-${stamp}.json`, data: JSON.stringify(db, null, 1), type: 'application/json' } });
}

let broadcasting = false;
async function broadcast(u, m) {
  if (!m.reply_to_message) return send(u.id, "📣 Hammaga yubormoqchi bo'lgan xabarga <b>reply</b> qilib /broadcast yozing.");
  if (broadcasting) return send(u.id, '⏳ Oldingi tarqatma hali tugamadi.');
  broadcasting = true;
  const targets = Object.values(db.users).filter((x) => x.phone && !x.blocked);
  await send(u.id, `📣 ${targets.length} kishiga yuborilmoqda...`);
  let ok = 0;
  let fail = 0;
  for (const x of targets) {
    try {
      await api('copyMessage', { chat_id: x.id, from_chat_id: u.id, message_id: m.reply_to_message.message_id, reply_markup: openButton(x) });
      ok++;
    } catch (e) {
      fail++;
      if (e instanceof TgError && e.code === 403) x.blocked = true;
    }
    await sleep(40); // stays under Telegram's ~30 messages/second limit
  }
  broadcasting = false;
  touch();
  await send(u.id, `✅ Yuborildi: ${ok}\n❌ Yetib bormadi: ${fail}`);
}

// ---------------------------------------------------------------- main loop
export async function startBot(h) {
  hooks = { ...hooks, ...h };
  if (!/^https:\/\//.test(env.webappUrl)) throw new Error('WEBAPP_URL must be the https:// address of this server (see README)');
  await setupBot();
  void poll();
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const up of updates) {
        offset = up.update_id + 1;
        try {
          if (up.message) await onMessage(up.message);
          else if (up.callback_query) await onCallback(up.callback_query);
        } catch (e) {
          log('update failed:', e.message);
          if (e instanceof TgError && e.code === 403 && up.message?.from) {
            const x = db.users[up.message.from.id];
            if (x) x.blocked = true;
          }
        }
      }
    } catch (e) {
      log('polling error:', e.message);
      await sleep(3000);
    }
  }
}
