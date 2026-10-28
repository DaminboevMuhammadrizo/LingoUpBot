// LingoUp Telegram Mini App — core (inlined into index.html by tools/build.mjs).
// First paint never waits for the network or the Telegram SDK: the screen is drawn from data already on
// the device, then one small request (/api/init, 304 when nothing changed) refreshes it in the background.
// The player and the test are separate chunks, loaded on demand and prefetched when the app is idle.
'use strict';
(() => {
  const CHUNKS = __CHUNKS__;
  const root = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  // Telegram passes the launch data in the URL hash; read it ourselves so nothing waits for the SDK
  const launch = new URLSearchParams(location.hash.slice(1));
  const ss = (k) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const inTg = !!(launch.get('tgWebAppData') || ss('__telegram__initParams'));
  let tg = null;
  const tgAtLeast = (v) => !!tg?.isVersionAtLeast?.(v);
  const launchUser = (() => {
    try {
      return JSON.parse(new URLSearchParams(launch.get('tgWebAppData') || '').get('user'));
    } catch {
      return null;
    }
  })();
  const launchScheme = (() => {
    try {
      const bg = JSON.parse(launch.get('tgWebAppThemeParams')).bg_color.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
      return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? 'light' : 'dark';
    } catch {
      return null;
    }
  })();

  // ---------------------------------------------------------------- texts
  const T = {
    uz: {
      home: 'Bosh', words: "So'zlar", flix: 'Flix', donate: 'Donat', profile: 'Profil',
      favorites: 'Sevimlilar', settings: 'Sozlamalar', hello: 'Salom',
      continueWatching: 'Davom ettirish', newFlix: "Flix'lar", empty: "Hozircha Flix yo'q",
      start: 'Boshlash', resume: 'Davom etish', replay: 'Qaytadan', back: 'Orqaga', finished: 'Tugadi! 🎉',
      saveWord: "So'zlarga saqlash", saved: 'Saqlandi', noTranslation: 'Tarjima topilmadi',
      holdHint: "So'zga bosing — to'xtaydi va tarjima chiqadi. Ushlab tursangiz — qo'yib yuborganda davom etadi.",
      wordsEmpty: "Hali so'z saqlanmagan. Flix ko'rayotganda so'zga bosing va \"So'zlarga saqlash\" ni tanlang.",
      search: 'Qidirish...', favoritesEmpty: "Yoqqan Flix'larga ❤ bosing — ular shu yerda chiqadi.",
      goal: 'Maqsad', collected: "Yig'ildi", cardNumber: 'Karta raqami', copy: 'Nusxa', copied: 'Nusxa olindi',
      donateSteps: ["Yuqoridagi kartaga istalgan summani o'tkazing.", "\"To'lov qildim\" tugmasini bosing — bot ochiladi.", 'Botga summani va chek rasmini yuboring. Admin tasdiqlagach sizga xabar keladi.'],
      iPaid: "To'lov qildim — chek yuborish", noCampaign: "Donat maqsadi hali qo'yilmagan.",
      theme: 'Mavzu', dark: "Qorong'i", light: "Yorug'", tgTheme: 'Telegram',
      fontSize: "Matn o'lchami", small: 'Kichik', medium: "O'rtacha", large: 'Katta',
      language: 'Til (interfeys va tarjima)', savedWords: "Saqlangan so'zlar", delete: "O'chirish",
      paragraphTranslation: 'Abzas tarjimasi', speed: 'Tezlik',
      support: 'Taklif va shikoyatlar', supportHint: 'Botga yozing — admin javob beradi',
      level: 'Daraja', allLevels: 'Hammasi', chooseLevel: 'Darajangizni tanlang',
      chooseLevelHint: "Flix'lar shu darajaga mos ko'rsatiladi. Keyin Sozlamalarda o'zgartirsa bo'ladi.",
      noReelsForLevel: "Bu darajada hali Flix yo'q.", showAll: "Barchasini ko'rsatish",
      welcome: "Ingliz tilini hikoyalar orqali o'rganing",
      feat1: "Rasm va matnli qisqa hikoyalar — Flix'lar", feat2: "Notanish so'zga bosing — tarjimasi chiqadi",
      feat3: "Har bir Flix'dan keyin test — bilimingizni sinang",
      phoneWhy: "Davom etish uchun telefon raqamingizni ulashing. U faqat ro'yxatdan o'tish uchun kerak.",
      sharePhone: 'Telefon raqamni ulashish', phoneDenied: "Raqamsiz davom etib bo'lmaydi. Qaytadan urinib ko'ring.",
      phoneOld: "Telegram ilovangiz eski. Botga /start yozing — raqamni o'sha yerda yuborasiz.",
      browserMode: 'Bu sahifa Telegram ichida ochilishi kerak. Sinov uchun ismingizni yozing:',
      yourName: 'Ismingiz', continue: 'Davom etish',
      startTest: 'Testni boshlash', qN: (n) => `${n} ta savol`, test: 'Test', testLocked: 'Test Flix tugagach ochiladi',
      testInvite: (n) => `Endi bilimingizni sinab ko'ring: ${n} ta savol`,
      tf: "To'g'ri yoki noto'g'ri?", mc: 'Javobni tanlang', inp: "Bo'sh joyga so'z yozing",
      vm: "So'z ma'nosi", vr: 'Inglizchasini toping', vt: 'Inglizcha yozing',
      vmQ: "so'zining ma'nosi qaysi?", vrQ: "— inglizcha qaysi so'z?", vtQ: "Bu so'zni inglizcha yozing:",
      yes: "To'g'ri", no: "Noto'g'ri", check: 'Tekshirish', next: 'Keyingi', finish: 'Natija',
      correct: "To'g'ri! 👏", wrong: "Noto'g'ri", almost: "Qabul qilindi, lekin yozilishiga e'tibor bering:",
      rightAnswer: "To'g'ri javob:", hint: 'Yordam', typeHere: 'Javobni yozing...',
      result: 'Test natijasi', perfect: "A'lo! Hammasi to'g'ri! 🏆", great: "Zo'r natija! 💪", good: 'Yaxshi, lekin yana mashq qiling 🙂', low: "Flix'ni yana bir bor ko'rib chiqing va qayta urinib ko'ring 📚",
      best: 'Eng yaxshi natija', mistakes: 'Xatolar ustida ishlash', retake: 'Qayta topshirish',
      rewatch: "Flix'ni qayta ko'rish", nextFlix: 'Keyingi Flix', toFeed: "Barcha Flix'lar",
      watched: "Ko'rilgan", tests: 'Testlar', avg: "O'rtacha ball", wordsN: "So'zlar",
      offlineSave: 'Hammasini oflayn saqlash', offlineSaving: 'Saqlanmoqda', offlineDone: 'Hammasi qurilmada saqlangan ✓',
      cloud: "Ma'lumotlaringiz Telegram bulutida saqlanadi",
      networkError: "Yuklab bo'lmadi. Internetni tekshiring.", retry: 'Qayta urinish', share: 'Ulashish',
      shareText: (x) => `LingoUp'da "${x}" hikoyasini o'qing va testdan o'ting!`, botMissing: 'Bot nomi sozlanmagan',
    },
    ru: {
      home: 'Главная', words: 'Слова', flix: 'Flix', donate: 'Донат', profile: 'Профиль',
      favorites: 'Избранное', settings: 'Настройки', hello: 'Привет',
      continueWatching: 'Продолжить', newFlix: 'Flix', empty: 'Пока нет Flix',
      start: 'Начать', resume: 'Продолжить', replay: 'Заново', back: 'Назад', finished: 'Готово! 🎉',
      saveWord: 'В мои слова', saved: 'Сохранено', noTranslation: 'Перевод не найден',
      holdHint: 'Нажмите на слово — пауза и перевод. Удерживайте — продолжит, когда отпустите.',
      wordsEmpty: 'Слов пока нет. Во время Flix нажмите на слово и выберите «В мои слова».',
      search: 'Поиск...', favoritesEmpty: 'Нажимайте ❤ на понравившихся Flix — они появятся здесь.',
      goal: 'Цель', collected: 'Собрано', cardNumber: 'Номер карты', copy: 'Копировать', copied: 'Скопировано',
      donateSteps: ['Переведите любую сумму на карту выше.', 'Нажмите «Я оплатил» — откроется бот.', 'Отправьте боту сумму и фото чека. После подтверждения админом придёт сообщение.'],
      iPaid: 'Я оплатил — отправить чек', noCampaign: 'Цель доната ещё не задана.',
      theme: 'Тема', dark: 'Тёмная', light: 'Светлая', tgTheme: 'Telegram',
      fontSize: 'Размер текста', small: 'Мелкий', medium: 'Средний', large: 'Крупный',
      language: 'Язык (интерфейс и перевод)', savedWords: 'Сохранённые слова', delete: 'Удалить',
      paragraphTranslation: 'Перевод абзаца', speed: 'Скорость',
      support: 'Предложения и жалобы', supportHint: 'Напишите боту — админ ответит',
      level: 'Уровень', allLevels: 'Все', chooseLevel: 'Выберите свой уровень',
      chooseLevelHint: 'Flix будут подбираться под этот уровень. Потом можно изменить в настройках.',
      noReelsForLevel: 'На этом уровне пока нет Flix.', showAll: 'Показать все',
      welcome: 'Учите английский через истории',
      feat1: 'Короткие истории с картинками — Flix', feat2: 'Нажмите на незнакомое слово — появится перевод',
      feat3: 'После каждого Flix — тест на понимание',
      phoneWhy: 'Чтобы продолжить, поделитесь номером телефона. Он нужен только для регистрации.',
      sharePhone: 'Поделиться номером', phoneDenied: 'Без номера продолжить нельзя. Попробуйте ещё раз.',
      phoneOld: 'У вас старая версия Telegram. Напишите боту /start — номер можно отправить там.',
      browserMode: 'Эту страницу нужно открывать в Telegram. Для проверки введите имя:',
      yourName: 'Ваше имя', continue: 'Продолжить',
      startTest: 'Начать тест', qN: (n) => `${n} вопросов`, test: 'Тест', testLocked: 'Тест откроется после просмотра Flix',
      testInvite: (n) => `Теперь проверьте себя: ${n} вопросов`,
      tf: 'Верно или неверно?', mc: 'Выберите ответ', inp: 'Впишите пропущенное слово',
      vm: 'Значение слова', vr: 'Найдите английское слово', vt: 'Напишите по-английски',
      vmQ: '— что означает это слово?', vrQ: '— какое это английское слово?', vtQ: 'Напишите это слово по-английски:',
      yes: 'Верно', no: 'Неверно', check: 'Проверить', next: 'Дальше', finish: 'Результат',
      correct: 'Верно! 👏', wrong: 'Неверно', almost: 'Засчитано, но обратите внимание на написание:',
      rightAnswer: 'Правильный ответ:', hint: 'Подсказка', typeHere: 'Введите ответ...',
      result: 'Результат теста', perfect: 'Отлично! Всё верно! 🏆', great: 'Хороший результат! 💪', good: 'Неплохо, но потренируйтесь ещё 🙂', low: 'Посмотрите Flix ещё раз и попробуйте снова 📚',
      best: 'Лучший результат', mistakes: 'Работа над ошибками', retake: 'Пройти заново',
      rewatch: 'Смотреть Flix снова', nextFlix: 'Следующий Flix', toFeed: 'Все Flix',
      watched: 'Просмотрено', tests: 'Тесты', avg: 'Средний балл', wordsN: 'Слова',
      offlineSave: 'Сохранить всё офлайн', offlineSaving: 'Сохранение', offlineDone: 'Всё сохранено на устройстве ✓',
      cloud: 'Ваши данные хранятся в облаке Telegram',
      networkError: 'Не удалось загрузить. Проверьте интернет.', retry: 'Повторить', share: 'Поделиться',
      shareText: (x) => `Прочитай историю «${x}» в LingoUp и пройди тест!`, botMissing: 'Имя бота не настроено',
    },
  };
  const t = (k, ...a) => {
    const v = T[S.settings.lang]?.[k] ?? T.uz[k] ?? k;
    return typeof v === 'function' ? v(...a) : v;
  };

  const LEVELS = [
    { id: 'beginner', name: 'Beginner', code: 'A1' },
    { id: 'elementary', name: 'Elementary', code: 'A2' },
    { id: 'pre-intermediate', name: 'Pre-Intermediate', code: 'B1-' },
    { id: 'intermediate', name: 'Intermediate', code: 'B1+' },
    { id: 'ielts', name: 'IELTS', code: 'B2+' },
  ];
  const levelInfo = (id) => LEVELS.find((l) => l.id === id);

  // ---------------------------------------------------------------- icons (lucide)
  const P = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M10 2v8l3-3 3 3V2"/>',
    clapper: '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 12 8 12 8s2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
    play: '<path d="M6 3l14 9-14 9z"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    gear: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7-3 1.4-1.4M17.7 6.3 19 5M2 12h2m16 0h2M5 5l1.4 1.4m11.3 11.3L19 19"/>',
    type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  };
  const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${P[n]}</svg>`;
  const logo = '<span class="logo"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="var(--primary)"/><path d="M9.5 8h13A3.5 3.5 0 0 1 26 11.5v7a3.5 3.5 0 0 1-3.5 3.5H16l-5 4v-4H9.5A3.5 3.5 0 0 1 6 18.5v-7A3.5 3.5 0 0 1 9.5 8z" fill="var(--bg)"/><path d="M16 19v-7m-3.2 3.2L16 12l3.2 3.2" fill="none" stroke="var(--primary)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Lingo<b>Up</b></span></span>';

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const money = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/\s/g, ' ');
  const wordKey = (w) => w.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, '').replace(/^'+|'+$/g, '').replace(/'s$/, '');
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const haptic = (kind, style) => {
    try {
      if (kind === 'impact') tg?.HapticFeedback?.impactOccurred(style || 'light');
      else if (kind === 'select') tg?.HapticFeedback?.selectionChanged();
      else tg?.HapticFeedback?.notificationOccurred(kind);
    } catch {}
  };
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2400);
  }
  const ls = {
    get: (k) => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));

  // IndexedDB key/value store for story bodies (bigger and async, unlike localStorage)
  const idb = (() => {
    let dbp = null;
    const open = () =>
      (dbp ??= new Promise((res, rej) => {
        const r = indexedDB.open('lingoup', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      }));
    const run = (mode, fn) =>
      open().then(
        (db) =>
          new Promise((res, rej) => {
            const tx = db.transaction('kv', mode);
            const req = fn(tx.objectStore('kv'));
            tx.oncomplete = () => res(req?.result);
            tx.onerror = () => rej(tx.error);
          }),
      );
    return {
      get: (k) => run('readonly', (s) => s.get(k)).catch(() => undefined),
      set: (k, v) => run('readwrite', (s) => s.put(v, k)).catch(() => {}),
      keys: () => run('readonly', (s) => s.getAllKeys()).catch(() => []),
      del: (keys) => run('readwrite', (s) => void keys.forEach((k) => s.delete(k))).catch(() => {}),
    };
  })();

  // ---------------------------------------------------------------- state (device + Telegram cloud)
  const KEY = 'lu1';
  const blank = () => ({
    ts: 0,
    registered: false,
    user: null,
    phone: null,
    settings: { lang: launchUser?.language_code === 'ru' ? 'ru' : 'uz', theme: 'tg', font: 'medium', speed: 1, level: null },
    progress: {},
    watched: {},
    liked: [],
    words: [],
    tests: {},
  });
  const normalize = (s) => {
    const b = blank();
    return { ...b, ...s, settings: { ...b.settings, ...s?.settings } };
  };
  let S = normalize(ls.get(KEY));
  if (launchUser)
    S.user = { id: launchUser.id, name: [launchUser.first_name, launchUser.last_name].filter(Boolean).join(' '), username: launchUser.username || null, photo: launchUser.photo_url || null };

  function save(sync = true) {
    S.ts = Date.now();
    ls.set(KEY, S);
    if (sync) Cloud.schedule();
    scheduleReport();
  }

  // Telegram's signed launch data: proves to the server who the user is (checked with the bot token)
  const initData = () => {
    try {
      return launch.get('tgWebAppData') || JSON.parse(ss('__telegram__initParams') || '{}').tgWebAppData || tg?.initData || '';
    } catch {
      return tg?.initData || '';
    }
  };
  const authHeaders = () => ({ authorization: `tma ${initData()}` });

  // level + learning stats for the admin dashboard; sent only when they change
  let reportTimer = 0;
  function scheduleReport() {
    if (!inTg || !S.registered) return;
    clearTimeout(reportTimer);
    reportTimer = setTimeout(report, 3000);
  }
  async function report() {
    const tests = Object.values(S.tests);
    const body = JSON.stringify({
      level: S.settings.level,
      lang: S.settings.lang,
      watched: Object.keys(S.watched).length,
      tests: tests.length,
      avg: tests.length ? tests.reduce((a, x) => a + x.best, 0) / tests.length : 0,
      words: S.words.length,
    });
    if (body === ls.get('lu-sent') || !initData()) return;
    try {
      const r = await fetch('api/me', { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body, keepalive: true });
      if (!r.ok) return;
      ls.set('lu-sent', body);
      if ((await r.json()).admin) ls.set('lu-admin', true);
    } catch {}
  }

  // Telegram CloudStorage: the learner's data kept by Telegram (1024 keys × 4096 chars per user),
  // stored as JSON split into chunks s0..sN with the count in "n".
  const Cloud = {
    api: null,
    ready: false,
    pending: false,
    timer: 0,
    get(keys) {
      return new Promise((res) => this.api.getItems(keys, (err, v) => res(err ? null : v)));
    },
    set(k, v) {
      return new Promise((res) => this.api.setItem(k, v, (err) => res(!err)));
    },
    async pull() {
      let changed = false;
      if (this.api)
        try {
          const n = Number((await this.get(['n']))?.n || 0);
          if (n) {
            const keys = Array.from({ length: n }, (_, i) => `s${i}`);
            const vals = await this.get(keys);
            if (vals) {
              const remote = normalize(JSON.parse(keys.map((k) => vals[k] || '').join('')));
              if (remote.ts > S.ts) changed = true;
              S = merge(S, remote);
              ls.set(KEY, S);
            }
          }
        } catch {}
      this.ready = true;
      if (this.pending) this.schedule();
      return changed;
    },
    schedule() {
      if (!this.api) return;
      if (!this.ready) return void (this.pending = true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.push(), 4000);
    },
    async push() {
      clearTimeout(this.timer);
      if (!this.api || !this.ready) return;
      const parts = JSON.stringify(S).match(/[\s\S]{1,4000}/g) || [];
      for (let i = 0; i < parts.length; i++) if (!(await this.set(`s${i}`, parts[i]))) return;
      await this.set('n', String(parts.length));
    },
  };
  // newer copy wins; progress, finished Flix, test scores and words are combined from both
  function merge(a, b) {
    const [n, o] = a.ts >= b.ts ? [a, b] : [b, a];
    const out = { ...n, registered: a.registered || b.registered, phone: n.phone || o.phone, user: a.user || b.user };
    out.progress = { ...o.progress };
    for (const [k, v] of Object.entries(n.progress)) out.progress[k] = Math.max(v, o.progress[k] || 0);
    out.watched = { ...o.watched, ...n.watched };
    out.tests = { ...o.tests };
    for (const [k, v] of Object.entries(n.tests)) out.tests[k] = { ...v, best: Math.max(v.best, o.tests[k]?.best || 0) };
    const seen = new Set(n.words.map((w) => `${w.w}|${w.lang}`));
    out.words = [...n.words, ...o.words.filter((w) => !seen.has(`${w.w}|${w.lang}`))];
    return out;
  }

  // ---------------------------------------------------------------- content: device first, network only when changed
  let IDX = ls.get('lu-idx');
  const meta = (id) => IDX?.flix.find((f) => f.id === id);

  // one request for everything the first screens need; 304 (no body) when the device copy is current
  async function refreshIndex() {
    try {
      const r = await fetch('api/init', { cache: 'no-store', headers: IDX ? { 'if-none-match': `"${IDX.v}"` } : {} });
      if (r.status === 304 || !r.ok) return false;
      const fresh = await r.json();
      const changed = fresh.v !== IDX?.v;
      IDX = fresh;
      ls.set('lu-idx', fresh);
      if (changed) idle(dropStaleBodies);
      return changed;
    } catch {
      return false;
    }
  }

  // story bodies: memory → IndexedDB → network; keyed by content hash, so each one is downloaded once
  const mem = new Map();
  const loading = new Map();
  const bodyKey = (m, lang) => `f:${m.id}:${lang}:${m.h}`;
  function getFlix(id, lang = S.settings.lang) {
    const m = meta(id);
    if (!m) return Promise.reject(new Error('unknown'));
    const key = bodyKey(m, lang);
    if (mem.has(key)) return Promise.resolve(mem.get(key));
    if (loading.has(key)) return loading.get(key);
    const p = (async () => {
      let f = await idb.get(key);
      if (!f) {
        const r = await fetch(`api/flix/${id}?lang=${lang}&h=${m.h}`);
        if (!r.ok) throw new Error('network');
        f = await r.json();
        void idb.set(key, f);
      }
      mem.set(key, f);
      return f;
    })().finally(() => loading.delete(key));
    loading.set(key, p);
    return p;
  }
  async function dropStaleBodies() {
    const live = new Set(IDX.flix.flatMap((m) => ['uz', 'ru'].map((l) => bodyKey(m, l))));
    const stale = (await idb.keys()).filter((k) => String(k).startsWith('f:') && !live.has(k));
    if (stale.length) void idb.del(stale);
  }

  // pictures: AVIF where supported, WebP otherwise; the URL carries the content hash (cached forever)
  const pic = (f, small, attrs = '') => {
    if (!f.i) return '';
    const base = `img/${f.id}${small ? '-s' : ''}`;
    return `<picture><source type="image/avif" srcset="${base}.avif?h=${f.i}"><img src="${base}.webp?h=${f.i}" alt="" ${attrs}></picture>`;
  };

  // lazy chunks (player, test): fetched on first use, prefetched when idle
  const chunks = {};
  const chunk = (name) => (chunks[name] ??= import(`./${CHUNKS[name]}`).then((m) => m.default(LU)));

  if (params.get('b')) ls.set('lu-bot', params.get('b'));
  if (params.get('a') === '1') ls.set('lu-admin', true); // the bot adds a=1 for admins
  const isAdmin = () => !!ls.get('lu-admin');
  const botName = () => IDX?.bot || ls.get('lu-bot');
  function openBot(start) {
    const b = botName();
    if (!b) return toast(t('botMissing'));
    const url = `https://t.me/${b}${start ? `?start=${start}` : ''}`;
    if (tg && inTg) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }

  // ---------------------------------------------------------------- theme
  function applyTheme() {
    const scheme = tg?.colorScheme || launchScheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const th = S.settings.theme === 'tg' ? scheme : S.settings.theme;
    const de = document.documentElement;
    de.dataset.theme = th;
    de.dataset.font = S.settings.font;
    de.lang = S.settings.lang;
    const bg = th === 'light' ? '#f7f7fb' : '#17182b';
    try {
      if (tgAtLeast('6.9')) {
        tg.setHeaderColor(bg);
        tg.setBackgroundColor(bg);
      }
      if (tgAtLeast('7.10')) tg.setBottomBarColor(bg);
    } catch {}
  }

  // ---------------------------------------------------------------- router (history state; the URL and its
  // hash stay untouched because the Telegram SDK reads its launch data from them)
  const TABS = [
    { r: '', key: 'home', icon: 'home' },
    { r: 'words', key: 'words', icon: 'book' },
    { r: 'flix', key: 'flix', icon: 'clapper' },
    { r: 'donat', key: 'donate', icon: 'gift' },
    { r: 'profile', key: 'profile', icon: 'user' },
  ];
  let cur = { p: '', d: 0 };
  function go(p, replace = false) {
    const tab = TABS.some((x) => x.r === p);
    cur = { p, d: tab ? 0 : replace ? cur.d : cur.d + 1 };
    history[replace || tab ? 'replaceState' : 'pushState'](cur, '');
    render();
    scrollTo(0, 0);
  }
  function back() {
    if (cur.d > 0) history.back();
    else go('', true);
  }
  addEventListener('popstate', (e) => {
    cur = e.state || { p: '', d: 0 };
    render();
  });
  let dispose = null;
  let levelFilter = null;

  function syncBackButton() {
    if (!tg?.BackButton) return;
    const name = cur.p.split('/')[0];
    TABS.some((x) => x.r === name) || !S.registered ? tg.BackButton.hide() : tg.BackButton.show();
  }

  function render() {
    dispose?.();
    dispose = null;
    if (!IDX) return;
    if (!S.registered) return onboarding();
    const [name = '', rawId] = cur.p.split('/');
    syncBackButton();
    const screens = { '': home, words, flix: feed, donat, profile, fav: favorites, settings, play: player, test, admin };
    dispose = (screens[name] || home)(rawId ? Number(rawId) : null) || null;
  }
  // re-render after a small change, keeping the scroll position
  function rerender() {
    const y = scrollY;
    const fy = document.querySelector('.feed')?.scrollTop;
    render();
    scrollTo(0, y);
    const nf = document.querySelector('.feed');
    if (nf && fy != null) nf.scrollTop = fy;
  }

  function shell(content, { title, tab, full } = {}) {
    root.innerHTML = `
      <header class="top">${title ? `<h1>${esc(title)}</h1>` : logo}
        <a class="iconbtn" data-go="fav" aria-label="${t('favorites')}">${ic('heart')}</a></header>
      <main class="${full ? 'full' : ''}">${content}</main>
      <nav class="nav">${TABS.map((x) => `<a data-go="${x.r}" class="${x.r === tab ? 'on' : ''}">${ic(x.icon)}${t(x.key)}</a>`).join('')}</nav>`;
  }

  // ---------------------------------------------------------------- shared pieces
  const levelBadge = (id) => {
    const l = levelInfo(id);
    return l ? `<span class="badge">${l.code} · ${l.name}</span>` : '';
  };
  const testOpen = (id) => !!(S.watched[id] || S.tests[id]);
  function flixCard(f) {
    const p = S.progress[f.id] || 0;
    const score = S.tests[f.id]?.best;
    return `<a class="fc" data-go="play/${f.id}" style="background:${f.c || 'var(--sec)'}">
      ${pic(f, true, 'loading="lazy" decoding="async"')}
      ${levelBadge(f.level)}${score != null ? `<span class="badge score">🎯 ${score}%</span>` : ''}
      <div class="meta"><b>${esc(f.title)}</b><small>${ic('clock')} ${fmt(f.sec)}${S.liked.includes(f.id) ? ` <span class="liked">${ic('heart')}</span>` : ''}${S.watched[f.id] ? ' ✓' : ''}</small></div>
      ${p > 0 ? `<div class="prog"><i style="width:${Math.min(100, (p / f.sec) * 100)}%"></i></div>` : ''}
    </a>`;
  }
  function levelPicker() {
    return `<div class="levels">${LEVELS.map((l) => `<button class="level ${S.settings.level === l.id ? 'on' : ''}" data-act="level" data-v="${l.id}"><span>${l.code}</span>${l.name}</button>`).join('')}</div>`;
  }
  const currentFilter = () => levelFilter ?? S.settings.level ?? 'all';
  const filtered = () => {
    const f = currentFilter();
    return f === 'all' ? IDX.flix : IDX.flix.filter((x) => x.level === f);
  };
  function levelChips() {
    const c = currentFilter();
    const chip = (v, label) => `<button class="chip ${c === v ? 'on' : ''}" data-act="filter" data-v="${v}">${label}</button>`;
    return `<div class="chips">${chip('all', t('allLevels'))}${LEVELS.map((l) => chip(l.id, `${l.id === S.settings.level ? '★ ' : ''}${l.name}`)).join('')}</div>`;
  }
  const noneForLevel = () => `<div class="card empty">${t('noReelsForLevel')}<br><button class="btn sm" style="margin-top:12px" data-act="filter" data-v="all">${t('showAll')}</button></div>`;
  const chipIntoView = () => document.querySelector('.chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  // ---------------------------------------------------------------- onboarding (phone number)
  function onboarding() {
    tg?.BackButton?.hide();
    root.innerHTML = `<div class="onb">
      ${logo}
      <h1>${t('welcome')}</h1>
      <div class="feat"><div><span>🎬</span>${t('feat1')}</div><div><span>👆</span>${t('feat2')}</div><div><span>🎯</span>${t('feat3')}</div></div>
      ${
        inTg
          ? `<p class="muted">${t('phoneWhy')}</p><button class="btn primary block" data-act="phone">${ic('phone')} ${t('sharePhone')}</button>`
          : `<p class="muted">${t('browserMode')}</p><input id="nm" placeholder="${t('yourName')}"><button class="btn primary block" data-act="demo">${t('continue')}</button>`
      }
    </div>`;
  }
  function register(phone) {
    S.registered = true;
    if (phone) S.phone = phone;
    save();
    void Cloud.push();
    haptic('success');
    go('', true);
  }
  async function askPhone() {
    const w = tg || (await sdk);
    if (!w?.isVersionAtLeast?.('6.9')) {
      toast(t('phoneOld'));
      return openBot('');
    }
    w.requestContact((ok, res) => {
      if (ok) register(res?.responseUnsafe?.contact?.phone_number || null);
      else {
        haptic('error');
        toast(t('phoneDenied'));
      }
    });
  }

  // ---------------------------------------------------------------- home
  function home() {
    const c = IDX.flix.find((f) => (S.progress[f.id] || 0) > 5 && (S.progress[f.id] || 0) < f.sec - 5 && !S.watched[f.id]);
    const list = filtered();
    shell(`
      <p class="muted">${t('hello')}, ${esc(S.user?.name || '')} 👋</p>
      <div class="stats">
        <div class="stat"><b>${Object.keys(S.watched).length}</b><span>${t('watched')}</span></div>
        <div class="stat"><b>${Object.keys(S.tests).length}</b><span>${t('tests')}</span></div>
        <div class="stat"><b>${S.words.length}</b><span>${t('wordsN')}</span></div>
      </div>
      ${!S.settings.level ? `<section class="card hint-card" style="margin-top:14px"><h2>${t('chooseLevel')}</h2><p class="muted" style="margin:4px 0 14px;font-size:13px">${t('chooseLevelHint')}</p>${levelPicker()}</section>` : ''}
      ${
        c
          ? `<a class="card cont" data-go="play/${c.id}">${pic(c, true)}<span class="grow"><small>${t('continueWatching')}</small><b>${esc(c.title)}</b>
            <div class="bar"><i style="width:${(S.progress[c.id] / c.sec) * 100}%"></i></div><small class="muted" style="font-weight:500">${fmt(S.progress[c.id])} / ${fmt(c.sec)}</small></span><span style="color:var(--primary)">${ic('play', 'fill')}</span></a>`
          : ''
      }
      <h2 class="section-title">${t('newFlix')}</h2>
      ${levelChips()}
      <div style="height:12px"></div>
      ${list.length ? `<div class="grid">${list.map(flixCard).join('')}</div>` : IDX.flix.length ? noneForLevel() : `<div class="card empty">${t('empty')}</div>`}
    `, { tab: '' });
    chipIntoView();
  }

  // ---------------------------------------------------------------- Flix feed
  function feed() {
    const list = filtered();
    shell(`
      <div style="padding:8px 16px 4px;max-width:480px;margin:0 auto">${levelChips()}</div>
      ${list.length ? `<div class="feed">${list.map(slide).join('')}</div>` : `<div style="padding:16px">${IDX.flix.length ? noneForLevel() : `<div class="card empty">${t('empty')}</div>`}</div>`}
    `, { title: t('flix'), tab: 'flix', full: true });
    const el = document.querySelector('.feed');
    const fit = () => el && (el.style.height = `${innerHeight - el.getBoundingClientRect().top - document.querySelector('.nav').offsetHeight}px`);
    fit();
    addEventListener('resize', fit);
    chipIntoView();
    return () => removeEventListener('resize', fit);
  }
  function slide(f) {
    const p = S.progress[f.id] || 0;
    const canResume = p > 5 && p < f.sec - 5;
    const tt = f.tt?.[S.settings.lang];
    const score = S.tests[f.id]?.best;
    return `<div class="slide"><div style="background:${f.c || '#000'}">
      ${pic(f, false, 'loading="lazy" decoding="async" class="kenburns"')}
      <div class="shade"></div>
      <div class="info">
        ${levelBadge(f.level)} ${score != null ? `<span class="badge score">🎯 ${score}%</span>` : ''}
        <p style="display:flex;gap:6px;align-items:center;font-weight:700">${ic('clock')} ${fmt(f.sec)} · ${t('qN', f.q)}</p>
        <h2>${esc(f.title)}</h2>${tt ? `<p style="font-weight:700;opacity:.75;margin-top:2px">${esc(tt)}</p>` : ''}
        ${f.d ? `<p>${esc(f.d)}</p>` : ''}
        <div class="btns">
          <a class="btn primary" data-go="play/${f.id}">${ic('play', 'fill')} ${canResume ? t('resume') : t('start')}</a>
          ${testOpen(f.id) ? `<a class="btn glass" data-go="test/${f.id}">${ic('target')} ${t('test')}</a>` : `<span class="btn glass" style="opacity:.7;font-size:12px" data-act="locked">${ic('lock')} ${t('test')}</span>`}
        </div>
      </div>
      <div class="side">
        <button data-act="like" data-id="${f.id}"><span class="${S.liked.includes(f.id) ? 'liked' : ''}">${ic('heart')}</span></button>
        <button data-act="share" data-id="${f.id}"><span>${ic('share')}</span>${t('share')}</button>
      </div>
    </div></div>`;
  }

  // ---------------------------------------------------------------- player / test (lazy chunks)
  function lazyScreen(name, id) {
    const m = meta(id);
    if (!m) return void go('', true);
    root.innerHTML = `<div class="${name === 'player' ? 'player' : 'test'}"><div class="center" style="min-height:100vh"><div class="spin"></div></div></div>`;
    let alive = true;
    let cleanup = null;
    Promise.all([chunk(name), getFlix(id)]).then(
      ([mount, f]) => alive && (cleanup = mount(root, m, f)),
      () =>
        alive &&
        (root.innerHTML = `<div class="center" style="min-height:100vh"><div class="empty">${t('networkError')}<br><button class="btn sm" style="margin-top:12px" data-act="back">${t('back')}</button></div></div>`),
    );
    return () => {
      alive = false;
      cleanup?.();
    };
  }
  function admin() {
    shell(`<div class="center"><div class="spin"></div></div>`, { title: 'Admin panel' });
    let alive = true;
    let cleanup = null;
    chunk('admin').then((mount) => alive && (cleanup = mount(document.querySelector('main'))));
    return () => {
      alive = false;
      cleanup?.();
    };
  }
  const player = (id) => lazyScreen('player', id);
  const test = (id) => lazyScreen('test', id);

  function toggleLike(id) {
    const i = S.liked.indexOf(id);
    if (i >= 0) S.liked.splice(i, 1);
    else S.liked.unshift(id);
    haptic('impact');
    save();
  }

  // ---------------------------------------------------------------- words
  function words() {
    shell(`
      <label class="search">${ic('search')}<input id="q" placeholder="${t('search')}"><span class="muted" style="font-size:12px">${S.words.length}</span></label>
      <div class="list" id="wl"></div>`, { title: t('savedWords'), tab: 'words' });
    const draw = (q = '') => {
      q = q.toLowerCase();
      const list = S.words.filter((w) => !q || w.w.includes(q) || w.tr.toLowerCase().includes(q));
      document.getElementById('wl').innerHTML = !S.words.length
        ? `<div class="card empty">${t('wordsEmpty')}</div>`
        : list
            .map(
              (w) => `<div class="wrow"><div class="grow"><b>${esc(w.w)}</b><span>${esc(w.tr)}</span></div>
              ${'speechSynthesis' in window ? `<button class="iconbtn" data-act="say" data-w="${esc(w.w)}">${ic('volume')}</button>` : ''}
              <span class="tag">${w.lang}</span>
              <button class="iconbtn muted" data-act="delword" data-w="${esc(w.w)}" data-l="${w.lang}" aria-label="${t('delete')}">${ic('trash')}</button></div>`,
            )
            .join('');
    };
    draw();
    document.getElementById('q').addEventListener('input', (e) => draw(e.target.value));
  }

  function favorites() {
    const list = S.liked.map(meta).filter(Boolean);
    shell(list.length ? `<div class="grid">${list.map(flixCard).join('')}</div>` : `<div class="card empty">${t('favoritesEmpty')}</div>`, { title: t('favorites') });
  }

  // ---------------------------------------------------------------- donate
  function donat() {
    const c = IDX.campaign;
    if (!c) return shell(`<div class="card empty">${t('noCampaign')}</div>`, { title: t('donate'), tab: 'donat' });
    const pct = c.goal ? Math.min(100, ((c.collected || 0) / c.goal) * 100) : 0;
    shell(`
      <section class="card">
        <h2>${esc(c.title)}</h2>
        <p class="muted pre" style="margin-top:8px">${esc(c.description)}</p>
        <div style="display:flex;justify-content:space-between;margin-top:16px;font-size:13px" class="muted"><span>${t('collected')}</span><span>${t('goal')}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="money">${money(c.collected)}</span><b>${money(c.goal)} so'm</b></div>
        <div class="bar" style="height:10px"><i style="width:${pct}%"></i></div>
      </section>
      <section class="card" style="margin-top:12px">
        <p class="muted" style="font-size:13px">${t('cardNumber')}</p>
        <div class="cardnum"><span>${esc(c.cardNumber)}</span><button class="btn sm" data-act="copy" data-v="${esc(c.cardNumber.replace(/\s/g, ''))}">${ic('copy')} ${t('copy')}</button></div>
        <p class="muted" style="margin-top:8px;font-size:13px">${esc(c.cardHolder)}</p>
        <ol class="steps">${t('donateSteps').map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <button class="btn primary block" style="margin-top:16px" data-act="paid">${ic('check')} ${t('iPaid')}</button>
      </section>`, { title: t('donate'), tab: 'donat' });
  }

  // ---------------------------------------------------------------- profile
  function profile() {
    const u = S.user || {};
    const scores = Object.values(S.tests);
    const avg = scores.length ? Math.round(scores.reduce((a, s) => a + s.best, 0) / scores.length) : 0;
    const offlineDone = ls.get('lu-offline') === `${IDX.v}:${S.settings.lang}`;
    shell(`
      <div class="card me">
        ${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" decoding="async">` : `<span class="avatar">${esc((u.name || '?').slice(0, 1).toUpperCase())}</span>`}
        <div style="min-width:0"><h2 style="font-size:1.3rem">${esc(u.name || '')}</h2>
          ${u.username ? `<p class="muted">@${esc(u.username)}</p>` : ''}
          ${S.phone ? `<p class="muted" style="font-size:13px">${ic('phone')} +${esc(String(S.phone).replace(/^\+/, ''))}</p>` : ''}</div>
      </div>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">
        <div class="stat"><b>${Object.keys(S.watched).length}</b><span>${t('watched')}</span></div>
        <div class="stat"><b>${scores.length}</b><span>${t('tests')}</span></div>
        <div class="stat"><b>${avg}%</b><span>${t('avg')}</span></div>
        <div class="stat"><b>${S.words.length}</b><span>${t('wordsN')}</span></div>
      </div>
      <div class="rows">
        <a class="row" data-go="fav">${ic('heart')}<span class="grow">${t('favorites')}</span><span class="muted">${S.liked.length}</span>${ic('chev')}</a>
        <a class="row" data-go="words">${ic('book')}<span class="grow">${t('savedWords')}</span><span class="muted">${S.words.length}</span>${ic('chev')}</a>
        ${isAdmin() ? `<a class="row" data-go="admin">${ic('grad')}<span class="grow">Admin panel</span>${ic('chev')}</a>` : ''}
        <a class="row" data-go="settings">${ic('gear')}<span class="grow">${t('settings')}</span>${ic('chev')}</a>
        <button class="row" data-act="support">${ic('msg')}<span class="grow">${t('support')}<br><small class="muted" style="font-weight:500">${t('supportHint')}</small></span>${ic('chev')}</button>
        <button class="row" data-act="offline" id="offbtn" ${offlineDone ? 'disabled' : ''}>${ic('download')}<span class="grow" id="offtxt">${offlineDone ? t('offlineDone') : t('offlineSave')}</span></button>
        ${inTg ? `<div class="row" style="font-weight:500">${ic('cloud')}<span class="grow muted" style="font-size:13px">${t('cloud')}</span></div>` : ''}
      </div>`, { title: t('profile'), tab: 'profile' });
  }

  // every story body into IndexedDB, every picture into the service worker cache
  async function saveOffline() {
    const label = (s) => {
      const el = document.getElementById('offtxt');
      if (el) el.textContent = s;
    };
    document.getElementById('offbtn').disabled = true;
    const n = IDX.flix.length;
    const pct = (x) => label(`${t('offlineSaving')}… ${Math.min(100, Math.round(x * 100))}%`);
    const ids = IDX.flix.map((f) => f.id);
    let done = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (ids.length) {
          await getFlix(ids.shift()).catch(() => {});
          pct(++done / (2 * n));
        }
      }),
    );
    const sw = navigator.serviceWorker?.controller;
    if (sw) {
      const ext = (await avifOk) ? 'avif' : 'webp';
      const urls = IDX.flix.filter((f) => f.i).flatMap((f) => [`img/${f.id}.${ext}?h=${f.i}`, `img/${f.id}-s.${ext}?h=${f.i}`]);
      await new Promise((res) => {
        const onMsg = (e) => {
          if (e.data?.type !== 'precache-progress') return;
          pct(0.5 + e.data.done / e.data.total / 2);
          if (e.data.done >= e.data.total) {
            navigator.serviceWorker.removeEventListener('message', onMsg);
            res();
          }
        };
        navigator.serviceWorker.addEventListener('message', onMsg);
        sw.postMessage({ type: 'precache', urls });
      });
    }
    ls.set('lu-offline', `${IDX.v}:${S.settings.lang}`);
    haptic('success');
    label(t('offlineDone'));
  }
  const avifOk = new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i.width > 0);
    i.onerror = () => res(false);
    i.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  });

  // ---------------------------------------------------------------- settings
  function settings() {
    const seg = (key, opts) =>
      `<div class="seg">${opts.map(([v, label]) => `<button class="${S.settings[key] === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
    shell(`
      <section class="card set"><h3>${ic('grad')} ${t('level')}</h3><div style="margin-top:12px">${levelPicker()}</div></section>
      <section class="card set"><h3>${ic('globe')} ${t('language')}</h3>${seg('lang', [['uz', "O'zbekcha"], ['ru', 'Русский']])}</section>
      <section class="card set"><h3>${ic('sun')} ${t('theme')}</h3>${seg('theme', [['tg', t('tgTheme')], ['dark', t('dark')], ['light', t('light')]])}</section>
      <section class="card set"><h3>${ic('type')} ${t('fontSize')}</h3>${seg('font', [['small', t('small')], ['medium', t('medium')], ['large', t('large')]])}
        <p style="margin-top:12px;font-size:var(--text-size);font-weight:650;line-height:1.4">Hello! 👋</p></section>
      <p class="muted" style="text-align:center;margin-top:18px;font-size:12px">LingoUp · v${esc(IDX.v)}</p>`, { title: t('settings') });
  }

  // ---------------------------------------------------------------- global actions
  const say = (w) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(w);
      u.lang = 'en-US';
      speechSynthesis.speak(u);
    } catch {}
  };
  const ACT = {
    phone: askPhone,
    demo() {
      const name = document.getElementById('nm').value.trim();
      if (!name) return;
      S.user = { name };
      register(null);
    },
    level(el) {
      S.settings.level = el.dataset.v;
      levelFilter = null;
      save();
      haptic('select');
      rerender();
    },
    filter(el) {
      levelFilter = el.dataset.v;
      haptic('select');
      render();
      scrollTo(0, 0);
    },
    like(el) {
      toggleLike(Number(el.dataset.id));
      el.querySelector('span').classList.toggle('liked', S.liked.includes(Number(el.dataset.id)));
    },
    share(el) {
      const f = meta(Number(el.dataset.id));
      const b = botName();
      if (!b) return toast(t('botMissing'));
      const url = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${b}?startapp=f${f.id}`)}&text=${encodeURIComponent(t('shareText', f.title))}`;
      tg && inTg ? tg.openTelegramLink(url) : window.open(url, '_blank');
    },
    locked: () => toast(t('testLocked')),
    say: (el) => say(el.dataset.w),
    delword(el) {
      S.words = S.words.filter((w) => !(w.w === el.dataset.w && w.lang === el.dataset.l));
      save();
      el.closest('.wrow').remove();
      haptic('impact');
    },
    copy(el) {
      const done = () => {
        toast(t('copied'));
        haptic('success');
      };
      navigator.clipboard?.writeText(el.dataset.v).then(done, done) ?? done();
    },
    paid: () => openBot('donate'),
    support: () => openBot('support'),
    offline: saveOffline,
    set(el) {
      S.settings[el.dataset.k] = el.dataset.v;
      save();
      applyTheme();
      haptic('select');
      rerender();
    },
    back,
    retry: () => void boot(),
  };
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) {
      e.preventDefault();
      return go(g.dataset.go);
    }
    const el = e.target.closest('[data-act]');
    if (el && ACT[el.dataset.act]) {
      e.preventDefault();
      ACT[el.dataset.act](el);
    }
  });
  // a finger on a card already starts loading the story, before the tap ends
  document.addEventListener(
    'pointerdown',
    (e) => {
      const id = e.target.closest('[data-go^="play/"],[data-go^="test/"]')?.dataset.go.split('/')[1];
      if (id) void getFlix(Number(id)).catch(() => {});
    },
    { passive: true },
  );

  // what the player and test chunks get from the core
  const LU = {
    t, ic, esc, fmt, haptic, toast, wordKey, shuffle, levelBadge, testOpen, pic, back, go, toggleLike, save, say, authHeaders, LEVELS,
    get S() {
      return S;
    },
    get tg() {
      return tg;
    },
    inTg,
    tgAtLeast,
    get idx() {
      return IDX;
    },
  };

  // ---------------------------------------------------------------- Telegram SDK (arrives asynchronously)
  const sdk = new Promise((res) => {
    const done = () => res(window.Telegram?.WebApp || null);
    if (window.Telegram?.WebApp) return done();
    window.__tgl = done;
    setTimeout(done, inTg ? 8000 : 1500);
  });
  void sdk.then(async (w) => {
    if (!w || tg) return;
    tg = w;
    tg.ready();
    tg.expand();
    try {
      if (tgAtLeast('7.7')) tg.disableVerticalSwipes();
    } catch {}
    tg.onEvent('themeChanged', applyTheme);
    tg.BackButton?.onClick(back);
    applyTheme();
    syncBackButton();
    if (tgAtLeast('6.9') && tg.initData) {
      Cloud.api = tg.CloudStorage;
      const was = S.registered;
      if (await Cloud.pull()) {
        if (!was && S.registered) go('', true);
        else if (!/^(play|test)\//.test(cur.p)) rerender();
      }
    }
  });

  // ---------------------------------------------------------------- start
  async function boot() {
    // the bot opens the app with ?r=1 once the phone number has been shared in the chat
    if (params.get('r') === '1' && inTg && !S.registered) {
      S.registered = true;
      save();
    }
    applyTheme();
    const sp = launch.get('tgWebAppStartParam') || params.get('startapp');
    cur = { p: sp && /^f\d+$/.test(sp) ? `play/${sp.slice(1)}` : cur.p, d: 0 };
    history.replaceState(cur, '');
    const hadIndex = !!IDX;
    if (hadIndex) render(); // instant: everything comes from the device
    const changed = await refreshIndex();
    if (!IDX)
      return void (root.innerHTML = `<div class="center"><div class="empty">${t('networkError')}<br><button class="btn sm" style="margin-top:12px" data-act="retry">${t('retry')}</button></div></div>`);
    scheduleReport();
    if (!hadIndex) render();
    else if (changed && !/^(play|test)\//.test(cur.p)) rerender();
  }
  void boot().then(() =>
    idle(() => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
      void chunk('player');
      void chunk('test');
    }),
  );
  document.addEventListener('visibilitychange', () => document.hidden && Cloud.push());
})();
