// Test chunk: true/false, multiple choice, fill-in, word meaning, find the English word, type the word.
const norm = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const LABEL = { tf: ['tf', '⚖️'], mc: ['mc', '☑️'], in: ['inp', '✍️'], vm: ['vm', '📖'], vr: ['vr', '🔤'], vt: ['vt', '⌨️'] };

export default (LU) =>
  function mountTest(root, m, f) {
    const { t, ic, esc, haptic, shuffle } = LU;
    const S = LU.S;
    const gl = f.gl || {};
    const mean = (w) => gl[w] || w;
    let qs, n, i, score, answered, hintShown, mistakes;

    // options are stored right answer first; shuffle them and remember where it went
    function reset() {
      qs = shuffle(
        f.quiz.map((q) => {
          if (!q.o) return { ...q };
          const order = shuffle(q.o.map((_, k) => k));
          return { ...q, opts: order.map((k) => q.o[k]), ci: order.indexOf(0) };
        }),
      );
      n = qs.length;
      i = 0;
      score = 0;
      mistakes = [];
      show();
    }
    const answerText = (q) => (q.t === 'tf' ? (q.a ? t('yes') : t('no')) : q.t === 'mc' ? q.o[0] : q.t === 'in' ? q.a[0] : q.t === 'vm' ? mean(q.w) : q.w);
    const questionText = (q) => (q.t === 'vm' ? `“${q.w}”` : q.t === 'vr' || q.t === 'vt' ? `“${mean(q.w)}”` : q.q);

    function show() {
      const q = qs[i];
      answered = false;
      hintShown = false;
      const [lk, emoji] = LABEL[q.t];
      let body;
      if (q.t === 'tf') {
        body = `<p class="q">${esc(q.q)}</p>
          <div class="opts tf"><button class="opt" data-ta="pick" data-v="1"><i>✓</i>${t('yes')}<small class="muted">True</small></button>
          <button class="opt" data-ta="pick" data-v="0"><i>✕</i>${t('no')}<small class="muted">False</small></button></div>`;
      } else if (q.opts) {
        const head =
          q.t === 'mc'
            ? `<p class="q">${esc(q.q)}</p>`
            : q.t === 'vm'
              ? `<p class="qword">${esc(q.w)}</p><p class="muted" style="margin-top:4px">${t('vmQ')}</p>`
              : `<p class="qword">${esc(mean(q.w))}</p><p class="muted" style="margin-top:4px">${t('vrQ')}</p>`;
        const text = (o) => (q.t === 'vm' ? mean(o) : o);
        body = `${head}<div class="opts">${q.opts.map((o, k) => `<button class="opt" data-ta="pick" data-v="${k}"><i>${'ABCD'[k]}</i>${esc(text(o))}</button>`).join('')}</div>`;
      } else {
        const head =
          q.t === 'in'
            ? `<p class="q">${esc(q.q).replace('___', '<span class="blank">?</span>')}</p>`
            : `<p class="muted" style="margin-top:14px">${t('vtQ')}</p><p class="qword">${esc(mean(q.w))}</p>`;
        body = `${head}<form class="answer"><input id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${t('typeHere')}"><button class="btn primary" type="submit">${t('check')}</button></form>
          <p class="hintline" id="hintline"><button type="button" data-ta="hint">💡 ${t('hint')}</button></p>`;
      }
      root.innerHTML = `<div class="test">
        <div class="test-head"><button class="iconbtn" data-ta="close">${ic('x')}</button><div class="bar"><i style="width:${(i / n) * 100}%"></i></div><b>${i + 1}/${n}</b></div>
        <div class="qcard"><span class="qtype">${emoji} ${t(lk)}</span>${body}<div id="fb"></div></div>
        <div class="test-foot"><button class="btn primary block" id="nextbtn" data-ta="next" hidden>${i + 1 < n ? t('next') : t('finish')} →</button></div>
      </div>`;
      scrollTo(0, 0);
    }

    function feedback(ok, q, near) {
      answered = true;
      if (ok) score++;
      else mistakes.push(q);
      haptic(ok ? 'success' : 'error');
      document.getElementById('fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">${ok ? (near ? t('almost') : t('correct')) : t('wrong')}
        ${!ok || near ? `<small>${ok ? '' : `${t('rightAnswer')} `}<b>${esc(answerText(q))}</b></small>` : ''}</div>`;
      const nb = document.getElementById('nextbtn');
      nb.hidden = false;
      nb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function pick(el) {
      if (answered) return;
      const q = qs[i];
      const v = Number(el.dataset.v);
      const ok = q.t === 'tf' ? (v === 1) === q.a : v === q.ci;
      el.classList.add(ok ? 'ok' : 'bad');
      if (!ok) root.querySelector(`.opt[data-v="${q.t === 'tf' ? (q.a ? 1 : 0) : q.ci}"]`)?.classList.add('ok');
      feedback(ok, q);
    }

    function checkTyped() {
      if (answered) return;
      const q = qs[i];
      const input = document.getElementById('ans');
      const val = norm(input.value);
      if (!val) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        return;
      }
      const answers = (q.t === 'in' ? q.a : [q.w]).map(norm);
      const exact = answers.includes(val);
      const near = !exact && answers.some((a) => a.length >= 5 && lev(a, val) <= 1);
      input.classList.add(exact || near ? 'ok' : 'bad');
      input.readOnly = true;
      input.blur();
      feedback(exact || near, q, near);
    }

    function hint() {
      if (answered || hintShown) return;
      hintShown = true;
      const a = qs[i].t === 'in' ? qs[i].a[0] : qs[i].w;
      document.getElementById('hintline').textContent = `💡 ${a[0]} ${'_ '.repeat(a.length - 1).trim()}  (${a.length})`;
    }

    function result() {
      const pct = Math.round((score / n) * 100);
      const prev = S.tests[m.id];
      S.tests[m.id] = { best: Math.max(pct, prev?.best || 0), last: pct, n: (prev?.n || 0) + 1, at: Date.now() };
      S.watched[m.id] ||= Date.now();
      LU.save();
      haptic(pct >= 70 ? 'success' : 'warning');
      const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
      const msg = pct === 100 ? t('perfect') : pct >= 70 ? t('great') : pct >= 50 ? t('good') : t('low');
      const C = 2 * Math.PI * 70;
      const color = pct >= 70 ? 'var(--ok)' : pct >= 50 ? 'var(--accent)' : 'var(--danger)';
      const next = LU.idx.flix.filter((x) => x.level === m.level && x.id !== m.id && !S.watched[x.id]).sort((a, b) => a.id - b.id)[0];
      root.innerHTML = `<div class="test"><div class="test-head"><button class="iconbtn" data-ta="close">${ic('x')}</button><b style="flex:1;text-align:left;color:var(--fg)">${esc(m.title)}</b></div>
        <div class="result">
          <h2 style="margin-top:8px">${t('result')}</h2>
          <div class="ring"><svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" stroke="var(--sec)"/><circle cx="80" cy="80" r="70" stroke="${color}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" style="transition:stroke-dashoffset 1s"/></svg>
            <b>${pct}%<small>${score} / ${n}</small></b></div>
          <div class="stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">⭐</span>`).join('')}</div>
          <p style="margin-top:8px;font-weight:700">${msg}</p>
          <p class="muted" style="margin-top:4px;font-size:13px">${t('best')}: ${S.tests[m.id].best}%</p>
          ${
            mistakes.length
              ? `<h3 class="section-title" style="text-align:left">${t('mistakes')}</h3><div class="mistakes">${mistakes
                  .map((q) => `<div>${q.t === 'in' ? esc(q.q).replace('___', `<b>${esc(q.a[0])}</b>`) : `${esc(questionText(q))} → <b>${esc(answerText(q))}</b>`}</div>`)
                  .join('')}</div>`
              : ''
          }
          <div class="btns">
            ${next ? `<button class="btn primary block" data-ta="nextflix" data-id="${next.id}">${ic('play', 'fill')} ${t('nextFlix')}: ${esc(next.title)}</button>` : ''}
            <button class="btn block ${next ? '' : 'primary'}" data-ta="retake">${ic('rotate')} ${t('retake')}</button>
            <button class="btn block" data-ta="rewatch">${ic('clapper')} ${t('rewatch')}</button>
            <button class="btn block" data-ta="feed">${t('toFeed')}</button>
          </div>
        </div></div>`;
      scrollTo(0, 0);
    }

    const actions = {
      pick,
      hint,
      next() {
        if (!answered) return;
        if (++i < n) show();
        else result();
      },
      close: LU.back,
      retake: reset,
      rewatch: () => LU.go(`play/${m.id}`, true),
      nextflix: (el) => LU.go(`play/${el.dataset.id}`, true),
      feed: () => LU.go('flix'),
    };
    const onClick = (e) => {
      const b = e.target.closest('[data-ta]');
      if (b) actions[b.dataset.ta]?.(b);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      checkTyped();
    };
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    reset();
    return () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('submit', onSubmit);
    };
  };
