// Flix player chunk: the text scrolls from below the screen to above it in exactly the Flix duration;
// tap a word to stop and translate it, hold a word to pause only while it is held.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default (LU) =>
  function mountPlayer(root, m, f) {
    const { t, ic, esc, fmt, haptic, wordKey } = LU;
    const S = LU.S;
    const lang = S.settings.lang;
    const gl = f.gl || {};
    const dur = m.sec;
    const paras = f.text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    let elapsed = Math.min(S.progress[m.id] || 0, Math.max(0, dur - 5));
    let playing = false;
    let started = false;
    let finished = false;
    let hold = null;
    let hideTimer = 0;
    let wake = null;
    let popupKey = null;

    root.innerHTML = `<div class="player" id="pl" style="background:${m.c || '#000'}">
      ${LU.pic(m, false, 'class="bg kenburns" decoding="async"')}
      <div class="shade"></div>
      <div class="pv" id="pv"><div class="pt" id="pt">${paras
        .map((p, k) => `<p>${p.split(/\s+/).map((tok) => tok.split(/(?<=-)/).map((w) => `<span class="w" data-p="${k}">${esc(w)}</span>`).join('')).join(' ')}</p>`)
        .join('')}</div></div>
      <div class="pl-top" id="ptop">
        <button class="rb" data-pa="close" aria-label="${t('back')}">${ic('x')}</button>
        <p>${esc(m.title)}</p>
        <button class="rb ${S.liked.includes(m.id) ? 'liked' : ''}" data-pa="like" id="plike">${ic('heart')}</button>
      </div>
      <div class="pl-bottom hide" id="pbot">
        <div class="pbar" id="pbar"><i id="pfill"></i></div>
        <div class="prow"><span id="pclock"></span>
          <button class="pplay" data-pa="toggle" id="ptoggle">${ic('play')}</button>
          <span class="pspeed"><button data-pa="speed"><b id="pspeed">${S.settings.speed}x</b></button></span></div>
      </div>
      <div id="ppop"></div>
      <div id="pover"></div>
    </div>`;
    const $ = (id) => document.getElementById(id);
    const pl = $('pl');
    const pv = $('pv');
    const pt = $('pt');
    const fill = $('pfill');
    const clock = $('pclock');
    const pop = $('ppop');
    const over = $('pover');
    let lastSec = -1;
    // text and viewport sizes only change on resize — not read on every frame
    let H = pv.clientHeight;
    let TH = pt.scrollHeight;
    const measure = () => {
      H = pv.clientHeight;
      TH = pt.scrollHeight;
    };
    addEventListener('resize', measure);

    const fullscreen = (on) => {
      const tg = LU.tg;
      try {
        if (LU.inTg && tg && LU.tgAtLeast('8.0')) {
          if (on && !tg.isFullscreen) tg.requestFullscreen();
          if (!on && tg.isFullscreen) tg.exitFullscreen();
        } else if (on) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } catch {}
    };
    const persist = () => {
      S.progress[m.id] = Math.floor(elapsed);
      LU.save();
    };

    function showControls() {
      $('ptop').classList.remove('hide');
      if (started) $('pbot').classList.remove('hide');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (playing) {
          $('ptop').classList.add('hide');
          $('pbot').classList.add('hide');
        }
      }, 2500);
    }

    function setPlay(p) {
      playing = p;
      $('ptoggle').innerHTML = ic(p ? 'pause' : 'play');
      showControls();
      if (p) navigator.wakeLock?.request('screen').then((l) => (wake = l), () => {});
      else {
        wake?.release().catch(() => {});
        wake = null;
        persist();
      }
    }

    function overlay() {
      if (started && !finished) return void (over.innerHTML = '');
      if (finished) {
        over.innerHTML = `<div class="over">
          <h1>${t('finished')}</h1>
          <p class="sub">${t('testInvite', f.quiz.length)}</p>
          <button class="btn primary test-cta" data-pa="test">${ic('target')} ${t('startTest')}</button>
          <div class="btns"><button class="btn glass" data-pa="replay">${ic('rotate')} ${t('replay')}</button><button class="btn glass" data-pa="close">${t('back')}</button></div>
        </div>`;
        return;
      }
      const tt = f.tr?.title;
      over.innerHTML = `<div class="over">
        <h1>${esc(m.title)}</h1>
        ${tt ? `<p class="sub" style="margin-top:-6px;font-size:1.1rem">${esc(tt)}</p>` : ''}
        ${LU.levelBadge(m.level)}
        ${m.d ? `<p class="sub">${esc(m.d)}</p>` : ''}
        <p class="small">${fmt(dur)} · ${t('holdHint')}</p>
        <div class="btns">
          <button class="btn primary" data-pa="start" style="padding:14px 32px">${ic('play', 'fill')} ${elapsed > 1 ? t('resume') : t('start')}</button>
          ${LU.testOpen(m.id) ? `<button class="btn glass" data-pa="test">${ic('target')} ${t('test')}</button>` : ''}
          <button class="btn glass" data-pa="close">${t('back')}</button>
        </div>
      </div>`;
    }

    function start() {
      if (elapsed >= dur) elapsed = 0;
      finished = false;
      started = true;
      fullscreen(true);
      overlay();
      setPlay(true);
      setTimeout(measure, 300); // fullscreen changes the viewport
    }

    function finish() {
      playing = false;
      finished = true;
      elapsed = dur;
      $('ptoggle').innerHTML = ic('play');
      S.progress[m.id] = dur;
      S.watched[m.id] = Date.now();
      LU.save();
      haptic('success');
      closePopup(false);
      overlay();
    }

    let raf = 0;
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (playing) {
        elapsed = Math.min(dur, elapsed + dt * S.settings.speed);
        if (elapsed >= dur) finish();
      }
      const p = elapsed / dur;
      pt.style.transform = `translate3d(0,${H - p * (H + TH)}px,0)`;
      fill.style.transform = `scaleX(${p})`;
      const sec = Math.floor(elapsed);
      if (sec !== lastSec) {
        lastSec = sec;
        clock.textContent = `${fmt(elapsed)} / ${fmt(dur)}`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const saver = setInterval(() => playing && persist(), 3000);

    // ---- word popup
    function openWord(span) {
      const key = wordKey(span.textContent);
      if (!key) return;
      popupKey = key;
      pv.querySelectorAll('.w.on').forEach((e) => e.classList.remove('on'));
      pv.querySelectorAll('.w').forEach((e) => wordKey(e.textContent) === key && e.classList.add('on'));
      const text = gl[key] || gl[key.replace(/(ing|ed|es|s)$/, '')] || null;
      const para = f.tr?.paragraphs?.[Number(span.dataset.p)];
      const isSaved = S.words.some((w) => w.w === key && w.lang === lang);
      pop.innerHTML = `<div class="pop">
        <div class="word">${esc(span.textContent.replace(/[^A-Za-z'’-]/g, ''))}
          ${'speechSynthesis' in window ? `<button data-pa="say" style="color:#0a7a43">${ic('volume')}</button>` : ''}</div>
        <p class="tr">${text ? esc(text) : t('noTranslation')}</p>
        ${para ? `<button class="para" data-pa="para"><b>${t('paragraphTranslation')}</b><span hidden>${esc(para)}</span></button>` : ''}
        <div class="acts">
          <button class="btn light" data-pa="saveword" ${!text || isSaved ? 'disabled' : ''}>${ic(isSaved ? 'check' : 'bookmark')} ${isSaved ? t('saved') : t('saveWord')}</button>
          <button class="btn dark" data-pa="resume">${ic('play', 'fill')} ${t('resume')}</button>
        </div></div>`;
      pop.dataset.text = text || '';
      haptic('select');
    }
    function closePopup(resume) {
      pop.innerHTML = '';
      popupKey = null;
      pv.querySelectorAll('.w.on').forEach((e) => e.classList.remove('on'));
      if (resume) setPlay(true);
    }

    const onDown = (e) => {
      const span = e.target.closest('.w');
      if (!span || !started || finished) return;
      e.stopPropagation();
      hold = { at: performance.now(), was: playing };
      if (playing) setPlay(false);
      openWord(span);
      const up = () => {
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        const h = hold;
        hold = null;
        if (h?.was && performance.now() - h.at >= 350) closePopup(true);
      };
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    };
    const onBgClick = (e) => {
      if (e.target.closest('.w') || !started || finished) return;
      if (popupKey) return closePopup(true);
      if (!playing) setPlay(true);
      else showControls();
    };
    pv.addEventListener('pointerdown', onDown);
    pv.addEventListener('click', onBgClick);

    const actions = {
      close() {
        persist();
        fullscreen(false);
        LU.back();
      },
      start,
      replay() {
        elapsed = 0;
        start();
      },
      test() {
        fullscreen(false);
        LU.go(`test/${m.id}`, true);
      },
      toggle() {
        closePopup(false);
        if (!finished) setPlay(!playing);
      },
      like() {
        LU.toggleLike(m.id);
        $('plike').classList.toggle('liked', S.liked.includes(m.id));
        showControls();
      },
      speed() {
        const i = SPEEDS.indexOf(S.settings.speed);
        S.settings.speed = SPEEDS[(i + 1) % SPEEDS.length];
        LU.save();
        $('pspeed').textContent = `${S.settings.speed}x`;
        showControls();
      },
      resume: () => closePopup(true),
      para(el) {
        const s = el.querySelector('span');
        s.hidden = !s.hidden;
      },
      say: () => LU.say(popupKey),
      saveword(el) {
        if (!popupKey || !pop.dataset.text) return;
        S.words.unshift({ w: popupKey, tr: pop.dataset.text, lang, f: m.id, at: Date.now() });
        LU.save();
        el.disabled = true;
        el.innerHTML = `${ic('check')} ${t('saved')}`;
        haptic('success');
      },
    };
    pl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pa]');
      if (!b) return;
      e.stopPropagation();
      actions[b.dataset.pa]?.(b);
    });
    $('pbar').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      elapsed = Math.max(0, Math.min(dur - 0.5, ((e.clientX - r.left) / r.width) * dur));
      if (finished) {
        finished = false;
        overlay();
      }
      showControls();
    });
    const onHide = () => document.hidden && playing && setPlay(false);
    document.addEventListener('visibilitychange', onHide);
    const onKey = (e) => {
      if (e.code === 'Space' && started && !finished) {
        e.preventDefault();
        closePopup(false);
        setPlay(!playing);
      }
    };
    addEventListener('keydown', onKey);

    overlay();
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(saver);
      clearTimeout(hideTimer);
      wake?.release().catch(() => {});
      removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('keydown', onKey);
      if (started) persist();
      fullscreen(false);
    };
  };
