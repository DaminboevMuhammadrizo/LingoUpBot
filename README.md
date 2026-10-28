# LingoUp Bot — Telegram Mini App

LingoUp APK'ning Telegram versiyasi: bot + Mini App. APK'dagi hamma narsa (Flix lenta, matn suriladigan pleyer,
so'zga bosib tarjima, abzas tarjimasi, so'z saqlash, sevimlilar, darajalar, donat, taklif-shikoyat) va
**har bir Flix tugagach test** — 106 Flix uchun 1272 savol (har birida 11–13 ta: True/False, variantli,
yozma, so'z ma'nosi, inglizchasini topish, inglizcha yozish).

## Tuzilma

```
server/        bitta Node jarayoni (kutubxonasiz): HTTP server + Telegram bot
  main.js        kirish nuqtasi (pm2 shuni ishga tushiradi)
  http.js        statik fayllar, /api/init, /api/flix/:id, /img/:name — hammasi RAM'da oldindan siqilgan
  cache.js       Map asosidagi LFU kesh (bayt limiti, TTL yo'q, disk L2)
  media.js       rasmlar Telegram'da (file_id)
  bot.js         ro'yxatdan o'tish (telefon), donat, murojaatlar, admin buyruqlari
  db.js          baza: data/db.json + Telegram kanalida pin qilingan nusxa
web/src/       ilova manbasi (core.js, player.js, test.js, style.css, index.html, sw.js)
public/        build natijasi — server shuni beradi (git'da turadi, serverda build kerak emas)
content/       hikoyalar, savollar (quizzes.txt), donat ma'lumoti
tools/build.mjs  web/src + content → public
deploy/        server sozlash, deploy (pm2), nginx
```

## Tezlik: nima qilingan

**Frontend**
- Birinchi ekran = **bitta HTML (17 KB brotli)**: skelet, CSS va asosiy JS ichida. Pleyer va test — alohida
  bo'laklar (`public/c/*.js`, 2.5 KB dan), faqat kerak bo'lganda yuklanadi va bo'sh vaqtda oldindan olinadi.
- Kod esbuild bilan minify qilinadi; framework yo'q.
- Telegram SDK `async` yuklanadi — ilova uni kutmaydi (foydalanuvchi va mavzu URL'dagi launch ma'lumotidan olinadi).
- Rasmlar **AVIF** (WebP zaxira), 2 o'lcham (360/720px), `loading="lazy"`, rasm kelguncha uning asosiy rangi fon bo'ladi.
- **Kesh**: Flix ro'yxati localStorage'da (0 ms chizish), hikoyalar IndexedDB'da hash bo'yicha — bir marta
  yuklangan narsa qayta so'ralmaydi; o'zgargan Flix'ning faqat o'zi qayta yuklanadi.
- **Bitta boshlang'ich so'rov** `/api/init` (ro'yxat + donat + bot nomi). Versiya ETag'da: o'zgarmagan bo'lsa
  javob **304, 0 bayt**.
- Service worker: ilova qobig'i va bo'laklar o'rnatishda keshlanadi; ikkinchi ochilish qurilmadan, internetsiz ham.
- Kartaga barmoq tekkanda hikoya yuklana boshlaydi (bosish tugashidan oldin).

O'lchangan (lokal): birinchi ochilish ~120 ms / 29 KB, keyingisi ~100 ms / 0.3 KB, internetsiz ~100 ms.

**Server**
- Barcha javoblar bir marta **brotli (q11) + gzip** qilinib RAM'da turadi; so'rov = Map'dan olish.
  Lokal o'lchov: ~14 000 so'rov/s, p50 2 ms, RSS ~100 MB.
- **LFU kesh** (`server/cache.js`): `Map`, TTL yo'q, limit baytda (`CACHE_MAX_MB=400`). Limitdan oshsa eng kam
  so'ralganlar chiqadi; so'rov soni har 10 daqiqada yarmiga tushiriladi (eski mashhurlik abadiy qolmaydi).
  Bir kalitga 100 ta parallel so'rov = 1 ta yuklash.
- **Disk L2** (`data/cache`, `DISK_CACHE_MAX_MB`): RAM'dan chiqarilgan Telegram rasmlari diskka tushadi va
  keyingi safar Telegram'dan emas, diskdan o'qiladi. Bu — "swap"ning boshqariladigan varianti: OS swap'ini
  dastur tanlay olmaydi, u faqat favqulodda zaxira (swappiness=10).
- **Xotira nazoratchisi**: RSS `RSS_SOFT_MB=700` dan oshsa kesh yarmini bo'shatadi (restart'siz).
- Hikoyalar ishga tushganda RAM'ga isitiladi; noma'lum ID/nomlar keshga tushmaydi (Map'ni to'ldirib bo'lmaydi).
- Rasmlar **Telegram file_id** orqali: bot ularni yopiq kanalga hujjat sifatida bir marta yuklaydi,
  server birinchi so'rovda Telegram'dan oladi, keyin RAM/diskdan beradi. `public/img` faqat zaxira.
- Kesh sarlavhalari: `/c/*`, `/img/*?h=`, `/api/flix/*?h=` — 1 yil `immutable` (CDN uchun ideal);
  `/`, `/api/init` — `no-cache` + ETag.

## Server (1 GB RAM)

```
OS + nginx ~200 MB · Node ~50 MB · JS heap ≤256 MB · kesh ≤400 MB  →  ~700-850 MB
```
`ecosystem.config.cjs`: `--max-old-space-size=256` (faqat heap'ni cheklaydi; kesh Buffer'lari heap'dan
tashqarida, ularni kesh o'zi cheklaydi), `max_memory_restart: 820M`, bitta instance (bot long-polling'i
ikki nusxada ishlamaydi), graceful stop (baza saqlanadi), log rotation.

Birinchi marta (root):
```bash
REPO=git@github.com:<siz>/LingoUpBot.git DOMAIN=app.example.uz bash deploy/setup-server.sh
# Node 20, pm2 (+logrotate, systemd), nginx, 5 GB swap, /var/www/bot/lingoup
cd /var/www/bot/lingoup && cp .env.example .env && nano .env
sudo -u lingoup bash deploy/deploy.sh
```
HTTPS: Cloudflare (DNS proxied, SSL "Full") yoki `certbot --nginx -d app.example.uz`.
Cloudflare'da Cache Rule: `/img/*`, `/c/*`, `/api/flix/*` → "Eligible for cache" (origin sarlavhalari hurmat qilinadi).

## CI/CD

`.github/workflows/deploy.yml` — `main` ga har push'da:
1. tekshiruv: sintaksis + savollar (har Flix'da 10–15, yozma javoblar matnda bor);
2. SSH orqali serverga kiradi → (birinchi marta `git clone`) → `deploy/deploy.sh`:
   `git pull` → `pm2 startOrReload` → `/api/health` tekshiruvi → muvaffaqiyatsiz bo'lsa **avvalgi commit'ga qaytadi**.

GitHub secrets: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, ixtiyoriy `SSH_PORT`, `REPO_URL`. Loyiha serverda `/var/www/bot/lingoup` papkasida turadi.
Serverda repo'ni o'qish uchun deploy key qo'shing (GitHub → Settings → Deploy keys).

## Bot sozlash

1. @BotFather → `/newbot` → token. **Bot Settings → Configure Mini App** → `https://<domen>/`
   (chatlar ro'yxatidagi "Open" tugmasi). Chat ichidagi "Open App" tugmasini bot o'zi qo'yadi.
2. Yopiq kanal → botni admin qiling → ID (`-100...`) → `STORAGE_CHAT_ID` (baza nusxasi + rasmlar).
3. `.env` ni to'ldiring (`.env.example`).

| Foydalanuvchi | |
| --- | --- |
| `/start` | telefon raqam (faqat o'zinikini qabul qiladi) → "📱 Ilovani ochish" |
| `/support` yoki istalgan xabar | adminga; admin **reply** qilsa javob foydalanuvchiga boradi |
| ilovada "To'lov qildim" | summa + chek → admin ✅/❌ → foydalanuvchiga xabar, ilovada "Yig'ildi" yangilanadi |

| Admin | |
| --- | --- |
| `/stats` | foydalanuvchilar, faollar, donat |
| `/export` | `users.csv` + to'liq `db.json` |
| `/broadcast` | xabarga reply qilib — hammaga |
| `/backup` | Telegram nusxasini hozir yangilash |
| `/cache` | RAM, heap, kesh hajmi, hit-rate, eng ko'p so'ralganlar |

## Admin API

Admin `.env` dagi `ADMIN_IDS` (Telegram user ID, @userinfobot dan) bilan aniqlanadi. Lekin ID'ning o'zi
so'rovda yuborilmaydi — uni har kim soxtalashtira oladi. Har so'rovda Telegram imzolagan launch ma'lumoti
keladi: `Authorization: tma <initData>`. Server uni bot token bilan HMAC orqali tekshiradi (24 soat amal qiladi),
so'ng `user.id` `ADMIN_IDS` ichida bormi — qaraydi. Imzosiz → 401, admin emas → 403.

| So'rov | Javob |
| --- | --- |
| `GET /api/admin/me` | `{ admin: true, id }` |
| `GET /api/admin/summary` | jami, ro'yxatdan o'tgan, bugun / 7 / 30 kun, 7 kunda faol, bloklagan, **har daraja: soni va %**, tanlanmaganlar, donat. ETag → o'zgarmagan bo'lsa 304 |
| `GET /api/admin/users?limit=50&before=&level=&q=` | ro'yxat, eng yangisi birinchi; `next` — keyingi sahifa kursori; `level=ielts` yoki `none`; `q` — ism, @username, telefon, ID |
| `GET /api/admin/users/new?since=<ms>` | shu vaqtdan keyin qo'shilganlar |
| `GET /api/admin/users/<id>` | bitta foydalanuvchi (daraja, ko'rgan Flix, testlar, o'rtacha ball, so'zlar) |
| `GET /api/admin/events` | jonli oqim (SSE): `user` — yangi ro'yxatdan o'tish shu zahoti, `summary` — raqamlar o'zgarganda |

Ilovada admin uchun Profil → **Admin panel** (alohida 2.5 KB bo'lak, faqat adminga yuklanadi): statistika,
darajalar foizi, jonli yangi foydalanuvchilar, qidiruv va filtr. Bot admin'larga ilovani `a=1` bilan ochadi.

Daraja va statistika ilovadan `POST /api/me` bilan keladi (imzolangan, faqat o'zgarganda, 3 s debounce).

Tezlik (100 000 foydalanuvchi, lokal): summary 0.5 ms (har o'zgarishda bir marta quriladi, ~6 ms), 50 talik
sahifa ~1 ms, qidiruv ≤1.5 ms (barcha kalitlar bitta satrda, `lastIndexOf` bilan oxiridan — eng yangilar birinchi),
heap ~57 MB. Hisoblagichlar (jami, darajalar) har o'zgarishda yangilanadi — so'rovda hech narsa qayta sanalmaydi.

## Ishlab chiqish

```bash
npm install          # faqat esbuild (build uchun); serverga kerak emas
npm run build        # web/src + content → public  (yangi rasmlar uchun ImageMagick)
npm start            # http://127.0.0.1:3000  (BOT_TOKEN bo'lmasa faqat web; brauzerda ism bilan kiriladi)
npm run check        # savollarni tekshirish
```
Savollar: `content/quizzes.txt`. Yangi Flix: `npm run import` → `quizzes.txt` ga `#id` blok → `npm run build` → push.
`public/` ni commit qiling — serverda build qilinmaydi.

## Keyin to'liq serverga o'tish

Bot bazasi `data/db.json` (yoki `/export`). Foydalanuvchining shaxsiy progressi Telegram CloudStorage'da —
uni faqat ilova o'qiy oladi; server bazasi paydo bo'lganda ilova birinchi ochilishda uni serverga yuboradi
(`web/src/core.js` → `Cloud`).
