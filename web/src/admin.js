// Admin screen chunk (loaded only for admins). Numbers arrive over one live stream; the user list is
// paged by cursor. Every request carries the signed Telegram launch data; the server checks ADMIN_IDS.
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const money = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/\s/g, ' ');

export default (LU) =>
  function mountAdmin(main) {
    const { esc, haptic, toast, authHeaders, LEVELS } = LU;
    const levelName = (id) => LEVELS.find((l) => l.id === id)?.name || '—';
    let alive = true;
    let level = '';
    let q = '';
    let next = null;
    const ctrl = new AbortController();

    main.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center"><h2>Statistika</h2><span class="live" id="live"><i></i>jonli</span></div>
      <div class="adm-grid" style="margin-top:12px" id="cards"></div>
      <h3 class="section-title">Darajalar bo'yicha</h3>
      <div class="card" id="levels"></div>
      <h3 class="section-title">Foydalanuvchilar</h3>
      <label class="search"><input id="uq" placeholder="Ism, @username, telefon yoki ID"></label>
      <div class="chips" style="margin-top:10px" id="lf"></div>
      <div class="list" id="ul"></div>
      <button class="btn block" style="margin-top:12px" id="more" hidden>Ko'proq</button>`;
    const $ = (id) => document.getElementById(id);

    function drawSummary(s) {
      const u = s.users;
      const card = (v, label) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
      $('cards').innerHTML =
        card(u.registered, "Ro'yxatdan o'tgan") + card(u.today, 'Bugun') + card(u.last7d, '7 kun') +
        card(u.last30d, '30 kun') + card(u.active7d, '7 kunda faol') + card(u.blocked, 'Bloklagan') +
        card(money(s.donations.confirmed), "Donat, so'm") + card(s.donations.pending, 'Kutilayotgan donat') + card(u.total - u.registered, 'Raqamsiz');
      const row = (name, count, pct) => `<div class="lvl"><span>${esc(name)}</span><div class="bar"><i style="width:${pct}%"></i></div><span><b>${pct}%</b> · ${count}</span></div>`;
      $('levels').innerHTML = s.levels.map((l) => row(`${l.code} ${l.name}`, l.count, l.pct)).join('') + row('Tanlanmagan', s.noLevel.count, s.noLevel.pct);
    }

    const userRow = (u, fresh) => `<div class="urow ${fresh ? 'fresh' : ''}">
      <b>${esc(u.name || '—')}${u.username ? ` <span class="muted">@${esc(u.username)}</span>` : ''}</b><span class="tag">${esc(levelName(u.level))}</span>
      <span class="muted">${esc(u.phone || '')} · ID ${u.id} · ${u.lang || ''}</span><span class="muted">${fmtDate(u.joinedAt)}</span>
      <span class="muted">🎬 ${u.watched} · 🎯 ${u.tests} (${Math.round(u.avg)}%) · 📚 ${u.words}${u.blocked ? ' · 🚫' : ''}</span><span class="muted">${u.lastSeen ? `faol: ${fmtDate(u.lastSeen)}` : ''}</span></div>`;

    async function get(url) {
      const r = await fetch(url, { headers: authHeaders(), signal: ctrl.signal });
      if (r.status === 401 || r.status === 403) throw new Error(r.status === 403 ? "Siz ADMIN_IDS ro'yxatida yo'qsiz" : 'Telegram orqali oching');
      return r.json();
    }
    async function loadUsers(reset) {
      if (reset) next = null;
      const p = new URLSearchParams({ limit: '50' });
      if (next) p.set('before', String(next));
      if (level) p.set('level', level);
      if (q) p.set('q', q);
      try {
        const r = await get(`api/admin/users?${p}`);
        if (!alive) return;
        const html = r.items.map((u) => userRow(u)).join('');
        if (reset) $('ul').innerHTML = html || '<div class="card empty">Topilmadi</div>';
        else $('ul').insertAdjacentHTML('beforeend', html);
        next = r.next;
        $('more').hidden = !next;
      } catch (e) {
        if (alive && e.name !== 'AbortError') $('ul').innerHTML = `<div class="card empty">${esc(e.message)}</div>`;
      }
    }

    // live stream: summary on connect and on every change, each new registration as it happens
    async function stream() {
      while (alive) {
        try {
          const r = await fetch('api/admin/events', { headers: authHeaders(), signal: ctrl.signal });
          if (!r.ok) throw new Error(r.status === 403 ? "Siz ADMIN_IDS ro'yxatida yo'qsiz" : 'Telegram orqali oching');
          $('live').classList.add('on');
          const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const ev = block.match(/^event: (.+)$/m)?.[1];
              const data = block.match(/^data: (.+)$/m)?.[1];
              if (!ev || !data) continue;
              if (ev === 'summary') drawSummary(JSON.parse(data));
              if (ev === 'user') {
                const u = JSON.parse(data);
                haptic('success');
                toast(`🆕 ${u.name}`);
                if (!q && !level) $('ul').insertAdjacentHTML('afterbegin', userRow(u, true));
              }
            }
          }
        } catch (e) {
          if (!alive || e.name === 'AbortError') return;
          $('cards').innerHTML ||= `<div class="card empty" style="grid-column:1/-1">${esc(e.message)}</div>`;
        }
        $('live').classList.remove('on');
        await new Promise((r) => setTimeout(r, 3000)); // reconnect
      }
    }

    $('lf').innerHTML = [['', 'Hammasi'], ...LEVELS.map((l) => [l.id, l.name]), ['none', 'Tanlanmagan']]
      .map(([v, label]) => `<button class="chip ${v === level ? 'on' : ''}" data-lv="${v}">${label}</button>`)
      .join('');
    $('lf').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lv]');
      if (!b) return;
      level = b.dataset.lv;
      $('lf').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      void loadUsers(true);
    });
    let typing = 0;
    $('uq').addEventListener('input', (e) => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        q = e.target.value.trim();
        void loadUsers(true);
      }, 250);
    });
    $('more').addEventListener('click', () => void loadUsers(false));

    void stream();
    void loadUsers(true);
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(typing);
    };
  };
