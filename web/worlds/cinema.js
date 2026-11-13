// Кинотеатр — a real hall for watching a film together: screenings, tickets, a seat map, and a 3D auditorium where
// every taken seat holds not a person but a frame with that viewer's camera.
// viton13.com keeps the screening (server/worlds/cinema.mjs → site /api/rtc/*, kind «cinema»); the film and the cameras
// go straight between the devices (web/worlds/rtc.js). The host leads the film; everyone else follows its clock.
import { createMesh, fakeMedia } from '/worlds/rtc.js';
// the hall on its own: the same calls as the mesh, nobody on the other end
const soloMesh = () => ({ peers: new Map(), setVideoLimit() {}, start() {}, send() {}, broadcast() {}, localTime: (_p, at) => at, addStream() {}, removeStream() {}, leave() {} });
import { emojiPicker } from '/worlds/emoji.js';
import { parseFilmLink, fileName } from '/worlds/cinema-links.js';

const SVG = (d) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  film: SVG('<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10 9.5v5l4.3-2.5z" fill="currentColor"/>'),
  ticket: SVG('<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6v12" stroke-dasharray="1.6 2"/>'),
  mic: SVG('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>'),
  cam: SVG('<rect x="3.5" y="6.5" width="12.5" height="11" rx="3"/><path d="M16 10.5l4.5-2.6v8.2L16 13.5"/>'),
  camOff: SVG('<rect x="3.5" y="6.5" width="12.5" height="11" rx="3"/><path d="M16 10.5l4.5-2.6v8.2L16 13.5M3 4l17 16"/>'),
  play: SVG('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  pause: SVG('<path d="M8 5.5h2.6v13H8zM13.4 5.5H16v13h-2.6z" fill="currentColor"/>'),
  screen: SVG('<rect x="3.5" y="4.5" width="17" height="12" rx="2.5"/><path d="M9 20h6M12 16.5V20"/>'),
  chat: SVG('<path d="M4.5 6.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-6.2L6.5 19.5V16a2.5 2.5 0 0 1-2-2.5z"/>'),
  react: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M8.6 13.8a4.2 4.2 0 0 0 6.8 0"/><circle cx="9.4" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10" r=".9" fill="currentColor" stroke="none"/>'),
  sync: SVG('<path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6M18 3.8v3.8h-3.8M6 20.2v-3.8h3.8"/>'),
  vol: SVG('<path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  copy: SVG('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  close: SVG('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  back: SVG('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  yt: SVG('<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor" stroke="none"/>'),
  globe: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z"/>'),
  link: SVG('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  mac: SVG('<rect x="5" y="5.5" width="14" height="9.5" rx="1.8"/><path d="M3 18.5h18"/>'),
};
// where a film comes from: a small mark and one line on what goes in sync by itself
const SOURCES = {
  youtube: { icon: 'yt', label: 'YouTube', hint: 'Пуск, пауза, перемотка и скорость — сами у всех. Идёт плоским окном поверх зала.' },
  video: { icon: 'link', label: 'Ссылка на файл', hint: 'Пуск, пауза, перемотка и скорость — сами у всех, на объёмном экране зала.' },
  site: { icon: 'globe', label: 'Сайт', hint: 'В приложении пуск, пауза и перемотка общие, если сайт даёт управлять плеером; если нет — старт по общему отсчёту 3…2…1.' },
  file: { icon: 'mac', label: 'Файл с Mac', hint: 'Идёт с Mac ведущего живым потоком: его пауза и перемотка — сразу у всех.' },
  screen: { icon: 'screen', label: 'Показ экрана', hint: 'Ведущий показывает свой экран со звуком — зрители видят всё, что он включит.' },
};
const FILE_NOTE = 'Файл не загружается никуда — он идёт с вашего Mac прямо зрителям, пока сеанс открыт (комфортно до 5–6 зрителей)';
const FILE_ACCEPT = 'video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska,.mp4,.webm,.mov,.m4v,.mkv';
const SITE_HINT = 'Сайт не даёт управлять плеером — нажмите ▶ одновременно по отсчёту';
const inApp = /Electron/.test(navigator.userAgent);
const canHls = () => { try { return !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'); } catch { return false; } };
function filmInfo(film = {}) {
  const base = SOURCES[film.kind] || SOURCES.video;
  if (film.kind === 'site') { const r = parseFilmLink(film.src); return { ...base, detail: r.error ? '' : r.name }; }
  if (film.kind === 'file') return { ...base, detail: film.src || '' };
  return { ...base, detail: '' };
}
const ROWS = 'АБВГДЕЖЗ';
const REACTIONS = ['👏', '😂', '😮', '❤️', '🔥', '😭', '🍿', '👍'];
const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const seatId = (r, n) => `R${r}S${n}`;
const parseSeat = (id) => { const m = /^R(\d+)S(\d+)$/.exec(String(id || '')); return m ? { row: +m[1], num: +m[2] } : null; };
const seatName = (id) => { const p = parseSeat(id); return p ? `ряд ${ROWS[p.row - 1]}, место ${p.num}` : ''; };
const seatShort = (id) => { const p = parseSeat(id); return p ? `${ROWS[p.row - 1]}${p.num}` : ''; };
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const hue = (s) => { let x = 0; for (const c of String(s || '')) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const when = (iso) => { const d = new Date(iso); return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ', ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); };
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const filmUrl = (src) => '/api/cinema/film?u=' + encodeURIComponent(src);
const ticketText = (room, t) => `VITON13 · Кинотеатр — «${room.title}», ${when(room.screening.startsAt)}. Билет: ${t.code}${t.seat ? ` (${seatName(t.seat)})` : ''}. Откройте «Кинотеатр» в приложении VITON13 и введите код билета.`;

export default function view(ctx, arg) {
  const { h, api, toast, css } = ctx;
  css('/worlds/cinema.css');
  const plan = ctx.plan || 'guest';
  const fake = new URLSearchParams(location.search).get('fake') === '1' || store.get('vit.meet.fake') === '1';
  const win = h('div', { class: 'cn-win' }), root = h('div', { class: 'view cn' }, win);
  const ic = (name) => h('span', { class: 'cn-i', html: I[name] });
  const mark = (film, detail = true) => { const f = filmInfo(film); return h('span', { class: 'cn-src', title: f.hint }, h('span', { class: 'cn-src-ic', html: I[f.icon] }), h('b', null, f.label), detail && f.detail ? h('small', null, f.detail) : null); };
  const picked = new Map();                                                           // screening code → the File the host chose on this Mac (never uploaded)
  let alive = true, ST = null, hall = null, refresh = null;

  function quiet(title, text, ...actions) {
    win.className = 'cn-win cn-solo'; refresh = null;
    win.replaceChildren(h('div', { class: 'cn-quiet' }, h('span', { class: 'cn-quiet-ic', html: I.film }), h('h2', null, title), h('p', null, text), actions.length ? h('div', { class: 'cn-acts' }, actions) : null));
  }
  if (plan === 'guest') {
    quiet('Кинотеатр — с VITON ID', 'Настоящий зал с местами и билетами: вы выбираете кресло, а на соседних сидят не люди, а живые рамки с камерами друзей. Войдите через VITON ID, чтобы начать.',
      h('button', { class: 'btn', onclick: () => ctx.upgrade?.('cinema') }, 'Что входит'));
    return { root, destroy() { alive = false; } };
  }

  boot();
  async function boot() {
    win.className = 'cn-win cn-solo'; win.replaceChildren(h('div', { class: 'cn-loading' }, h('i'), h('i'), h('i')));
    try { ST = await api('/api/cinema/status'); }
    catch (e) { return quiet('Кинотеатр недоступен', e.message || 'Попробуйте ещё раз.', h('button', { class: 'btn', onclick: boot }, 'Повторить')); }
    if (!alive) return;
    if (ST.mode === 'none') return quiet('Кинотеатр — в окне VITON13', 'Сеансы идут через ваш VITON ID на viton13.com — это работает в приложении VITON13, а не в обычном браузере.');
    if (ST.mismatch) return quiet('Другой аккаунт на viton13.com', `На сайте выполнен вход как ${ST.siteEmail}, а в приложении — ${ST.email}. Войдите на сайте тем же VITON ID в Сообщениях.`, h('button', { class: 'btn', onclick: () => ctx.go('messages') }, 'Открыть Сообщения'));
    if (!ST.connected) return quiet('Подключите viton13.com', 'Сеансы и билеты хранятся в вашем VITON ID на viton13.com — тот же вход, что в Сообщениях. Подключите его один раз.', h('button', { class: 'btn', onclick: () => ctx.go('messages') }, 'Подключить в Сообщениях'), h('button', { class: 'btn ghost', onclick: boot }, 'Я подключил'));
    if (arg?.ticket) return redeem(arg.ticket);
    if (arg?.code) return openScreening(arg.code);
    home();
  }
  function siteMissing(e) {
    if (e?.code !== 'no_cinema') return false;
    quiet('Сеансы для зрителей — после обновления сайта', 'Билеты, места и соединение зрителей хранятся на viton13.com — сайту нужно обновление. А сам зал уже работает: зайдите в него один, со своей камерой и фильмом.',
      h('button', { class: 'btn', onclick: () => rehearsal() }, 'Открыть зал'), h('button', { class: 'btn ghost', onclick: boot }, 'Проверить снова'));
    return true;
  }
  const fail = (e) => siteMissing(e) || toast(e.message);

  // ── home: my screenings and my tickets ───────────────────────────────────
  async function home() {
    win.className = 'cn-win cn-solo';
    const ticketIn = h('input', { class: 'cn-input cn-ticket-in', placeholder: 'Код билета, например K7MPQ2-8FHX', maxlength: 14, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Код билета' });
    ticketIn.addEventListener('input', () => { const v = ticketIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); ticketIn.value = v.length > 6 ? v.slice(0, 6) + '-' + v.slice(6) : v; });
    ticketIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') redeem(ticketIn.value); });
    const lists = h('div', { class: 'cn-lists' }, h('div', { class: 'cn-loading' }, h('i'), h('i'), h('i')));
    win.replaceChildren(h('div', { class: 'cn-home' },
      h('div', { class: 'cn-hero' }, h('span', { class: 'cn-kicker' }, 'VITON13 · Кинотеатр'), h('h1', null, 'Кино вместе — как в зале'),
        h('p', null, 'Создайте сеанс, раздайте билеты и выберите места. В зале на креслах — живые рамки с камерами зрителей, фильм идёт у всех одновременно.'),
        h('div', { class: 'cn-hero-acts' }, h('button', { class: 'btn lg', onclick: () => (plan === 'vit' ? editor() : ctx.upgrade?.('cinema-host')) }, plan === 'vit' ? 'Новый сеанс' : 'Новый сеанс · VIT'),
          h('div', { class: 'cn-redeem' }, ticketIn, h('button', { class: 'btn ghost', onclick: () => redeem(ticketIn.value) }, 'Войти по билету')))),
      lists, h('p', { class: 'cn-fine' }, 'Фильм и камеры идут напрямую между зрителями. Показывайте фильмы, на которые у вас есть права.')));
    refresh = home;
    try {
      const d = await api('/api/cinema/mine'); if (!alive || !lists.isConnected) return;
      const card = (r, host) => h('button', { class: 'cn-show' + (r.screening.cancelled ? ' off' : ''), onclick: () => (host ? hostView(r.code) : ticketView(r)) },
        h('span', { class: 'cn-show-poster', style: `--h:${hue(r.code)}` }, ic('film')),
        h('span', { class: 'cn-show-t' }, h('b', null, r.title), mark(r.screening.film, false), h('small', null, r.screening.cancelled ? 'Сеанс отменён' : when(r.screening.startsAt)),
          h('small', { class: 'cn-show-sub' }, host ? `Вы ведёте · ${r.viewers} из ${r.max - 1} зрителей` : r.you.seat ? `Ваше место: ${seatName(r.you.seat)}` : 'Билет есть — выберите место')));
      lists.replaceChildren(
        h('section', null, h('h3', null, 'Мои сеансы'), d.hosting.length ? h('div', { class: 'cn-shows' }, d.hosting.map((r) => card(r, true))) : h('p', { class: 'cn-empty' }, 'Вы ещё не создали сеанс.')),
        h('section', null, h('h3', null, 'Мои билеты'), d.tickets.length ? h('div', { class: 'cn-shows' }, d.tickets.map((r) => card(r, false))) : h('p', { class: 'cn-empty' }, 'Билетов пока нет. Код билета пришлёт тот, кто ведёт сеанс.')));
    } catch (e) { if (!siteMissing(e)) lists.replaceChildren(h('p', { class: 'cn-empty' }, e.message)); }
  }
  async function redeem(code) {
    const v = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length !== 10) return toast('Код билета — десять знаков');
    try { const d = await api('/api/cinema/redeem', { body: { ticket: v } }); ticketView(d.room); } catch (e) { fail(e); }
  }
  async function openScreening(code) {
    try { const d = await api('/api/cinema/screenings/' + code); d.room.you.host ? hostView(code, d.room) : ticketView(d.room); } catch (e) { fail(e); }
  }

  // ── a screening: create / edit ───────────────────────────────────────────
  function editor(room) {
    const s = room?.screening || { title: '', film: { kind: 'video', src: '' }, startsAt: new Date(Date.now() + 3600e3).toISOString(), rows: 5, cols: 10, seating: 'open', note: '' };
    const local = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    const title = h('input', { class: 'cn-input', value: s.title, maxlength: 80, placeholder: 'Например, «Интерстеллар» в пятницу', 'aria-label': 'Название сеанса' });
    let seating = s.seating, source = s.film.kind === 'file' ? 'file' : s.film.kind === 'screen' ? 'screen' : 'link', film = { ...s.film }, file = room ? picked.get(room.code) || null : null, linkErr = '';
    const src = h('input', { class: 'cn-input', value: source === 'link' ? s.film.src : '', placeholder: 'Ссылка на фильм или серию — YouTube, Rutube, VK Видео, Vimeo, OK, .mp4…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Ссылка на фильм или серию' });
    const fileIn = h('input', { type: 'file', accept: FILE_ACCEPT, hidden: true });
    const fileRow = h('div', { class: 'cn-file-row' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => fileIn.click() }, 'Выбрать файл с Mac'), fileIn);
    const kindNote = h('div', { class: 'cn-src-line' });
    fileIn.onchange = () => { const f = fileIn.files?.[0]; if (f) { file = f; paintKind(); } };
    src.addEventListener('input', () => paintKind());
    const time = h('input', { class: 'cn-input', type: 'datetime-local', value: local(s.startsAt), 'aria-label': 'Начало' });
    const rows = h('select', { class: 'cn-input' }, [3, 4, 5, 6, 7, 8].map((n) => h('option', { value: n, selected: n === s.rows }, `${n} рядов`.replace('3 рядов', '3 ряда').replace('4 рядов', '4 ряда')))),
      cols = h('select', { class: 'cn-input' }, [6, 7, 8, 9, 10, 11, 12].map((n) => h('option', { value: n, selected: n === s.cols }, `${n} мест в ряду`)));
    const count = h('input', { class: 'cn-input', type: 'number', min: 1, max: 30, value: 6, 'aria-label': 'Сколько билетов' });
    const shared = h('input', { type: 'checkbox' });
    const sharedRow = h('label', { class: 'cn-check' + (seating === 'assigned' ? ' hide' : '') }, shared, h('span', null, 'Один общий код на всех (до 11 человек)'));
    const preview = h('div', { class: 'cn-mini' });
    const seg = (items, cur, on) => { const box = h('div', { class: 'cn-seg' }); const paint = (v) => box.replaceChildren(...items.map(([id, t]) => h('button', { type: 'button', class: id === v ? 'on' : '', onclick: () => { on(id); paint(id); } }, t))); paint(cur); return box; };
    // one field: what the link is, is recognised as it is pasted
    function paintKind() {
      src.classList.toggle('hide', source !== 'link'); fileRow.classList.toggle('hide', source !== 'file'); linkErr = '';
      const hint = (text, cls = '') => h('small', { class: 'cn-hint ' + cls }, text);
      if (source === 'screen') { film = { kind: 'screen', src: '' }; return kindNote.replaceChildren(mark(film), hint('Вы показываете свой экран со звуком: подходит для любого источника. Нагрузка на ваш интернет растёт с числом зрителей — лучше до 5–6 человек.')); }
      if (source === 'file') {
        film = { kind: 'file', src: file ? fileName(file.name) : s.film.kind === 'file' ? s.film.src : '' };
        return kindNote.replaceChildren(...(film.src ? [mark(film)] : []), hint(FILE_NOTE + '.'), hint(file || !film.src ? 'Ваша пауза и перемотка — сразу у всех.' : 'Перед показом выберите этот файл ещё раз — в сеансе хранится только его имя.'));
      }
      const v = src.value.trim();
      if (!v) { film = { kind: 'video', src: '' }; return kindNote.replaceChildren(hint('Вставьте ссылку — вид определится сам: YouTube, сайт с плеером (Rutube, VK Видео, Vimeo, Dailymotion, OK и любой другой) или прямая ссылка на файл .mp4 / .webm.')); }
      const r = parseFilmLink(v, { hls: canHls() });
      if (r.error) { linkErr = r.message; film = { kind: 'video', src: '' }; return kindNote.replaceChildren(hint(r.message, 'err')); }
      film = { kind: r.kind, src: r.src };
      kindNote.replaceChildren(mark(film), hint(SOURCES[r.kind].hint), r.kind === 'site' && !r.embed ? hint('Откроется страница сайта целиком — в плеер на ней нужно будет нажать самому.') : null);
    }
    const paintMini = () => { const R = +rows.value, C = +cols.value, half = Math.floor(C / 2); preview.replaceChildren(h('i', { class: 'cn-mini-screen' }), ...Array.from({ length: R }, () => h('div', { class: 'cn-mini-row' }, Array.from({ length: C }, (_, i) => h('b', { class: i === half ? 'gap' : '' }))))); };
    rows.onchange = paintMini; cols.onchange = paintMini;
    const save = h('button', { class: 'btn lg', onclick: async () => {
      paintKind();
      if (source === 'link' && !film.src) return toast(linkErr || 'Вставьте ссылку на фильм или серию');
      if (source === 'file' && !film.src) return toast('Выберите файл с Mac');
      save.disabled = true;
      const screening = { title: title.value, film: { ...film }, startsAt: new Date(time.value).toISOString(), rows: +rows.value, cols: +cols.value, seating };
      try {
        if (room) { await api('/api/cinema/screenings/' + room.code, { method: 'PATCH', body: screening }); if (file && source === 'file') picked.set(room.code, file); hostView(room.code); toast('Сеанс обновлён'); }
        else {
          const n = Math.max(1, Math.min(+count.value || 1, 30));
          const tickets = seating === 'assigned' ? { count: 0, seats: bestSeats(+rows.value, +cols.value, n) } : shared.checked ? { count: 1, uses: Math.min(n, 11) } : { count: n };
          const d = await api('/api/cinema/screenings', { body: { screening, tickets } }); if (file && source === 'file') picked.set(d.room.code, file); hostView(d.room.code, d.room); toast('Сеанс создан — билеты готовы');
        }
      } catch (e) { save.disabled = false; fail(e); } } }, room ? 'Сохранить' : 'Создать сеанс и билеты');
    win.className = 'cn-win cn-solo';
    win.replaceChildren(h('div', { class: 'cn-editor' },
      h('button', { class: 'cn-back', onclick: () => (room ? hostView(room.code) : home()) }, ic('back'), room ? 'Сеанс' : 'Кинотеатр'),
      h('h2', null, room ? 'Настройки сеанса' : 'Новый сеанс'),
      h('div', { class: 'cn-form' },
        h('label', null, h('span', null, 'Название'), title),
        h('div', { class: 'cn-field' }, h('span', null, 'Фильм или серия'), seg([['link', 'Ссылка'], ['file', 'Файл с Mac'], ['screen', 'Показ экрана']], source, (v) => { source = v; paintKind(); if (v === 'link') src.focus(); }), src, fileRow, kindNote),
        h('label', null, h('span', null, 'Начало'), time),
        h('div', { class: 'cn-two' }, h('label', null, h('span', null, 'Зал'), rows), h('label', null, h('span', null, ' '), cols)),
        preview,
        h('label', null, h('span', null, 'Рассадка'), seg([['open', 'Свободная — зритель выбирает сам'], ['assigned', 'По местам — место в билете']], seating, (v) => { seating = v; sharedRow.classList.toggle('hide', v === 'assigned'); })),
        room ? null : h('label', null, h('span', null, 'Билеты'), count, h('small', { class: 'cn-hint' }, 'В зале до 12 человек вместе с вами: каждый зритель отправляет свою камеру всем остальным напрямую, и больше обычный домашний интернет не потянет.')),
        room ? null : sharedRow,
        save, room ? h('button', { class: 'btn ghost danger', onclick: async () => { if (!confirm('Отменить сеанс? Билеты перестанут действовать.')) return; try { await api('/api/cinema/screenings/' + room.code, { method: 'PATCH', body: { ...s, cancelled: true } }); toast('Сеанс отменён'); home(); } catch (e) { fail(e); } } }, 'Отменить сеанс') : null)));
    paintKind(); paintMini();
  }
  function bestSeats(R, C, n) {                                                       // the seats people want first: two-thirds back, the middle
    const all = []; for (let r = 1; r <= R; r++) for (let c = 1; c <= C; c++) all.push([seatId(r, c), Math.abs(r - (R * 0.62 + 0.5)) * 1.3 + Math.abs(c - (C + 1) / 2)]);
    return all.sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
  }

  // ── the seat map, as on a cinema's site ──────────────────────────────────
  function seatMap(room, { mode, picked, onPick }) {
    const s = room.screening, half = Math.floor(s.cols / 2), reserved = new Set(room.reserved || []);
    const box = h('div', { class: 'cn-map' + (mode === 'host' ? ' host' : '') }, h('div', { class: 'cn-map-screen' }, h('i'), h('span', null, 'Экран')));
    for (let r = 1; r <= s.rows; r++) {
      const row = h('div', { class: 'cn-map-row' }, h('span', { class: 'cn-map-l' }, ROWS[r - 1]));
      for (let c = 1; c <= s.cols; c++) {
        const id = seatId(r, c), who = room.seats[id], mine = who && who.uid === ST.me?.id, sel = picked?.has?.(id) || picked === id;
        const myTicket = room.you.ticketSeat === id, lock = mode === 'pick' && !who && !room.you.host && (s.seating === 'assigned' ? room.you.ticketSeat && !myTicket : reserved.has(id) && !myTicket);
        const cls = mine ? 'mine' : who ? 'taken' : lock ? 'lock' : reserved.has(id) && mode === 'host' ? 'res' : 'free';
        const b = h('button', { class: `cn-seat ${cls}${sel ? ' sel' : ''}${c === half + 1 ? ' aisle' : ''}`, title: who ? `${seatName(id)} — ${who.name || 'зритель'}` : seatName(id), 'aria-label': seatName(id),
          disabled: mode === 'pick' && ((who && !mine) || lock), onclick: () => onPick?.(id, who) }, h('span', null, String(c)));
        if (who) b.append(h('em', { style: `--h:${hue(who.uid)}` }, initials(who.name)));
        row.append(b);
      }
      row.append(h('span', { class: 'cn-map-l' }, ROWS[r - 1])); box.append(row);
    }
    box.append(h('div', { class: 'cn-legend' }, h('span', null, h('b', { class: 'cn-seat free' }), 'Свободно'), h('span', null, h('b', { class: 'cn-seat taken' }), 'Занято'), h('span', null, h('b', { class: 'cn-seat mine' }), 'Ваше'),
      mode === 'host' ? h('span', null, h('b', { class: 'cn-seat res' }), 'По билету') : h('span', null, h('b', { class: 'cn-seat lock' }), 'Недоступно')));
    return box;
  }

  // ── the host's screen: tickets, who sits where ───────────────────────────
  async function hostView(code, room) {
    try { room ||= (await api('/api/cinema/screenings/' + code)).room; } catch (e) { return fail(e); }
    if (!alive) return; win.className = 'cn-win cn-solo'; refresh = () => hostView(code);
    const s = room.screening, picked = new Set();
    const copy = (text, what) => navigator.clipboard?.writeText(text).then(() => toast(what + ' скопирован')).catch(() => toast(text));
    const mapBox = h('div');
    const paintMap = () => mapBox.replaceChildren(seatMap(room, { mode: 'host', picked, onPick: (id, who) => {
      if (who) { if (who.uid !== ST.me?.id && confirm(`Попросить ${who.name || 'зрителя'} выйти из зала? Вернуться по этому билету не получится.`)) act(`/kick`, { uid: who.uid }); return; }
      if (s.seating !== 'assigned') return toast('В свободной рассадке зритель выбирает место сам');
      picked.has(id) ? picked.delete(id) : picked.add(id); paintMap(); paintIssue(); } }));
    async function act(path, body, method = 'POST') { try { const d = await api(`/api/cinema/screenings/${code}${path}`, { method, body }); room = d.room; picked.clear(); paint(); return d; } catch (e) { fail(e); } }
    const issue = h('div', { class: 'cn-issue' });
    const paintIssue = () => {
      if (s.seating === 'assigned') issue.replaceChildren(h('small', null, picked.size ? `Выбрано мест: ${picked.size}` : 'Отметьте свободные места на схеме — на каждое будет свой билет.'), h('button', { class: 'btn sm', disabled: !picked.size, onclick: () => act('/tickets', { seats: [...picked] }) }, 'Билеты на выбранные места'));
      else { const n = h('input', { class: 'cn-input sm', type: 'number', min: 1, max: 30, value: 2, 'aria-label': 'Сколько билетов' }); issue.replaceChildren(n, h('button', { class: 'btn sm', onclick: () => act('/tickets', { count: +n.value || 1 }) }, 'Выпустить билеты')); }
    };
    const list = h('div', { class: 'cn-tickets' });
    function paint() {
      paintMap(); paintIssue();
      list.replaceChildren(...(room.tickets.length ? room.tickets.map((t) => h('div', { class: 'cn-tk' + (t.used.length >= t.uses ? ' used' : '') },
        h('span', { class: 'cn-tk-code' }, t.code), h('span', { class: 'cn-tk-seat' }, t.seat ? seatName(t.seat) : t.uses > 1 ? `общий · ${t.used.length} из ${t.uses}` : 'свободная рассадка'),
        h('span', { class: 'cn-tk-who' }, t.used.length ? t.used.map((u) => u.name || 'зритель').join(', ') : 'не использован'),
        h('button', { class: 'cn-ctl sm', title: 'Скопировать билет', 'aria-label': 'Скопировать билет', onclick: () => copy(ticketText(room, t), 'Билет') }, ic('copy')),
        h('button', { class: 'cn-ctl sm', title: 'Отозвать билет', 'aria-label': 'Отозвать билет', onclick: () => { if (confirm('Отозвать билет? Кто вошёл по нему, выйдет из зала.')) act('/tickets/' + t.key, undefined, 'DELETE'); } }, ic('close'))))
        : [h('p', { class: 'cn-empty' }, 'Билетов нет.')]));
    }
    win.replaceChildren(h('div', { class: 'cn-host' },
      h('div', { class: 'cn-host-top' },
        h('button', { class: 'cn-back', onclick: home }, ic('back'), 'Кинотеатр'),
        h('div', { class: 'cn-poster', style: `--h:${hue(code)}` }, h('span', { class: 'cn-kicker' }, s.cancelled ? 'Сеанс отменён' : when(s.startsAt)), h('h2', null, room.title),
          h('div', { class: 'cn-poster-src' }, mark(s.film), h('small', null, filmInfo(s.film).hint)),
          h('small', null, `Зал ${s.rows}×${s.cols} · ${s.seating === 'assigned' ? 'по местам' : 'свободная рассадка'} · код зала ${code}`)),
        h('div', { class: 'cn-acts' }, h('button', { class: 'btn lg', disabled: s.cancelled, onclick: () => (room.you.seat ? enterHall(code) : toast('Сначала выберите своё место на схеме — вы тоже сидите в зале')) }, 'Войти в зал'),
          h('button', { class: 'btn ghost', onclick: () => editor(room) }, 'Настройки'),
          h('button', { class: 'btn ghost', onclick: () => copy(room.tickets.filter((t) => t.used.length < t.uses).map((t) => ticketText(room, t)).join('\n\n'), 'Список билетов') }, 'Скопировать все билеты'))),
      h('div', { class: 'cn-host-body' },
        h('div', { class: 'cn-host-map' }, mapBox, h('div', { class: 'cn-mypick' }, h('small', null, room.you.seat ? `Ваше место: ${seatName(room.you.seat)}` : 'Ваше место в зале:'),
          h('button', { class: 'btn sm ghost', onclick: () => pickOwn() }, room.you.seat ? 'Пересесть' : 'Выбрать'))),
        h('div', { class: 'cn-host-side' }, h('h3', null, 'Билеты'), issue, list))));
    paint();
    function pickOwn() {
      mapBox.replaceChildren(seatMap(room, { mode: 'pick', picked: room.you.seat, onPick: async (id) => { await act('/seat', { seat: id }); hostView(code, room); } }));
      toast('Нажмите на свободное кресло');
    }
  }

  // ── a viewer's ticket: the card, then a seat ─────────────────────────────
  function ticketView(room) {
    win.className = 'cn-win cn-solo'; refresh = () => openScreening(room.code);
    const s = room.screening; let choice = room.you.seat || (s.seating === 'assigned' ? room.you.ticketSeat : null);
    const go = h('button', { class: 'btn lg', onclick: async () => {
      if (!choice) return toast('Выберите место');
      go.disabled = true;
      try { if (room.you.seat !== choice) room = (await api(`/api/cinema/screenings/${room.code}/seat`, { body: { seat: choice } })).room; await enterHall(room.code); }
      catch (e) { go.disabled = false; fail(e); if (e.status === 409) ticketView((await api('/api/cinema/screenings/' + room.code).catch(() => ({ room }))).room); } } }, 'Войти в зал');
    const seatLine = h('b', { class: 'cn-tc-seat' });
    const paintSeat = () => { seatLine.textContent = choice ? seatName(choice) : 'место — на схеме'; go.disabled = !choice || s.cancelled; };
    const mapBox = h('div');
    const paintMap = () => mapBox.replaceChildren(seatMap(room, { mode: 'pick', picked: choice, onPick: (id) => { choice = id; paintSeat(); paintMap(); } }));
    win.replaceChildren(h('div', { class: 'cn-ticket-view' },
      h('button', { class: 'cn-back', onclick: home }, ic('back'), 'Кинотеатр'),
      h('div', { class: 'cn-tc', style: `--h:${hue(room.code)}` },
        h('div', { class: 'cn-tc-main' }, h('span', { class: 'cn-kicker' }, 'Билет · VITON13 Кинотеатр'), h('h2', null, room.title), h('span', { class: 'cn-tc-when' }, s.cancelled ? 'Сеанс отменён' : when(s.startsAt)),
          h('div', { class: 'cn-poster-src' }, mark(s.film), h('small', null, filmInfo(s.film).hint)),
          h('div', { class: 'cn-tc-grid' }, h('span', null, h('small', null, 'Зал'), h('b', null, room.code)), h('span', null, h('small', null, 'Место'), seatLine), h('span', null, h('small', null, 'Ведёт'), h('b', null, room.hostName || '—')))),
        h('div', { class: 'cn-tc-stub' }, h('span', { class: 'cn-tc-ic', html: I.ticket }), h('small', null, s.seating === 'assigned' ? 'место в билете' : 'свободная рассадка'))),
      h('h3', null, s.seating === 'assigned' && room.you.ticketSeat ? 'Ваше место в зале' : 'Выберите место'), mapBox, go,
      h('p', { class: 'cn-fine' }, 'В зале вашу камеру увидят на вашем кресле. Микрофон выключен — включается кнопкой «Говорить».')));
    paintSeat(); paintMap();
  }

  // ── the hall ─────────────────────────────────────────────────────────────
  // ── the hall on its own: no site, no other viewers — to watch alone or to set everything up ──
  function rehearsal() {
    win.className = 'cn-win cn-solo'; refresh = rehearsal;
    const src = h('input', { class: 'cn-input', placeholder: 'Ссылка на фильм или серию — YouTube, Rutube, VK Видео, Vimeo, .mp4…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Ссылка на фильм или серию' });
    const fileIn = h('input', { type: 'file', accept: FILE_ACCEPT, hidden: true });
    const what = h('div', { class: 'cn-src-line' });
    const paintWhat = () => { const v = src.value.trim(); if (!v) return what.replaceChildren(); const r = parseFilmLink(v, { hls: canHls() });
      what.replaceChildren(...(r.error ? [h('small', { class: 'cn-hint err' }, r.message)] : [mark({ kind: r.kind, src: r.src }), h('small', { class: 'cn-hint' }, SOURCES[r.kind].hint)])); };
    src.addEventListener('input', paintWhat);
    fileIn.onchange = () => { const f = fileIn.files?.[0]; if (f) go('file', f); };
    const go = async (k, file = null) => {
      let film;
      if (k === 'screen') film = { kind: 'screen', src: '' };
      else if (k === 'file') film = { kind: 'file', src: fileName(file.name) };
      else { const r = parseFilmLink(src.value, { hls: canHls() }); if (r.error) return toast(r.message); film = { kind: r.kind, src: r.src }; }
      const me = { id: ST.me?.id || 'me', name: ST.me?.name || 'Вы' }, seat = seatId(4, 6);
      const room = { code: 'SOLO', title: 'Мой зал', hostId: me.id, you: { host: true, seat }, seats: { [seat]: { uid: me.id, name: me.name } },
        screening: { title: 'Мой зал', film, startsAt: new Date().toISOString(), rows: 6, cols: 12, seating: 'open', note: '' } };
      let local = new MediaStream();
      if (fake) local = fakeMedia(me.name, 192);
      else { try { (await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 192 }, height: { ideal: 192 }, frameRate: { ideal: 12, max: 15 }, aspectRatio: 1 } })).getTracks().forEach((t) => local.addTrack(t)); } catch { /* no camera: an avatar on the seat */ } }
      hall?.destroy(); hall = await createHall({ room, me, local, myJoin: new Date().toISOString(), members: [], solo: true, file });
    };
    win.replaceChildren(h('div', { class: 'cn-home' },
      h('div', { class: 'cn-hero' }, h('span', { class: 'cn-kicker' }, 'VITON13 · Кинотеатр'), h('h1', null, 'Мой зал'),
        h('p', null, 'Зал на шесть рядов, вы в центре, на вашем кресле — ваша камера. Зрители смогут прийти по билетам, когда обновится viton13.com.'),
        h('div', { class: 'cn-redeem', style: 'max-width:640px' }, src, h('button', { class: 'btn', onclick: () => go('video') }, 'Смотреть')),
        what,
        h('div', { class: 'cn-hero-acts', style: 'margin-top:12px' }, h('button', { class: 'btn ghost', onclick: () => fileIn.click() }, 'Выбрать файл с Mac'), h('button', { class: 'btn ghost', onclick: () => go('screen') }, 'Показ экрана'), h('button', { class: 'btn ghost', onclick: boot }, 'Назад'), fileIn)),
      h('p', { class: 'cn-fine' }, 'Показывайте фильмы, на которые у вас есть права.')));
    src.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('video'); });
  }

  async function enterHall(code) {
    const room = (await api('/api/cinema/screenings/' + code)).room;
    if (!room.you.seat) throw Object.assign(new Error('Сначала выберите место'), { status: 409 });
    const joined = await api(`/api/cinema/screenings/${code}/presence`, { body: { action: 'join' } });
    const me = { id: joined.me.id, name: joined.me.name || ST.me?.name || 'Вы' };
    const myJoin = joined.members.find((m) => m.id === me.id)?.joinedAt || new Date().toISOString();
    let local;
    if (fake) local = fakeMedia(me.name, 192);
    else {
      local = new MediaStream();
      try { (await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 192 }, height: { ideal: 192 }, frameRate: { ideal: 12, max: 15 }, aspectRatio: 1 } })).getTracks().forEach((t) => local.addTrack(t)); } catch { /* no camera: an avatar on the seat */ }
      try { (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })).getTracks().forEach((t) => local.addTrack(t)); } catch { /* no microphone */ }
    }
    for (const t of local.getAudioTracks()) t.enabled = false;                          // quiet during the film; «Говорить» to speak
    hall?.destroy(); hall = await createHall({ room, me, local, myJoin, members: joined.members });
  }

  async function createHall({ room, me, local, myJoin, members, solo = false, file = null }) {
    const code = room.code, s = room.screening, host = room.you.host, kind = s.film.kind;
    const mine = kind === 'file' && host, streamed = kind === 'screen' || (kind === 'file' && !host);   // a file plays on the host's Mac; viewers get it as a live stream
    let seats = { ...room.seats }, mySeat = room.you.seat, left = false, filmState = null, screenStream = null, castStream = null, fileUrl = '', screenId = null, chatOpen = false, unread = 0;
    const camOn = { v: local.getVideoTracks().length > 0 }, talk = { v: false };
    const viewers = new Map();                                                          // uid → { name, stream, level, cam }
    const seatOf = (uid) => Object.entries(seats).find(([, x]) => x.uid === uid)?.[0];

    // layout
    const stage = h('div', { class: 'cn-stage' }), overlay = h('div', { class: 'cn-overlay' });
    const yt = h('div', { class: 'cn-yt hide' });
    const chatList = h('div', { class: 'cn-chat-list' }), chatIn = h('input', { class: 'cn-input', placeholder: 'Сообщение залу', maxlength: 300, 'aria-label': 'Сообщение залу' });
    const emo = emojiPicker({ h, onPick: (e) => { chatIn.setRangeText(e, chatIn.selectionStart ?? chatIn.value.length, chatIn.selectionEnd ?? chatIn.value.length, 'end'); chatIn.focus(); } });
    const chat = h('aside', { class: 'cn-chat hide' }, h('div', { class: 'cn-chat-top' }, h('b', null, 'Чат зала'), h('button', { class: 'cn-ctl sm', 'aria-label': 'Закрыть чат', onclick: () => toggleChat(false) }, ic('close'))), chatList,
      h('form', { class: 'cn-chat-form', onsubmit: (e) => { e.preventDefault(); sendChat(); } }, emo.el, chatIn, h('button', { class: 'cn-ctl sm ms-emoji', type: 'button', 'aria-label': 'Эмодзи', onclick: () => emo.toggle() }, ic('react'))));
    const seatTag = h('span', { class: 'cn-h-seat' }), countTag = h('span', { class: 'cn-h-n' });
    const top = h('div', { class: 'cn-h-top' }, h('div', { class: 'cn-h-title' }, h('b', null, room.title), h('span', null, seatTag, ' · ', countTag)),
      h('button', { class: 'btn sm ghost cn-leave', onclick: () => leave() }, 'Выйти из зала'));
    const ctl = (name, label, fn, cls = '') => h('button', { class: 'cn-ctl ' + cls, title: label, 'aria-label': label, onclick: fn }, ic(name));
    const talkB = h('button', { class: 'cn-ctl cn-talk', title: 'Удерживайте, чтобы говорить (или клавиша T)', 'aria-label': 'Говорить' }, ic('mic'), h('span', null, 'Говорить'));
    const camB = ctl(camOn.v ? 'cam' : 'camOff', 'Камера', () => setCam(!camOn.v));
    const reactRow = h('div', { class: 'cn-reacts hide' }, REACTIONS.map((e) => h('button', { onclick: () => { react(e); reactRow.classList.add('hide'); } }, e)));
    const reactB = ctl('react', 'Реакция', () => reactRow.classList.toggle('hide'));
    const chatB = ctl('chat', 'Чат', () => toggleChat(!chatOpen));
    const playB = ctl('play', 'Пуск', () => (player?.playing() ? hostPause() : hostPlay()), 'cn-play');
    const seek = h('input', { class: 'cn-seek', type: 'range', min: 0, max: 1000, value: 0, step: 1, 'aria-label': 'Время фильма' });
    const timeL = h('span', { class: 'cn-time' }, '0:00');
    const screenB = ctl('screen', 'Показать экран', () => (screenStream ? stopShare() : share()));
    const syncB = ctl('sync', 'Синхронизировать', () => resync());
    const vol = h('input', { class: 'cn-vol', type: 'range', min: 0, max: 1, step: 0.05, value: store.get('vit.cinema.vol') || '0.9', 'aria-label': 'Громкость' });
    const fileIn = h('input', { type: 'file', accept: FILE_ACCEPT, hidden: true });
    const fileB = ctl('mac', 'Выбрать другой файл с Mac', () => fileIn.click());
    const filmCtl = host ? [kind !== 'screen' ? playB : null, kind !== 'screen' ? seek : null, kind !== 'screen' ? timeL : null, kind === 'screen' ? screenB : null, mine ? fileB : null] : streamed ? [] : [syncB, timeL];
    const bar = h('div', { class: 'cn-bar' }, talkB, camB, h('span', { class: 'cn-react-wrap' }, reactRow, reactB), chatB, h('i', { class: 'cn-sep' }), ...filmCtl, h('span', { class: 'cn-volbox' }, ic('vol'), vol));
    const fine = h('div', { class: 'cn-hfine' }, 'Перетащите, чтобы осмотреться · двойной щелчок по свободному креслу — пересесть');
    // a site whose player can't be reached: everyone presses ▶ on one countdown
    const countB = h('button', { class: 'btn sm', onclick: () => { const at = Date.now() + 3300; mesh.broadcast({ k: 'count', at }); countdown(at); } }, 'Старт для всех через 3…2…1');
    const siteHint = h('div', { class: 'cn-site-hint hide' }, h('div', { class: 'cn-site-row' }, h('span', null, SITE_HINT), host ? countB : null),
      inApp ? null : h('small', null, 'Здесь сайт открыт во встроенной рамке: общий пуск и пауза работают в приложении VITON13. Если рамка пустая — сайт не разрешает показывать себя внутри других страниц.'));
    const countBig = h('div', { class: 'cn-count hide', 'aria-live': 'assertive' });
    const pickBox = h('div', { class: 'cn-pick hide' }, h('span', { class: 'cn-quiet-ic', html: I.mac }), h('b', null, s.film.src ? `«${s.film.src}»` : 'Фильм с вашего Mac'),
      h('span', null, `Выберите этот файл на своём Mac. ${FILE_NOTE}.`), h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Выбрать файл с Mac'));
    win.className = 'cn-win cn-hall'; win.replaceChildren(h('div', { class: 'cn-main' }, stage, yt, overlay, top, siteHint, pickBox, countBig, bar, fine, fileIn), chat);

    // the film element (a texture on the screen), or the host's screen, or YouTube / a player site flat
    const filmV = h('video', { playsinline: true, preload: 'auto', crossorigin: 'anonymous' }); filmV.volume = +vol.value;
    vol.oninput = () => { filmV.volume = +vol.value; store.set('vit.cinema.vol', vol.value); ytp?.setVolume?.(+vol.value * 100); scene3d?.setScreenVolume(+vol.value); };
    let player = null, ytp = null;
    if (mine) { player = filePlayer(filmV); filmV.addEventListener('error', () => { if (filmV.getAttribute('src')) toast('Этот файл здесь не воспроизводится — подойдёт .mp4 (H.264), .webm или .mov'); }); }
    else if (kind === 'video') { filmV.src = /\.m3u8(\?|$)/i.test(s.film.src) ? s.film.src : filmUrl(s.film.src); filmV.addEventListener('error', () => toast('Фильм не открывается по этой ссылке')); player = filePlayer(filmV); }
    else if (kind === 'youtube') { yt.classList.remove('hide'); player = await ytPlayer(yt, s.film.src).catch(() => null); ytp = player; }
    else if (kind === 'site') { yt.classList.remove('hide'); player = sitePlayer(yt, s.film.src, paintReach); ytp = player; player.setVolume(+vol.value * 100); }

    // ── 3D ──
    let scene3d = null;
    try { scene3d = await createScene({ stage, s, seatsRef: () => seats, me, mySeat, filmV: kind === 'video' || mine ? filmV : null, onDoubleSeat: swapSeat }); }
    catch (e) { console.warn('[cinema] 3D off', e); }
    if (!scene3d) stage.append(flatHall());

    // ── the mesh ──
    const mesh = solo ? soloMesh() : createMesh({
      api, base: `/api/cinema/screenings/${code}`, me, local, ice: ST.ice,
      onPeer: (p) => { viewers.set(p.id, { name: p.name, stream: null, cam: true }); paintCount(); },
      onTrack: (p, stream) => {
        if (stream.id === screenId) { scene3d?.setScreenStream(stream); return; }
        const v = viewers.get(p.id) || {}; v.stream = stream; v.name = p.name; viewers.set(p.id, v); scene3d?.setFrame(p.id, stream, v.name); flatFrames();
      },
      onState: (p) => { const v = viewers.get(p.id); if (v && p.name) { v.name = p.name; scene3d?.setName(p.id, p.name); } paintCount(); },
      onGone: (p) => { viewers.delete(p.id); scene3d?.removeFrame(p.id); paintCount(); flatFrames(); if (host) castBitrate(); if (p.id === room.hostId && !left) toast('Ведущий вышел из зала'); },
      onEnd: (why) => { toast(why === 'kicked' ? 'Ведущий попросил вас выйти из зала' : 'Сеанс закончился'); leave(true); },
      onMessage: (p, m) => onMsg(p, m),
    });
    mesh.setVideoLimit(90_000, { fps: 12 });
    mesh.start(members, myJoin);
    scene3d?.setSelf(local, me.name);

    // ── messages between viewers ──
    function onMsg(p, m) {
      if (m.k === 'open') { mesh.send(p.id, { k: 'hi', name: me.name, cam: camOn.v, seat: mySeat }); if (host) { const cast = screenStream || castStream; if (filmState) mesh.send(p.id, stateMsg(false)); if (cast) { mesh.send(p.id, { k: 'screen', id: cast.id }); setTimeout(castBitrate, 2500); } } return; }
      if (m.k === 'count') { if (p.id !== room.hostId || !Number.isFinite(m.at)) return; const at = mesh.localTime(p, m.at); if (Math.abs(at - Date.now()) < 15000) countdown(at); return; }
      if (m.k === 'hi' || m.k === 'state') { const v = viewers.get(p.id) || {}; if (m.name) { v.name = m.name; scene3d?.setName(p.id, m.name); } if ('cam' in m) { v.cam = m.cam; scene3d?.setCam(p.id, m.cam); } viewers.set(p.id, v); if (m.seat) { seats = { ...Object.fromEntries(Object.entries(seats).filter(([, x]) => x.uid !== p.id)), [m.seat]: { uid: p.id, name: v.name || '' } }; scene3d?.reseat(); } return; }
      if (m.k === 'film') return onFilm(p, m);
      if (m.k === 'screen') { screenId = m.id; const st = p.streams.get(m.id); if (st) scene3d?.setScreenStream(st); if (!m.id) scene3d?.setScreenStream(null); return; }
      if (m.k === 'chat') return addChat(p.name || viewers.get(p.id)?.name || 'Зритель', m.text, false);
      if (m.k === 'react') return scene3d ? scene3d.react(p.id, m.e) : null;
      if (m.k === 'talk') { scene3d?.setTalking(p.id, m.on); return; }
      if (m.k === 'film-req' && host && filmState) mesh.send(p.id, stateMsg(false));
    }

    // ── the film clock: the host leads ──
    const stateMsg = (beat) => ({ k: 'film', t: player?.time() || 0, playing: !!player?.playing(), rate: player?.rate() || 1, at: Date.now(), beat, i: player?.index?.() ?? undefined });
    let beatT = null, applying = 0, last = null;
    function hostPlay() { player?.play(); setTimeout(() => { filmState = true; mesh.broadcast(stateMsg(false)); paintPlay(); }, 50); startBeat(); }
    function hostPause() { player?.pause(); setTimeout(() => { mesh.broadcast(stateMsg(false)); paintPlay(); }, 50); }
    function startBeat() { clearInterval(beatT); beatT = setInterval(() => { if (player && host) { filmState = true; mesh.broadcast(stateMsg(true)); } }, 3000); }
    if (host && player) { player.onLocal(() => { if (Date.now() < applying) return; filmState = true; mesh.broadcast(stateMsg(false)); paintPlay(); }); startBeat(); }
    function onFilm(p, m) {
      if (p.id !== room.hostId || !player) return;                                     // only the host's clock counts
      const localAt = mesh.localTime(p, m.at); if (last && localAt < last.localAt) return;
      last = { ...m, localAt }; apply(last, !m.beat);
    }
    function apply(m, hard) {
      const target = m.t + (m.playing ? ((Date.now() - m.localAt) / 1000) * (m.rate || 1) : 0), drift = Math.abs(player.time() - target);
      applying = Date.now() + 700;
      if (Number.isInteger(m.i) && m.i >= 0 && player.index && player.index() >= 0 && player.index() !== m.i) { player.setIndex(m.i); paintPlay(); return; }   // a playlist: the host moved to another episode
      if (Math.abs(player.rate() - (m.rate || 1)) > 0.01) player.setRate(m.rate || 1);
      if (drift > (!m.playing ? 0.04 : hard ? 0.15 : 0.3)) player.seek(target);           // a pause lands on the same frame
      if (m.playing && !player.playing()) player.play(); else if (!m.playing && player.playing()) player.pause();
      paintPlay();
    }
    function resync() { if (last) apply(last, true); mesh.send(room.hostId, { k: 'film-req' }); toast('Синхронизировано с ведущим'); }
    seek.addEventListener('input', () => { if (!player) return; const d = player.duration(); if (d) { player.seek((+seek.value / 1000) * d); } });
    seek.addEventListener('change', () => { mesh.broadcast(stateMsg(false)); });
    function paintPlay() { playB.replaceChildren(ic(player?.playing() ? 'pause' : 'play')); }
    const tick = setInterval(() => { if (!player) return; const d = player.duration(), t = player.time(); timeL.textContent = d ? `${clock(t)} / ${clock(d)}` : clock(t); if (d && document.activeElement !== seek) seek.value = String(Math.round((t / d) * 1000)); scene3d?.setWaiting(!player.playing() && t < 0.5 ? waitingText() : ''); }, 500);
    function waitingText() { const ms = Date.parse(s.startsAt) - Date.now(); if (ms > 60000) return `Начало через ${ms > 3600e3 ? Math.floor(ms / 3600e3) + ' ч ' : ''}${Math.ceil((ms % 3600e3) / 60000)} мин`; return host ? 'Нажмите ▶, когда все соберутся' : 'Ждём, когда ведущий начнёт'; }
    if (kind === 'screen' && !host) scene3d?.setWaiting('Ведущий скоро покажет экран');
    if (kind === 'file' && !host) scene3d?.setWaiting('Ведущий скоро включит фильм со своего Mac');

    // ── screen sharing (film kind «screen») and a file from the host's Mac (kind «file»): one live stream to everyone ──
    const castBps = () => Math.max(600_000, Math.min(2_500_000, 12_000_000 / Math.max(1, mesh.peers.size)));
    function castBitrate() {                                                            // the same rule as screen sharing, kept as people come and go
      const cast = screenStream || castStream; if (!cast) return; const bps = castBps();
      for (const p of mesh.peers.values()) for (const sd of p.senders?.get(cast.id) || []) { if (sd.track?.kind !== 'video') continue; const prm = sd.getParameters(); if (prm.encodings?.length) { prm.encodings[0].maxBitrate = bps; sd.setParameters(prm).catch(() => {}); } }
    }
    async function share() {
      if (!navigator.mediaDevices?.getDisplayMedia) return toast('Показ экрана здесь недоступен');
      try { screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true }); } catch { screenStream = null; return; }
      mesh.broadcast({ k: 'screen', id: screenStream.id });
      mesh.addStream(screenStream, castBps());
      screenStream.getVideoTracks()[0]?.addEventListener('ended', stopShare);
      scene3d?.setScreenStream(screenStream); screenB.classList.add('on');
    }
    function stopShare() { if (!screenStream) return; mesh.removeStream(screenStream); screenStream.getTracks().forEach((t) => t.stop()); mesh.broadcast({ k: 'screen', id: null }); screenStream = null; scene3d?.setScreenStream(null); screenB.classList.remove('on'); }
    // the file plays here in a <video>; viewers get video.captureStream() (picture and sound) — it never leaves this Mac otherwise
    function useFile(f) {
      if (!f || left) return;
      stopCast(); if (fileUrl) URL.revokeObjectURL(fileUrl);
      picked.set(code, f); fileUrl = URL.createObjectURL(f); pickBox.classList.add('hide');
      filmV.addEventListener('loadeddata', startCast, { once: true }); filmV.src = fileUrl;
      if (s.film.src && fileName(f.name) !== s.film.src) toast(`Показываем «${fileName(f.name)}»`);
    }
    function startCast() {
      if (left || castStream) return;
      try { castStream = (filmV.captureStream || filmV.mozCaptureStream).call(filmV); } catch { castStream = null; return toast('Этот файл не получается передать зрителям'); }
      if (!castStream.getTracks().length) { castStream = null; return toast('В файле нет дорожек, которые можно передать'); }
      mesh.broadcast({ k: 'screen', id: castStream.id }); mesh.addStream(castStream, castBps());
    }
    function stopCast() { if (!castStream) return; mesh.removeStream(castStream); castStream.getTracks().forEach((t) => t.stop()); mesh.broadcast({ k: 'screen', id: null }); castStream = null; }
    if (mine) { fileIn.onchange = () => useFile(fileIn.files?.[0]); const f = file || picked.get(code); if (f) useFile(f); else pickBox.classList.remove('hide'); }

    // ── a player site: can we reach its <video>? If not, a shared countdown ──
    let countT = null;
    function paintReach(ok) {
      siteHint.classList.toggle('hide', ok);
      for (const el of [playB, seek, timeL, syncB]) el.classList.toggle('hide', !ok);
    }
    function countdown(at) {
      clearInterval(countT); countBig.classList.remove('hide');
      const step = () => { const ms = at - Date.now(); if (ms <= -1500) { clearInterval(countT); countBig.classList.add('hide'); return; }
        countBig.textContent = ms > 0 ? String(Math.ceil(ms / 1000)) : 'Жмите ▶'; countBig.classList.toggle('go', ms <= 0); };
      step(); countT = setInterval(step, 80);
    }

    // ── talking, camera, chat, reactions ──
    const setTalk = (on) => { if (talk.v === on) return; talk.v = on; for (const t of local.getAudioTracks()) t.enabled = on; talkB.classList.toggle('on', on); mesh.broadcast({ k: 'talk', on }); scene3d?.setTalking(me.id, on); };
    talkB.addEventListener('pointerdown', (e) => { e.preventDefault(); setTalk(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) talkB.addEventListener(ev, () => setTalk(false));
    const keyDown = (e) => { if (e.target.closest?.('input, textarea')) return; if ((e.key === 't' || e.key === 'е') && !e.repeat) setTalk(true); if (e.key === ' ' && host && player) { e.preventDefault(); player.playing() ? hostPause() : hostPlay(); } };
    const keyUp = (e) => { if (e.key === 't' || e.key === 'е') setTalk(false); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
    function setCam(on) { camOn.v = on && local.getVideoTracks().length > 0; for (const t of local.getVideoTracks()) t.enabled = camOn.v; camB.replaceChildren(ic(camOn.v ? 'cam' : 'camOff')); mesh.broadcast({ k: 'state', cam: camOn.v }); }
    function toggleChat(on) { chatOpen = on; chat.classList.toggle('hide', !on); win.classList.toggle('cn-chatting', on); if (on) { unread = 0; chatB.dataset.badge = ''; chatIn.focus(); } }
    function sendChat() { const text = chatIn.value.trim(); if (!text) return; chatIn.value = ''; emo.close(); mesh.broadcast({ k: 'chat', text }); addChat(me.name, text, true); }
    function addChat(who, text, mine) { chatList.append(h('div', { class: 'cn-msg' + (mine ? ' me' : '') }, mine ? null : h('b', null, who), h('span', null, text))); chatList.scrollTop = chatList.scrollHeight; if (!chatOpen && !mine) { unread++; chatB.dataset.badge = String(unread); toast(`${who}: ${text.slice(0, 60)}`); } }
    function react(e) { mesh.broadcast({ k: 'react', e }); scene3d?.react(me.id, e); }
    function paintCount() { seatTag.textContent = mySeat ? seatName(mySeat) : ''; countTag.textContent = `в зале ${mesh?.peers ? mesh.peers.size + 1 : 1} из 12`; }
    paintCount();

    async function swapSeat(id) {
      if (seats[id]) return toast('Это место занято');
      if (solo) { const mine = seats[mySeat]; delete seats[mySeat]; seats[id] = mine; mySeat = id; scene3d?.moveTo(id); paintCount(); return toast('Вы пересели: ' + seatName(id)); }
      try { const d = await api(`/api/cinema/screenings/${code}/seat`, { body: { seat: id } }); seats = d.room.seats; mySeat = id; mesh.broadcast({ k: 'state', seat: id }); scene3d?.moveTo(id); paintCount(); toast('Вы пересели: ' + seatName(id)); }
      catch (e) { toast(e.message); }
    }

    // ── without WebGL: the film and the frames side by side ──
    function flatHall() {
      const box = h('div', { class: 'cn-flat' });
      if (kind === 'video' || mine) { filmV.classList.add('cn-flat-film'); box.append(filmV); }
      box.append(h('div', { class: 'cn-flat-frames' })); return box;
    }
    function flatFrames() {
      const grid = stage.querySelector('.cn-flat-frames'); if (!grid) return;
      grid.replaceChildren(...[...viewers.entries()].map(([uid, v]) => { const vid = h('video', { autoplay: true, playsinline: true }); vid.srcObject = v.stream; return h('div', { class: 'cn-flat-tile' }, vid, h('span', null, `${v.name || 'Зритель'} · ${seatShort(seatOf(uid)) || ''}`)); }));
    }

    const onUnload = () => leave(); window.addEventListener('pagehide', onUnload);
    const onVis = () => scene3d?.paused(document.hidden); document.addEventListener('visibilitychange', onVis);
    function leave(ended) {
      if (left) return; left = true;
      clearInterval(beatT); clearInterval(tick); clearInterval(countT); stopCast(); if (fileUrl) URL.revokeObjectURL(fileUrl); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('pagehide', onUnload); document.removeEventListener('visibilitychange', onVis);
      mesh.leave(ended); stopShare(); local.getTracks().forEach((t) => t.stop()); local.stopFake?.();
      player?.destroy?.(); scene3d?.dispose(); hall = null;
      if (alive) (solo ? rehearsal() : host ? hostView(code) : home());
    }
    window.__vitCinema = { mesh, get seats() { return seats; }, player: () => player && { t: player.time(), playing: player.playing(), reach: player.reachable?.() }, scene: () => scene3d?.debug?.(), hostPlay, hostPause,
      cast: () => castStream && { id: castStream.id, tracks: castStream.getTracks().map((t) => `${t.kind}:${t.readyState}`) }, kind };
    return { destroy: () => leave(), leave };
  }

  function filePlayer(v) {
    const subs = []; for (const ev of ['play', 'pause', 'seeked', 'ratechange']) v.addEventListener(ev, () => subs.forEach((f) => f()));
    return { time: () => v.currentTime || 0, duration: () => (Number.isFinite(v.duration) ? v.duration : 0), playing: () => !v.paused && !v.ended, rate: () => v.playbackRate || 1,
      play: () => v.play().catch(() => toast('Нажмите ▶ в зале, чтобы включить звук')), pause: () => v.pause(), seek: (t) => { v.currentTime = Math.max(0, t); }, setRate: (r) => { v.playbackRate = r; },
      onLocal: (f) => subs.push(f), destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); } };
  }
  async function ytPlayer(box, src) {
    const id = YT.exec(src)?.[1], q = (() => { try { return new URL(src).searchParams; } catch { return new URLSearchParams(); } })();
    const list = /^[A-Za-z0-9_-]{10,64}$/.test(q.get('list') || '') ? q.get('list') : '', index = Math.max(1, parseInt(q.get('index') || '1', 10) || 1);
    if (!id && !list) return null; const holder = h('div'); box.append(holder);
    if (!window.YT?.Player) await (window.__vitYT ||= new Promise((resolve, reject) => { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); }; const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; sc.onerror = () => { window.__vitYT = null; reject(new Error('YouTube не загрузился')); }; document.head.append(sc); }));
    return new Promise((resolve) => {
      const subs = []; let ready = false;
      const y = new window.YT.Player(holder, { ...(id ? { videoId: id } : {}), width: '100%', height: '100%', playerVars: { playsinline: 1, rel: 0, modestbranding: 1, ...(list ? { listType: 'playlist', list } : {}) },
        events: { onReady: () => { ready = true; if (!id && list && index > 1) y.cuePlaylist?.({ listType: 'playlist', list, index: index - 1 }); resolve(api2); }, onStateChange: (e) => { if (e.data === 1 || e.data === 2) subs.forEach((f) => f()); } } });
      const api2 = { time: () => y.getCurrentTime?.() || 0, duration: () => y.getDuration?.() || 0, playing: () => y.getPlayerState?.() === 1, rate: () => y.getPlaybackRate?.() || 1, play: () => y.playVideo?.(), pause: () => y.pauseVideo?.(),
        seek: (t) => y.seekTo?.(Math.max(0, t), true), setRate: (r) => y.setPlaybackRate?.(r), setVolume: (v) => y.setVolume?.(v), onLocal: (f) => subs.push(f), destroy: () => { try { y.destroy(); } catch { /* gone */ } },
        ...(list ? { index: () => { const i = y.getPlaylistIndex?.(); return Number.isInteger(i) ? i : -1; }, setIndex: (i) => y.playVideoAt?.(i) } : {}) };
      setTimeout(() => { if (!ready) resolve(api2); }, 12000);
    });
  }
  // A player site (Rutube, VK Video, Vimeo, Dailymotion, OK, any other) flat over the hall. In the app it is an Electron <webview>
  // (its own session, no preload — electron/main.cjs), which ignores X-Frame-Options; the only thing ever run in the page is a
  // read or a play/pause/seek/rate/volume on its first <video>, polled about once a second. Outside the app: an iframe, by countdown.
  function sitePlayer(box, src, onReach) {
    const subs = [], none = () => 0;
    if (!inApp) {
      const fr = h('iframe', { src, allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', title: 'Плеер сайта' });
      box.append(fr);
      setTimeout(() => onReach(false), 0);
      return { time: none, duration: none, playing: () => false, rate: () => 1, play() {}, pause() {}, seek() {}, setRate() {}, setVolume() {}, onLocal() {}, reachable: () => false, destroy: () => fr.remove() };
    }
    const wv = document.createElement('webview'); wv.setAttribute('src', src); box.append(wv);
    let st = { t: 0, p: true, r: 1, d: 0, at: performance.now() }, reach = null, misses = 0, ready = false, alive = true, vol = null, timer = 0;
    wv.addEventListener('dom-ready', () => { ready = true; misses = 0; });
    wv.addEventListener('did-start-navigation', (e) => { if (e.isMainFrame) { ready = false; misses = 0; } });
    const num = (x) => (Number.isFinite(+x) ? String(+(+x).toFixed(3)) : '0');
    const run = (code) => (ready ? wv.executeJavaScript(code, true).catch(() => null) : Promise.resolve(null));
    const act = (body) => run(`(() => { const v = document.querySelector('video'); if (!v) return false; ${body}; return true; })()`);
    const now = () => st.t + (st.p ? 0 : ((performance.now() - st.at) / 1000) * st.r);
    async function poll() {
      if (!alive) return;
      const r = await run(`(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime || 0, p: v.paused || v.ended, r: v.playbackRate || 1, d: Number.isFinite(v.duration) ? v.duration : 0 } : null; })()`);
      if (!alive) return;
      if (r && typeof r.t === 'number') {
        const changed = reach === true && (r.p !== st.p || Math.abs(r.r - st.r) > 0.01 || Math.abs(r.t - now()) > 1.5);     // pressed or seeked in the page itself
        st = { t: r.t, p: !!r.p, r: +r.r || 1, d: +r.d || 0, at: performance.now() }; misses = 0;
        if (reach !== true) { reach = true; onReach(true); if (vol != null) act(`v.volume = ${num(vol)}`); }
        if (changed) subs.forEach((f) => f());
      } else if (++misses >= (ready ? 6 : 15) && reach !== false) { reach = false; onReach(false); }
      timer = setTimeout(poll, 1000);
    }
    poll();
    return {
      time: now, duration: () => st.d, playing: () => !st.p, rate: () => st.r, reachable: () => reach === true,
      play: () => { st = { ...st, t: now(), p: false, at: performance.now() }; act('const x = v.play(); if (x && x.catch) x.catch(() => {})'); },
      pause: () => { st = { ...st, t: now(), p: true, at: performance.now() }; act('v.pause()'); },
      seek: (t) => { st = { ...st, t: Math.max(0, +t || 0), at: performance.now() }; act(`v.currentTime = ${num(Math.max(0, +t || 0))}`); },
      setRate: (x) => { st = { ...st, t: now(), r: +x || 1, at: performance.now() }; act(`v.playbackRate = ${num(+x || 1)}`); },
      setVolume: (x) => { vol = Math.max(0, Math.min(1, (+x || 0) / 100)); act(`v.volume = ${num(vol)}`); },
      onLocal: (f) => subs.push(f), destroy: () => { alive = false; clearTimeout(timer); wv.remove(); },
    };
  }

  // ── the auditorium in three.js ───────────────────────────────────────────
  async function createScene({ stage, s, seatsRef, me, mySeat, filmV, onDoubleSeat }) {
    const probe = document.createElement('canvas'); if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return null;
    const THREE = await import('/vendor/three/three.module.min.js');
    const { mergeGeometries } = await import('/vendor/three/BufferGeometryUtils.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    stage.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020204); scene.fog = new THREE.Fog(0x020204, 18, 40);
    const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 90);
    const disposables = [], frames = new Map(), sprites = [];
    const keep = (x) => (disposables.push(x), x);

    // geometry of the hall: seats 0.62 m apart, rows 1.05 m deep and 0.3 m higher each, an aisle down the middle
    const SX = 0.62, RZ = 1.05, RY = 0.3, AISLE = 1.1, half = Math.floor(s.cols / 2);
    const seatPos = (id) => { const p = parseSeat(id); if (!p) return null; const left = p.num <= half;
      const x = (p.num - (s.cols + 1) / 2) * SX + (left ? -AISLE / 2 : AISLE / 2);
      return new THREE.Vector3(x, (p.row - 1) * RY, (p.row - 1) * RZ); };
    const hallW = s.cols * SX + AISLE + 3.2, depth = s.rows * RZ;
    const SCREEN_Z = -8.8 - s.rows * 0.15, W = Math.max(7, hallW * 0.8), H = W / 2.1, SCREEN_Y = 1.35 + H / 2;

    // floor: one step per row, edges lit by a faint line
    const stepMat = keep(new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.92, metalness: 0 }));
    const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0x8a8cff, transparent: true, opacity: 0.45 }));
    const frontD = -SCREEN_Z + 0.5; const front = keep(new THREE.BoxGeometry(hallW, 0.1, frontD)); const fm = new THREE.Mesh(front, stepMat); fm.position.set(0, -0.05, -frontD / 2 - RZ / 2 + 0.5); scene.add(fm);
    for (let r = 1; r <= s.rows; r++) {
      const g = keep(new THREE.BoxGeometry(hallW, (r - 1) * RY + 0.1, RZ)); const m = new THREE.Mesh(g, stepMat); m.position.set(0, ((r - 1) * RY) / 2 - 0.05, (r - 1) * RZ); scene.add(m);
      const lg = keep(new THREE.BoxGeometry(hallW - 0.4, 0.008, 0.008)); const l = new THREE.Mesh(lg, lineMat); l.position.set(0, (r - 1) * RY + 0.006, (r - 1) * RZ - RZ / 2 + 0.02); scene.add(l);
    }
    // walls, ceiling, soft vertical light strips on the side walls
    const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0x09090d, roughness: 0.95 }));
    const backZ = depth + 0.8, wallH = 7 + s.rows * RY;
    for (const sx of [-1, 1]) {
      const wg = keep(new THREE.PlaneGeometry(backZ - SCREEN_Z + 2, wallH)); const w = new THREE.Mesh(wg, wallMat); w.rotation.y = sx * -Math.PI / 2; w.position.set(sx * hallW / 2, wallH / 2 - 0.2, (backZ + SCREEN_Z) / 2); scene.add(w);
      for (let i = 0; i < 4; i++) { const sg = keep(new THREE.PlaneGeometry(0.05, 2.2)); const strip = new THREE.Mesh(sg, keep(new THREE.MeshBasicMaterial({ color: 0x8a7cff, transparent: true, opacity: 0.28 }))); strip.rotation.y = sx * -Math.PI / 2; strip.position.set(sx * (hallW / 2 - 0.01), 2.6 + (i % 2) * 0.2, SCREEN_Z + 2.4 + i * ((backZ - SCREEN_Z - 3) / 3)); scene.add(strip); }
    }
    const back = new THREE.Mesh(keep(new THREE.PlaneGeometry(hallW, wallH)), wallMat); back.position.set(0, wallH / 2 - 0.2, backZ); back.rotation.y = Math.PI; scene.add(back);
    const ceil = new THREE.Mesh(keep(new THREE.PlaneGeometry(hallW, backZ - SCREEN_Z + 2)), wallMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, wallH - 0.2, (backZ + SCREEN_Z) / 2); scene.add(ceil);

    // the screen: a slightly curved surface, the film as a texture
    const R = W * 1.6, theta = W / R;
    const screenGeo = keep(new THREE.CylinderGeometry(R, R, H, 64, 1, true, Math.PI - theta / 2, theta));
    const idle = idleTexture(THREE, 'VITON13 · Кинотеатр', s.title); keep(idle);
    const screenMat = keep(new THREE.MeshBasicMaterial({ map: idle, side: THREE.BackSide, toneMapped: false }));
    const screenMesh = new THREE.Mesh(screenGeo, screenMat); screenMesh.position.set(0, SCREEN_Y, SCREEN_Z + R); scene.add(screenMesh);
    const mirror = (t) => { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; t.colorSpace = THREE.SRGBColorSpace; return t; };
    mirror(idle);
    const glowGeo = keep(new THREE.PlaneGeometry(W * 1.25, H * 1.35)); const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0x6070ff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(glowGeo, glowMat); glow.position.set(0, SCREEN_Y, SCREEN_Z - 0.05); scene.add(glow);
    let filmTex = null, screenTex = null, waitTex = null, screenV = null, screenVol = +(store.get('vit.cinema.vol') || 0.9);
    function setFilm(video) { filmTex?.dispose(); filmTex = video ? mirror(new THREE.VideoTexture(video)) : null; paintScreen(); }
    function paintScreen() { screenMat.map = screenTex || (waitTex && !screenTex ? waitTex : null) || filmTex || idle; screenMat.needsUpdate = true; }

    // light from the screen: the film's average colour, sampled small and often
    scene.add(new THREE.AmbientLight(0x30324a, 0.35));
    // a few warm downlights along the ceiling, low, so the chairs keep their shape in a dark hall
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const dl = new THREE.PointLight(0xffd2a0, 5, 8, 1.5); dl.position.set(sx * hallW * 0.22, 3.2 + s.rows * RY, depth * (0.15 + i * 0.38)); scene.add(dl); }
    const hemi = new THREE.HemisphereLight(0x3a3f70, 0x050506, 0.25); scene.add(hemi);
    const screenLight = new THREE.PointLight(0x8090ff, 6, 26, 1.2); screenLight.position.set(0, SCREEN_Y - 0.4, SCREEN_Z + 1.8); scene.add(screenLight);
    const fill = new THREE.SpotLight(0x8090ff, 18, 30, 0.9, 0.8, 1.2); fill.position.set(0, SCREEN_Y, SCREEN_Z + 0.4); fill.target.position.set(0, 0, depth / 2); scene.add(fill, fill.target);
    const sample = document.createElement('canvas'); sample.width = 8; sample.height = 5; const sg = sample.getContext('2d', { willReadFrequently: true });
    const lightColor = new THREE.Color(0x8090ff), target = new THREE.Color(0x8090ff); let lum = 0.25, lumT = 0.25;
    function sampleLight() {
      const src = screenTex?.image || filmTex?.image; if (!src || !(src.videoWidth > 0) || src.paused && !screenTex) { target.set(0x5a64c8); lumT = 0.18; return; }
      try { sg.drawImage(src, 0, 0, 8, 5); const d = sg.getImageData(0, 0, 8, 5).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4;
        target.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace); lumT = Math.min(1, (0.3 * r + 0.59 * g + 0.11 * b) / n / 255 * 1.6 + 0.05); } catch { /* not ready */ }
    }

    // seats: one instanced chair — seat, back, arms, a base
    const parts = [new THREE.CapsuleGeometry(0.06, 0.34, 4, 8).rotateZ(Math.PI / 2).scale(1, 1, 3.8).translate(0, 0.46, 0), new THREE.CapsuleGeometry(0.2, 0.3, 6, 14).scale(1.08, 1, 0.3).rotateX(-0.14).translate(0, 0.86, 0.25),
      new THREE.BoxGeometry(0.06, 0.06, 0.5).translate(-0.28, 0.64, 0.02), new THREE.BoxGeometry(0.06, 0.06, 0.5).translate(0.28, 0.64, 0.02),
      new THREE.BoxGeometry(0.06, 0.24, 0.06).translate(-0.28, 0.52, -0.18), new THREE.BoxGeometry(0.06, 0.24, 0.06).translate(0.28, 0.52, -0.18), new THREE.BoxGeometry(0.36, 0.38, 0.36).translate(0, 0.19, 0.04)];
    const chairGeo = keep(mergeGeometries(parts)); parts.forEach((p) => p.dispose());
    const chairMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.08, emissive: 0x0b0b12 }));
    const ids = []; for (let r = 1; r <= s.rows; r++) for (let c = 1; c <= s.cols; c++) ids.push(seatId(r, c));
    const chairs = new THREE.InstancedMesh(chairGeo, chairMat, ids.length); chairs.frustumCulled = false; scene.add(chairs);
    const tmp = new THREE.Object3D(), col = new THREE.Color();
    function paintChairs() {
      const seats = seatsRef();
      ids.forEach((id, i) => { const p = seatPos(id); tmp.position.copy(p); tmp.rotation.set(0, 0, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); chairs.setMatrixAt(i, tmp.matrix);
        const who = seats[id]; col.set(who ? (who.uid === me.id ? 0x4a4f9a : 0x6a3a48) : 0x3a3a48); chairs.setColorAt(i, col); });
      chairs.instanceMatrix.needsUpdate = true; if (chairs.instanceColor) chairs.instanceColor.needsUpdate = true;
    }
    paintChairs();

    // frames on the seats: a rounded video, a thin rim that brightens with the voice, the name under it
    const frameW = 0.66, frameH = 0.66;
    const roundGeo = keep(roundedRect(THREE, frameW, frameH, 0.08)), rimGeo = keep(roundedRect(THREE, frameW + 0.035, frameH + 0.035, 0.095));
    function makeFrame(uid, name) {
      const g = new THREE.Group();
      const avatar = avatarTexture(THREE, name, uid);
      const mat = new THREE.MeshBasicMaterial({ map: avatar, toneMapped: false });
      const rimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, toneMapped: false });
      const pic = new THREE.Mesh(roundGeo, mat), rim = new THREE.Mesh(rimGeo, rimMat); rim.position.z = -0.004; g.add(rim, pic);
      const label = textSprite(THREE, name || 'Зритель'); label.position.set(0, -frameH / 2 - 0.1, 0.01); g.add(label);
      scene.add(g);
      const f = { uid, g, pic, mat, rimMat, avatar, label, video: null, tex: null, level: 0, talking: false, cam: true, name, an: null };
      frames.set(uid, f); placeFrame(f); return f;
    }
    function placeFrame(f) { const id = Object.entries(seatsRef()).find(([, x]) => x.uid === f.uid)?.[0]; const p = id && seatPos(id); f.g.visible = !!p; if (p) f.g.position.set(p.x, p.y + 1.5, p.z + 0.12); }        // head-and-shoulders height, above the chair back
    let actx = null;
    function setFrame(uid, stream, name) {
      if (uid === me.id) return;
      const f = frames.get(uid) || makeFrame(uid, name);
      f.video?.remove(); f.tex?.dispose();
      const v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = false; v.srcObject = stream; v.play().catch(() => {}); f.video = v;
      if (stream.getVideoTracks().length) { f.tex = new THREE.VideoTexture(v); f.tex.colorSpace = THREE.SRGBColorSpace; if (f.cam) { f.mat.map = f.tex; f.mat.needsUpdate = true; } }
      watchLevel(f, stream);
    }
    function watchLevel(f, stream) {
      const tr = stream.getAudioTracks()[0]; if (!tr) return;
      try { actx ||= new AudioContext(); actx.resume?.(); const src = actx.createMediaStreamSource(new MediaStream([tr])), an = actx.createAnalyser(); an.fftSize = 256; src.connect(an); f.an = { an, src, buf: new Uint8Array(an.fftSize) }; } catch { /* no audio graph */ }
    }
    function removeFrame(uid) { const f = frames.get(uid); if (!f) return; scene.remove(f.g); f.video?.remove(); f.tex?.dispose(); f.avatar.dispose(); f.mat.dispose(); f.rimMat.dispose(); f.label.material.map.dispose(); f.label.material.dispose(); try { f.an?.src.disconnect(); } catch { /* gone */ } frames.delete(uid); }

    // reactions rise from the seat
    function react(uid, e) {
      const id = uid === me.id ? mySeatNow : Object.entries(seatsRef()).find(([, x]) => x.uid === uid)?.[0]; const p = id && seatPos(id); if (!p) return;
      const sp = emojiSprite(THREE, e); sp.position.set(p.x + (Math.random() - 0.5) * 0.2, p.y + 1.95, p.z); sp.userData = { t0: performance.now(), x: sp.position.x }; scene.add(sp); sprites.push(sp);
    }

    // the camera sits in my seat; drag to look around, double-click a free seat to move
    let mySeatNow = mySeat, yaw = 0, pitch = -0.1, yawT = 0, pitchT = -0.1;
    const eye = new THREE.Vector3(), eyeT = new THREE.Vector3();
    const seatEye = (id) => { const p = seatPos(id); return new THREE.Vector3(p.x, p.y + 1.16, p.z - 0.02); };
    eye.copy(seatEye(mySeatNow)); eyeT.copy(eye);
    const look = new THREE.Vector3();
    function aim() {
      const toScreen = new THREE.Vector3(0, SCREEN_Y - 0.15, SCREEN_Z).sub(eye); const base = Math.atan2(toScreen.x, -toScreen.z), basePitch = Math.atan2(toScreen.y, Math.hypot(toScreen.x, toScreen.z));
      const y = base + yaw, p = basePitch + pitch; look.set(eye.x + Math.sin(y) * Math.cos(p), eye.y + Math.sin(p), eye.z - Math.cos(y) * Math.cos(p)); camera.position.copy(eye); camera.lookAt(look);
    }
    const el = renderer.domElement; let drag = null;
    const down = (e) => { drag = { x: e.clientX, y: e.clientY, yaw: yawT, pitch: pitchT }; el.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (!drag) return; yawT = Math.max(-1.1, Math.min(1.1, drag.yaw - (e.clientX - drag.x) * 0.004)); pitchT = Math.max(-0.45, Math.min(0.5, drag.pitch - (e.clientY - drag.y) * 0.003)); };
    const up = () => { drag = null; };
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const dbl = (e) => { const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(chairs)[0]; if (hit?.instanceId != null) onDoubleSeat(ids[hit.instanceId]); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('dblclick', dbl);
    const wheel = (e) => { e.preventDefault(); camera.fov = Math.max(34, Math.min(70, camera.fov + e.deltaY * 0.02)); camera.updateProjectionMatrix(); }; el.addEventListener('wheel', wheel, { passive: false });

    // sizing, the loop
    const resize = () => { const w = stage.clientWidth || 800, h2 = stage.clientHeight || 500; renderer.setSize(w, h2, false); camera.aspect = w / h2; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(stage); resize();
    let raf = 0, frame = 0, paused = false, fps = 0, fpsN = 0, fpsT = performance.now();
    const camPos = new THREE.Vector3();
    function loop() {
      raf = 0; if (paused) return; raf = requestAnimationFrame(loop); frame++;
      yaw += (yawT - yaw) * 0.12; pitch += (pitchT - pitch) * 0.12; eye.lerp(eyeT, 0.06); aim();
      if (frame % 6 === 0) sampleLight();
      lum += (lumT - lum) * 0.08; lightColor.lerp(target, 0.08);
      screenLight.color.copy(lightColor); screenLight.intensity = 2 + lum * 16; fill.color.copy(lightColor); fill.intensity = 6 + lum * 40; glowMat.color.copy(lightColor); glowMat.opacity = 0.03 + lum * 0.12;
      camera.getWorldPosition(camPos);
      for (const f of frames.values()) {
        f.g.lookAt(camPos.x, f.g.position.y, camPos.z);                                     // each frame turns to me: I see every face
        if (f.an && frame % 3 === 0) { f.an.an.getByteTimeDomainData(f.an.buf); let sum = 0; for (const v of f.an.buf) sum += (v - 128) ** 2; f.level = Math.max(Math.sqrt(sum / f.an.buf.length) / 128 * 5, f.level * 0.85); }
        const lit = Math.min(1, Math.max(f.level, f.talking ? 0.35 : 0)); f.rimMat.opacity = 0.18 + lit * 0.82; f.rimMat.color.setHSL(0.62 - lit * 0.15, 0.6 + lit * 0.4, 0.65 + lit * 0.2);
      }
      for (let i = sprites.length - 1; i >= 0; i--) { const sp = sprites[i], t = (performance.now() - sp.userData.t0) / 2600; if (t >= 1) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); sprites.splice(i, 1); continue; }
        sp.position.y += 0.012; sp.position.x = sp.userData.x + Math.sin(t * 9) * 0.05; sp.material.opacity = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85; }
      renderer.render(scene, camera);
      fpsN++; const now = performance.now(); if (now - fpsT > 1000) { fps = Math.round((fpsN * 1000) / (now - fpsT)); fpsN = 0; fpsT = now; }
    }
    loop();
    if (filmV) setFilm(filmV);

    return {
      setFrame, removeFrame,
      setName: (uid, n) => { const f = frames.get(uid); if (!f || f.name === n) return; f.name = n; f.label.material.map.dispose(); f.label.material.map = textCanvas(THREE, n); f.avatar.dispose(); f.avatar = avatarTexture(THREE, n, uid); if (!f.cam || !f.tex) { f.mat.map = f.avatar; f.mat.needsUpdate = true; } },
      setCam: (uid, on) => { const f = frames.get(uid); if (!f) return; f.cam = on; f.mat.map = on && f.tex ? f.tex : f.avatar; f.mat.needsUpdate = true; },
      setTalking: (uid, on) => { const f = frames.get(uid); if (f) f.talking = on; },
      setSelf: () => {},
      reseat: () => { paintChairs(); for (const f of frames.values()) placeFrame(f); },
      moveTo: (id) => { mySeatNow = id; eyeT.copy(seatEye(id)); paintChairs(); },
      react,
      setScreenStream: (stream) => { screenTex?.dispose(); screenTex = null; if (screenV) { screenV.srcObject = null; screenV = null; }
        if (stream) { const v = document.createElement('video'); v.autoplay = true; v.muted = false; v.playsInline = true; v.volume = screenVol; v.srcObject = stream; v.play().catch(() => {}); screenV = v; screenTex = mirror(new THREE.VideoTexture(v)); } paintScreen(); },
      setScreenVolume: (x) => { screenVol = Math.max(0, Math.min(1, +x || 0)); if (screenV) screenV.volume = screenVol; },
      setWaiting: (text) => { const key = text || ''; if (key === (waitTex?.userData.key || '')) return; waitTex?.dispose(); waitTex = key && !screenTex ? mirror(idleTexture(THREE, key, s.title)) : null; if (waitTex) waitTex.userData.key = key; paintScreen(); },
      paused: (p) => { paused = p; if (!p && !raf) loop(); },
      look: (y, p) => { yawT = y; pitchT = p; },
      debug: () => ({ fps, frames: [...frames.values()].map((f) => ({ uid: f.uid, name: f.name, visible: f.g.visible, video: !!f.tex, at: f.g.position.toArray().map((x) => +x.toFixed(2)) })), seat: mySeatNow, screen: screenMat.map === filmTex ? 'film' : screenMat.map === screenTex ? 'screen' : 'idle' }),
      dispose() {
        cancelAnimationFrame(raf); paused = true; ro.disconnect();
        el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('dblclick', dbl); el.removeEventListener('wheel', wheel);
        for (const uid of [...frames.keys()]) removeFrame(uid);
        for (const sp of sprites) { sp.material.map.dispose(); sp.material.dispose(); }
        filmTex?.dispose(); screenTex?.dispose(); waitTex?.dispose(); chairs.dispose(); disposables.forEach((x) => x.dispose?.());
        actx?.close().catch(() => {}); renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
      },
    };
  }

  return { root, destroy() { alive = false; hall?.destroy(); } };
}

// ── small drawing helpers for the hall ─────────────────────────────────────
function roundedRect(THREE, w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, 8), uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - x) / w, (pos.getY(i) - y) / h);
  return g;
}
function canvasTex(THREE, w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function idleTexture(THREE, top, title) {
  return canvasTex(THREE, 1024, 488, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h / 2, w * 0.7); gr.addColorStop(0, '#1a1c34'); gr.addColorStop(1, '#050508'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '500 22px -apple-system, "SF Pro Text", sans-serif'; g.fillText(String(top).toUpperCase().split('').join(' '), w / 2, h * 0.38);
    g.fillStyle = '#fff'; g.font = '600 58px -apple-system, "SF Pro Display", sans-serif'; g.fillText(String(title || '').slice(0, 34), w / 2, h * 0.56);
  });
}
function avatarTexture(THREE, name, uid) {
  let hu = 0; for (const c of String(uid || name || '')) hu = (hu * 31 + c.charCodeAt(0)) % 360;
  return canvasTex(THREE, 256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${hu},45%,34%)`); gr.addColorStop(1, `hsl(${(hu + 50) % 360},50%,14%)`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.font = '600 96px -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(name || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?', w / 2, h / 2 + 4); });
}
function textCanvas(THREE, text) {
  return canvasTex(THREE, 512, 96, (g, w, h) => { g.font = '600 40px -apple-system, "SF Pro Text", sans-serif'; const t = String(text || '').slice(0, 24), tw = Math.min(w - 8, g.measureText(t).width + 44);
    g.fillStyle = 'rgba(10,10,14,.72)'; g.beginPath(); g.roundRect((w - tw) / 2, 14, tw, 64, 32); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, 47); });
}
function textSprite(THREE, text) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textCanvas(THREE, text), transparent: true, depthWrite: false, toneMapped: false })); sp.scale.set(0.62, 0.116, 1); return sp; }
function emojiSprite(THREE, e) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(THREE, 128, 128, (g, w, h) => { g.font = '96px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, w / 2, h / 2 + 6); }), transparent: true, depthWrite: false, toneMapped: false })); sp.scale.set(0.34, 0.34, 1); return sp; }
