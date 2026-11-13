// VIT Music: a player window floating in the room, like a visionOS app. Radio from the open Radio Browser catalogue,
// free netlabel music from the Internet Archive (licence on every track), podcasts, your files from ~/Music, and «Мои треки» —
// music you upload yourself: kept on this Mac for free, and with the VIT subscription also in the VITON13 cloud.
// One <audio> lives in window.__vitMusic: it keeps playing while you walk to another world, and the window reattaches to it.

// ── icons (filled, like a player) ───────────────────────────────────────────
const SVG = {
  play: '<path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.2-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/>',
  next: '<path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75L15 12.75a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2z" fill="currentColor"/><rect x="16.5" y="5.5" width="2.6" height="13" rx="1" fill="currentColor"/>',
  prev: '<path d="M19 6.2v11.6a.9.9 0 0 1-1.4.75L9 12.75a.9.9 0 0 1 0-1.5l8.6-5.8A.9.9 0 0 1 19 6.2z" fill="currentColor"/><rect x="4.9" y="5.5" width="2.6" height="13" rx="1" fill="currentColor"/>',
  shuffle: '<path d="M3.5 7h3.2c2 0 3.2.9 4.3 2.6l2 3.3c1.1 1.7 2.3 2.6 4.3 2.6h3.2M17.5 4.5 20.5 7l-3 2.5M3.5 17h3.2c1.4 0 2.4-.4 3.2-1.2M13.8 8.2c.8-.8 1.8-1.2 3.2-1.2M17.5 14.5l3 2.5-3 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  repeat: '<path d="M4.5 11V9.5a3 3 0 0 1 3-3h12M16.5 3.5l3 3-3 3M19.5 13v1.5a3 3 0 0 1-3 3h-12M7.5 20.5l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  heartOn: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z" fill="currentColor"/>',
  more: '<circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/>',
  vol: '<path d="M4.5 9.5h3L12 5.8v12.4l-4.5-3.7h-3z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  mute: '<path d="M4.5 9.5h3L12 5.8v12.4l-4.5-3.7h-3z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  home: '<path d="M4.5 11.3 12 5l7.5 6.3V18.5a1 1 0 0 1-1 1h-4v-5h-5v5h-4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  radio: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  free: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  pods: '<rect x="9" y="3.5" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  local: '<path d="M9 17.5V6.2l10-2v11.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="6.8" cy="17.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16.8" cy="15.5" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  list: '<path d="M4.5 7h10M4.5 12h10M4.5 17h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17 14.5v-7l3.5 1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15.8" cy="15" r="1.6" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  ext: '<path d="M13.5 5.5h5v5M18.5 5.5l-8 8M10 6.5H7a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 7 18.5h9a1.5 1.5 0 0 0 1.5-1.5v-3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  vit: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/>',
  up: '<path d="M12 15.5V5M7.5 9.5 12 5l4.5 4.5M5 15.5v2a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M12 5v10.5M7.5 11 12 15.5l4.5-4.5M5 15.5v2a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  cloud: '<path d="M7.5 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17.6 9.3 4.35 4.35 0 0 1 17 18z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  mac: '<rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 19h6M12 16v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  mine: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v5.5M9.5 11 12 8.5l2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16.3" r="1" fill="currentColor"/>',
};

const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const post = (path, body, method = 'POST') => fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => {});

// ── the engine: one audio for the whole app ─────────────────────────────────
function createEngine() {
  const audio = new Audio(); audio.preload = 'none'; audio.crossOrigin = null;
  const subs = new Set(), S = { queue: [], order: [], pos: -1, track: null, shuffle: store.get('vit.music.shuffle', false), repeat: store.get('vit.music.repeat', 'off'), error: '', loading: false, liked: new Set() };
  audio.volume = store.get('vit.music.volume', 0.8);
  const emit = (why) => subs.forEach((f) => { try { f(why); } catch (e) { console.error(e); } });
  const orderFor = (n, start) => { const idx = [...Array(n).keys()]; if (!S.shuffle) return idx; const rest = idx.filter((i) => i !== start); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; } return [start, ...rest]; };
  function load(track) {
    S.track = track; S.error = ''; S.loading = true; audio.src = track.src; audio.play().catch((e) => { if (e.name === 'AbortError') return; S.loading = false; if (e.name === 'NotAllowedError') return emit('pause'); S.error = 'Не получилось включить'; emit('error'); });
    post('/api/music/recent', { track }); meta(); emit('track');
  }
  function meta() {
    const t = S.track; if (!('mediaSession' in navigator) || !t) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || (t.live ? 'Радио' : ''), album: t.album || 'VITON13', artwork: t.cover ? [{ src: new URL(t.cover, location.href).href, sizes: '512x512' }] : [] }); } catch { /* old engine */ }
  }
  const E = {
    audio, state: S,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    playList(list, i = 0) { if (!list?.length) return; S.queue = list.slice(0, 500); S.order = orderFor(S.queue.length, i); S.pos = S.order.indexOf(i); load(S.queue[i]); },
    playOne(t) { E.playList([t], 0); },
    toggle() { if (!S.track) return; if (audio.paused) { if (S.track.live && audio.readyState === 0) audio.src = S.track.src; audio.play().catch(() => {}); } else audio.pause(); },
    upcoming(n = 8) { const out = []; for (let k = S.pos + 1; k < S.order.length && out.length < n; k++) out.push({ t: S.queue[S.order[k]], k }); return out; },
    jump(k) { if (k < 0 || k >= S.order.length) return; S.pos = k; load(S.queue[S.order[k]]); },
    next(auto = false) {
      if (!S.queue.length) return;
      if (auto && S.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
      if (S.pos + 1 < S.order.length) return E.jump(S.pos + 1);
      if (S.repeat === 'all' || !auto) { S.order = orderFor(S.queue.length, S.order[0]); return E.jump(0); }
      audio.pause(); emit('end');
    },
    prev() { if (audio.currentTime > 4 && !S.track?.live) { audio.currentTime = 0; return; } if (S.pos > 0) E.jump(S.pos - 1); else if (S.track) audio.currentTime = 0; },
    enqueue(t) { if (!S.track) return E.playOne(t); S.queue.push(t); S.order.splice(S.pos + 1, 0, S.queue.length - 1); emit('queue'); },
    seek(sec) { if (S.track && !S.track.live && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, sec)); },
    volume(v) { audio.volume = Math.max(0, Math.min(1, v)); audio.muted = false; store.set('vit.music.volume', audio.volume); emit('volume'); },
    mute() { audio.muted = !audio.muted; emit('volume'); },
    shuffle() { S.shuffle = !S.shuffle; store.set('vit.music.shuffle', S.shuffle); if (S.queue.length) { const cur = S.order[S.pos]; S.order = orderFor(S.queue.length, cur); if (!S.shuffle) S.pos = cur; else S.pos = 0; } emit('queue'); },
    repeat() { S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat]; store.set('vit.music.repeat', S.repeat); emit('mode'); },
    async like(t, on = !S.liked.has(t.key)) { if (on) S.liked.add(t.key); else S.liked.delete(t.key); emit('like');
      await (on ? post('/api/music/likes', { track: t }) : post('/api/music/likes?key=' + encodeURIComponent(t.key), null, 'DELETE')); },
  };
  for (const ev of ['play', 'pause', 'volumechange']) audio.addEventListener(ev, () => emit(ev));
  audio.addEventListener('playing', () => { S.loading = false; S.error = ''; emit('playing'); });
  audio.addEventListener('waiting', () => { S.loading = true; emit('waiting'); });
  audio.addEventListener('timeupdate', () => emit('time'));
  audio.addEventListener('durationchange', () => emit('time'));
  audio.addEventListener('ended', () => E.next(true));
  audio.addEventListener('error', () => { if (!S.track) return; S.loading = false; S.error = S.track.live ? 'Станция сейчас не отвечает' : 'Трек не загрузился'; emit('error');
    if (!S.track.live && S.pos + 1 < S.order.length) setTimeout(() => { if (S.error) E.next(true); }, 1600); });
  if ('mediaSession' in navigator) for (const [a, f] of [['play', () => E.toggle()], ['pause', () => E.toggle()], ['nexttrack', () => E.next()], ['previoustrack', () => E.prev()], ['seekto', (d) => E.seek(d.seekTime)]]) { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* not supported */ } }
  return E;
}
const engine = (window.__vitMusic ||= createEngine());

// ── formatting ──────────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat('ru-RU');
const time = (s) => { if (!Number.isFinite(s) || s <= 0) return '—'; s = Math.round(s); const hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0'); return hh ? `${hh}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`; };
const initials = (s) => String(s || '♪').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '♪';
const hue = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360; };
const ago = (ms) => (ms ? new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
const KIND = { radio: 'Радио', archive: 'Свободная музыка', podcast: 'Подкаст', local: 'Папка «Музыка»', upload: 'Мои треки', cloud: 'Облако VIT Music' };
const MB = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ` : `${Math.max(0.1, n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0).replace('.', ',')} МБ`);
const UP_MAX = 50 * 1024 * 1024, UP_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus)$/i;

export default function view(ctx) {
  const { h, api, toast, css } = ctx;
  css('/worlds/music.css');
  const ic = (name, cls = '') => h('span', { class: 'mu-ic ' + cls, html: `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>` });
  const art = (src, label, cls = '') => {
    const fb = h('span', { class: 'mu-art-fb', style: `--h:${hue(label)}` }, initials(label));
    if (!src) return h('span', { class: 'mu-art ' + cls }, fb);
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
    img.onerror = () => img.replaceWith(fb);
    return h('span', { class: 'mu-art ' + cls }, img);
  };

  // ── layout ──
  const search = h('input', { class: 'mu-search-in', type: 'search', placeholder: 'Поиск', 'aria-label': 'Поиск музыки, радио и подкастов' });
  const nav = h('nav', { class: 'mu-nav' }), libNav = h('div', { class: 'mu-nav' });
  const main = h('div', { class: 'mu-main scroll' }), crumbs = h('div', { class: 'mu-crumbs' }), page = h('div', { class: 'mu-page' });
  const now = h('aside', { class: 'mu-now' });
  const brand = h('div', { class: 'mu-brand' }, h('span', { class: 'mu-brand-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('b', null, 'VIT Music'));
  const side = h('aside', { class: 'mu-side' }, brand,
    h('label', { class: 'mu-search' }, ic('search'), search),
    h('div', { class: 'mu-cap' }, 'Меню'), nav,
    h('div', { class: 'mu-cap' }, 'Медиатека'), libNav,
    ctx.plan === 'vit' && h('button', { class: 'mu-vit', onclick: askVit }, ic('vit'), h('span', null, 'VIT, подбери музыку под настроение')));
  main.append(crumbs, page);
  const bar = h('div', { class: 'mu-bar', role: 'region', 'aria-label': 'Плеер' });
  const win = h('div', { class: 'mu-win' }, side, main, now);
  const root = h('div', { class: 'view mu' }, h('div', { class: 'mu-stage' }, win, bar));

  const MENU = [['home', 'Главная', 'home'], ['radio', 'Радио', 'radio'], ['free', 'Свободная музыка', 'free'], ['pods', 'Подкасты', 'pods'], ['local', 'Папка «Музыка»', 'local']];
  let route = store.get('vit.music.route', { name: 'home' }), history = [], data = { playlists: [] }, alive = true, token = 0;

  function paintNav() {
    nav.replaceChildren(...MENU.map(([id, label, i]) => h('button', { class: 'mu-link' + (route.name === id || route.from === id ? ' on' : ''), onclick: () => go({ name: id }, true) }, ic(i), h('span', null, label))));
    libNav.replaceChildren(
      h('div', { class: 'mu-link-row' }, h('button', { class: 'mu-link' + (route.name === 'mine' ? ' on' : ''), onclick: () => go({ name: 'mine' }, true) }, ic('mine'), h('span', null, 'Мои треки'), h('small', null, data.upCount ? String(data.upCount) : '')),
        h('button', { class: 'mu-up-mini', title: 'Загрузить музыку', 'aria-label': 'Загрузить музыку', onclick: pickFiles }, ic('up'))),
      h('button', { class: 'mu-link' + (route.name === 'likes' ? ' on' : ''), onclick: () => go({ name: 'likes' }, true) }, ic('heart'), h('span', null, 'Любимое'), h('small', null, engine.state.liked.size ? String(engine.state.liked.size) : '')),
      ...(data.playlists || []).map((p) => h('button', { class: 'mu-link' + (route.name === 'playlist' && route.id === p.id ? ' on' : ''), onclick: () => go({ name: 'playlist', id: p.id, title: p.title }, true) }, ic('list'), h('span', null, p.title), h('small', null, p.n ? String(p.n) : ''))),
      h('button', { class: 'mu-link mute', onclick: newPlaylist }, ic('plus'), h('span', null, 'Новый плейлист')));
  }
  async function newPlaylist() {
    const title = prompt('Название плейлиста'); if (!title?.trim()) return;
    try { const d = await api('/api/music/playlists', { body: { title } }); data.playlists = d.items; paintNav(); go({ name: 'playlist', id: d.id, title: title.trim() }, true); } catch (e) { toast(e.message); }
  }

  // ── pages ──
  const TITLES = { home: 'Главная', radio: 'Радио', free: 'Свободная музыка', pods: 'Подкасты', local: 'Папка «Музыка»', likes: 'Любимое', search: 'Поиск', mine: 'Мои треки' };
  function go(r, root = false) {
    if (root) history = []; else history.push(route);
    route = r; store.set('vit.music.route', r.name === 'album' || r.name === 'show' || r.name === 'playlist' || r.name === 'search' ? { name: 'home' } : r);
    main.scrollTop = 0; paintNav(); render();
  }
  function back() { if (!history.length) return; route = history.pop(); paintNav(); render(); }
  function paintCrumbs() {
    const parts = [];
    if (route.from) parts.push(TITLES[route.from]);
    parts.push(route.title || TITLES[route.name] || '');
    crumbs.replaceChildren(h('button', { class: 'mu-back', disabled: !history.length, 'aria-label': 'Назад', onclick: back }, ic('back')),
      ...parts.flatMap((p, i) => [i ? h('span', { class: 'mu-sep' }, '›') : null, h('span', { class: i === parts.length - 1 ? 'cur' : '' }, p)]).filter(Boolean));
  }
  const loading = () => page.replaceChildren(h('div', { class: 'mu-hero skel' }), ...Array.from({ length: 6 }, (_, i) => h('div', { class: 'mu-row skel', style: `--i:${i}` })));
  const empty = (b, s) => h('div', { class: 'mu-empty' }, h('b', null, b), s && h('span', null, s));
  async function render() {
    const my = ++token; paintCrumbs(); loading();
    try {
      const out = await PAGES[route.name]?.(route); if (my !== token || !alive) return;
      page.replaceChildren(...[out].flat().filter(Boolean)); paintRows();
    } catch (e) { if (my === token) page.replaceChildren(empty('Не получилось загрузить', e.message)); }
  }

  // a hero card: blurred cover behind, sharp cover, title, actions
  function hero({ kicker, title, sub, cover, label, play, liked, extra }) {
    return h('section', { class: 'mu-hero' }, h('div', { class: 'mu-hero-bg', style: cover ? `background-image:url("${String(cover).replace(/["\\()]/g, '')}")` : `--h:${hue(label || title)}` }),
      h('div', { class: 'mu-hero-in' }, h('div', { class: 'mu-hero-text' }, kicker && h('span', { class: 'mu-badge' }, h('i'), kicker), h('h1', null, title), sub && h('p', null, sub),
        h('div', { class: 'mu-hero-acts' }, play && h('button', { class: 'mu-play-big', 'aria-label': 'Слушать', onclick: play }, ic('play')), liked, extra)),
      art(cover, label || title, 'mu-hero-art')));
  }
  // the track list: number, cover, title, a stat, duration, heart, more
  let rowsShown = [];
  function rows(list, { stat = (t) => (t.live ? `${nf.format(t.plays || 0)} за сутки` : t.album || ''), head = 'Популярное', count } = {}) {
    if (!list.length) return null;
    const box = h('div', { class: 'mu-rows', role: 'list' });
    list.forEach((t, i) => {
      const liked = h('button', { class: 'mu-heart', 'aria-label': 'В любимое', onclick: (e) => { e.stopPropagation(); engine.like(t); } }, ic('heart'));
      const row = h('div', { class: 'mu-row', role: 'listitem', tabindex: '0', 'data-key': t.key, onclick: () => engine.playList(list, i), onkeydown: (e) => { if (e.key === 'Enter') engine.playList(list, i); } },
        h('span', { class: 'mu-n' }, h('b', null, String(i + 1)), h('span', { class: 'mu-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), ic('play', 'mu-n-play')),
        art(t.cover, t.title, 'sm'), h('span', { class: 'mu-t' }, h('b', null, t.title), h('small', null, t.artist || KIND[t.kind] || '')),
        h('span', { class: 'mu-stat' }, stat(t)), h('span', { class: 'mu-dur' }, t.live ? h('span', { class: 'mu-live' }, 'эфир') : time(t.duration)),
        liked, h('button', { class: 'mu-more', 'aria-label': 'Ещё', onclick: (e) => { e.stopPropagation(); menu(e.currentTarget, t); } }, ic('more')));
      box.append(row);
    });
    rowsShown = list;
    return h('section', { class: 'mu-sec' }, h('div', { class: 'mu-sec-head' }, h('h2', null, head), count && h('small', null, count)), box);
  }
  function paintRows() {
    const S = engine.state;
    for (const r of root.querySelectorAll('.mu-row[data-key]')) {
      const k = r.dataset.key, cur = S.track?.key === k;
      r.classList.toggle('cur', cur); r.classList.toggle('playing', cur && !engine.audio.paused);
      const hb = r.querySelector('.mu-heart'); if (hb) { const on = S.liked.has(k); hb.classList.toggle('on', on); hb.innerHTML = `<span class="mu-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${SVG[on ? 'heartOn' : 'heart']}</svg></span>`; }
    }
  }
  const cards = (list, onOpen, sub = (x) => x.artist) => h('div', { class: 'mu-cards' }, list.map((x) => h('button', { class: 'mu-card', onclick: () => onOpen(x) }, art(x.cover, x.title, 'md'), h('b', null, x.title), h('small', null, sub(x)))));
  const sec = (title, el, more) => el && h('section', { class: 'mu-sec' }, h('div', { class: 'mu-sec-head' }, h('h2', null, title), more && h('button', { class: 'mu-more-link', onclick: more }, 'Все')), el);
  const chips = (tags, cur, on) => h('div', { class: 'mu-chips' }, tags.map(([id, label]) => h('button', { class: 'mu-chip' + (id === cur ? ' on' : ''), onclick: () => on(id) }, label)));
  const openAlbum = (a) => go({ name: 'album', id: a.id, title: a.title, from: 'free' });
  const openShow = (s) => go({ name: 'show', id: s.id, title: s.title, from: 'pods' });
  const heartFor = (t) => { const b = h('button', { class: 'mu-pill', onclick: () => { engine.like(t); } }); const paint = () => { const on = engine.state.liked.has(t.key); b.replaceChildren(ic(on ? 'heartOn' : 'heart'), on ? 'В любимом' : 'В любимое'); b.classList.toggle('on', on); }; paint(); b._paint = paint; return b; };

  const PAGES = {
    async home() {
      const d = (data = { ...data, ...(await api('/api/music/home')) }); syncLikes(d.likes); paintNav();
      const lead = d.ru[0] || d.top[0];
      return [
        lead ? hero({ kicker: 'В эфире', title: lead.title, sub: `${lead.artist} · ${nf.format(lead.plays)} слушали за сутки`, cover: lead.cover, play: () => engine.playList(d.ru.length ? d.ru : d.top, 0), liked: heartFor(lead) })
          : hero({ kicker: 'VITON13', title: 'VIT Music', sub: 'Радио, свободная музыка, подкасты и ваши треки' }),
        rows(d.ru.slice(0, 8), { head: 'Популярное радио', count: 'Россия' }),
        sec('Настроение', chips(d.tags, null, (tag) => go({ name: 'radio', tag, title: d.tags.find((x) => x[0] === tag)?.[1], from: 'radio' }))),
        d.recent.length ? rows(d.recent.slice(0, 6), { head: 'Вы недавно слушали', stat: (t) => KIND[t.kind] || '' }) : null,
        sec('Свободная музыка', d.free.length ? cards(d.free.slice(0, 10), openAlbum, (a) => `${a.artist} · ${a.license}`) : null, () => go({ name: 'free' }, true)),
        sec('Подкасты', d.pods.length ? cards(d.pods.slice(0, 10), openShow) : null, () => go({ name: 'pods' }, true)),
        rows(d.top.slice(0, 8), { head: 'Радио мира', stat: (t) => `${nf.format(t.plays || 0)} за сутки` }),
      ];
    },
    async radio(r) {
      const qs = r.tag ? 'tag=' + encodeURIComponent(r.tag) : r.country === 'world' ? '' : 'country=RU';
      const d = await api('/api/music/radio?' + qs), cur = r.tag || (r.country === 'world' ? 'world' : 'RU');
      return [h('div', { class: 'mu-title' }, h('h1', null, r.title && r.tag ? r.title : 'Радио'), h('p', null, 'Живые станции из открытого каталога Radio Browser. Только те, что играют прямо в приложении.')),
        chips([['RU', 'Россия'], ['world', 'Весь мир'], ...d.tags], cur, (id) => go(id === 'RU' ? { name: 'radio' } : id === 'world' ? { name: 'radio', country: 'world', title: 'Весь мир' } : { name: 'radio', tag: id, title: d.tags.find((x) => x[0] === id)?.[1], from: 'radio' }, true)),
        rows(d.items, { head: 'Станции', count: `${d.items.length}` }) || empty('Здесь пока пусто', 'Каталог станций не ответил. Попробуйте позже.')];
    },
    async free() {
      const d = await api('/api/music/archive');
      return [h('div', { class: 'mu-title' }, h('h1', null, 'Свободная музыка'), h('p', null, 'Релизы нетлейблов из Internet Archive под Creative Commons. Лицензия — на каждом треке.')),
        d.items.length ? cards(d.items, openAlbum, (a) => `${a.artist} · ${a.license}`) : empty('Архив не ответил', 'Попробуйте позже.')];
    },
    async album(r) {
      const a = (await api('/api/music/archive/' + encodeURIComponent(r.id))).album;
      return [hero({ kicker: a.license, title: a.title, sub: `${a.artist} · ${a.tracks.length} ${a.tracks.length === 1 ? 'трек' : 'треков'}`, cover: a.cover, play: () => engine.playList(a.tracks, 0),
        extra: h('a', { class: 'mu-pill', href: a.link, target: '_blank', rel: 'noopener noreferrer' }, ic('ext'), 'Источник') }),
        a.about && h('p', { class: 'mu-about' }, a.about),
        rows(a.tracks, { head: 'Треки', stat: () => a.license }) || empty('В альбоме нет треков для прослушивания')];
    },
    async pods() {
      const d = await api('/api/music/podcasts');
      return [h('div', { class: 'mu-title' }, h('h1', null, 'Подкасты'), h('p', null, 'Популярное в России. Выпуски приходят из открытой ленты каждого подкаста.')),
        d.items.length ? cards(d.items, openShow) : empty('Каталог не ответил', 'Попробуйте позже.')];
    },
    async show(r) {
      const s = (await api('/api/music/podcasts/' + encodeURIComponent(r.id))).show;
      return [hero({ kicker: 'Подкаст', title: s.title, sub: `${s.artist} · ${s.episodes.length} выпусков`, cover: s.cover, play: () => engine.playList(s.episodes, 0) }),
        s.about && h('p', { class: 'mu-about' }, s.about),
        rows(s.episodes, { head: 'Выпуски', stat: (t) => ago(t.date) }) || empty('Выпусков нет', 'Лента подкаста пуста или закрыта.')];
    },
    async local() {
      const d = await api('/api/music/library');
      return [h('div', { class: 'mu-title' }, h('h1', null, 'Папка «Музыка»'), h('p', null, `Файлы из папки ${d.folder} на этом компьютере — только для чтения. Чтобы трек был в VIT Music и в облаке, загрузите его в «Мои треки».`)),
        rows(d.items, { head: 'Файлы', count: String(d.items.length), stat: (t) => t.album || '' }) || empty('В папке «Музыка» пока нет файлов', 'Положите туда mp3, m4a или flac — и они появятся здесь.')];
    },
    async mine() {
      const d = await api('/api/music/up'); data.upCount = d.items.length; paintNav();
      let c = null;                                                        // the cloud: ready / locked / not yet on the site
      if (d.cloudAllowed) { try { c = await api('/api/music/cloud'); } catch (e) { c = { state: e.code || 'error', message: e.message }; } }
      const list = [...d.items, ...(c?.state === 'ready' ? c.items : [])];
      const macBytes = d.items.reduce((n, t) => n + (t.size || 0), 0);
      const macCard = h('div', { class: 'mu-store' }, h('span', { class: 'mu-store-ic' }, ic('mac')), h('div', null, h('b', null, 'На этом Mac'),
        h('small', null, (d.items.length ? `${d.items.length} ${plural(d.items.length, 'трек', 'трека', 'треков')} · ${MB(macBytes)} · ` : '') + 'папка «Музыка → VIT Music», бесплатно'),
        h('button', { class: 'mu-link-btn', onclick: () => api('/api/music/up/reveal', { body: {} }).catch((e) => toast(e.message)) }, 'Показать в Finder')));
      let cloudCard;
      if (!d.cloudAllowed) cloudCard = h('button', { class: 'mu-store locked', onclick: () => ctx.upgrade('music-upload') }, h('span', { class: 'mu-store-ic' }, ic('cloud')),
        h('div', null, h('b', null, 'В облаке VITON13'), h('small', null, 'С подпиской VIT: ваша музыка в интернете и на всех устройствах')));
      else if (c?.state === 'ready') { const pct = c.quota ? Math.min(100, (c.used / c.quota) * 100) : 0;
        cloudCard = h('div', { class: 'mu-store' }, h('span', { class: 'mu-store-ic on' }, ic('cloud')), h('div', null, h('b', null, 'В облаке VITON13'),
          h('small', null, `${c.all} ${plural(c.all, 'трек', 'трека', 'треков')} · ${MB(c.used)} из ${MB(c.quota)}`), h('span', { class: 'mu-meter' }, h('i', { style: `width:${pct.toFixed(1)}%` })))); }
      else cloudCard = h('div', { class: 'mu-store wait' }, h('span', { class: 'mu-store-ic' }, ic('cloud')), h('div', null, h('b', null, 'В облаке VITON13'),
        h('small', null, c?.state === 'no_cloud' ? 'Облако VIT Music появится после обновления viton13.com' : c?.message || 'Облако сейчас недоступно')));
      const drop = h('button', { class: 'mu-drop-zone', onclick: pickFiles }, ic('up'), h('div', null, h('b', null, 'Загрузить музыку'), h('small', null, 'или перетащите файлы в окно · mp3, m4a, aac, flac, wav, ogg · до 50 МБ')));
      return [h('div', { class: 'mu-title' }, h('h1', null, 'Мои треки'), h('p', null, 'Ваша музыка в VIT Music. На этом Mac — бесплатно; в облаке VITON13 — с подпиской VIT, чтобы треки были в интернете и на других устройствах.')),
        h('div', { class: 'mu-stores' }, macCard, cloudCard), drop, upq,
        rows(list, { head: 'Треки', count: String(list.length), stat: placeMark }) || empty('Пока пусто', 'Загрузите первый трек — он появится здесь с обложкой и тегами.'),
        h('p', { class: 'mu-fine' }, 'Загружайте музыку, на которую у вас есть права. Облако личное: ссылок для всех нет.')];
    },
    async likes() {
      const d = await api('/api/music/likes'); syncLikes(d.items);
      return [h('div', { class: 'mu-title' }, h('h1', null, 'Любимое'), h('p', null, 'Всё, что вы отметили сердцем.')),
        rows(d.items, { head: 'Треки и станции', count: String(d.items.length), stat: (t) => KIND[t.kind] || '' }) || empty('Пока ничего', 'Нажмите на сердце у трека или станции.')];
    },
    async playlist(r) {
      const p = (await api('/api/music/playlists/' + r.id)).playlist;
      const del = h('button', { class: 'mu-pill', onclick: async () => { if (!confirm(`Удалить плейлист «${p.title}»?`)) return; data.playlists = (await api('/api/music/playlists/' + p.id, { method: 'DELETE' })).items; go({ name: 'home' }, true); } }, 'Удалить');
      return [hero({ kicker: 'Плейлист', title: p.title, sub: `${p.tracks.length} ${p.tracks.length === 1 ? 'трек' : 'треков'}`, label: p.title, play: p.tracks.length ? () => engine.playList(p.tracks, 0) : null, extra: del }),
        rows(p.tracks, { head: 'Треки', stat: (t) => KIND[t.kind] || '' }) || empty('Плейлист пуст', 'Добавляйте треки через «⋯» → «В плейлист».')];
    },
    async search(r) {
      const d = await api('/api/music/search?q=' + encodeURIComponent(r.q));
      const any = d.radio.length + d.free.length + d.pods.length + d.local.length;
      return [h('div', { class: 'mu-title' }, h('h1', null, `«${r.q}»`), h('p', null, any ? 'Нашлось в радио, свободной музыке, подкастах и ваших файлах.' : 'Ничего не нашлось. Попробуйте другое слово.')),
        rows(d.local, { head: 'Ваша музыка', stat: (t) => (t.place ? placeMark(t) : t.album || '') }), rows(d.radio, { head: 'Радио' }),
        sec('Свободная музыка', d.free.length ? cards(d.free, openAlbum, (a) => `${a.artist} · ${a.license}`) : null),
        sec('Подкасты', d.pods.length ? cards(d.pods, openShow) : null)];
    },
  };
  function syncLikes(items) { if (Array.isArray(items)) { engine.state.liked = new Set(items.map((t) => t.key)); } }

  // ── VIT Music: uploading, the place of a track, editing ──
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const PLACE = { mac: ['mac', 'Mac'], cloud: ['cloud', 'Облако'], both: ['cloud', 'Mac и облако'] };
  function placeMark(t) { const p = PLACE[t.place]; return p ? h('span', { class: 'mu-place ' + t.place, title: t.place === 'both' ? 'Есть на этом Mac и в облаке' : t.place === 'cloud' ? 'Только в облаке VITON13' : 'Только на этом Mac' }, ic(p[0]), p[1]) : (t.album || ''); }
  const upq = h('div', { class: 'mu-upq' });                             // files on their way in
  const canUpload = () => { if (ctx.plan === 'guest') { ctx.upgrade?.('music-upload'); return false; } return true; };
  function pickFiles() {
    if (!canUpload()) return;
    const inp = h('input', { type: 'file', multiple: true, accept: '.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus,audio/*' });
    inp.onchange = () => uploadFiles([...inp.files]); inp.click();
  }
  const durationOf = (file) => new Promise((ok) => { const a = new Audio(), u = URL.createObjectURL(file), done = (v) => { URL.revokeObjectURL(u); ok(v); };
    a.preload = 'metadata'; a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : 0); a.onerror = () => done(0); setTimeout(() => done(0), 5000); a.src = u; });
  async function uploadFiles(files) {
    if (!files.length || !canUpload()) return;
    let added = 0;
    for (const f of files) {
      const row = h('div', { class: 'mu-upq-i' }, h('span', { class: 'mu-upq-n' }, f.name), h('span', { class: 'mu-upq-bar' }, h('i')), h('small', null, MB(f.size)));
      upq.append(row); const bar = row.querySelector('.mu-upq-bar i'), note = row.querySelector('small');
      if (f.size > UP_MAX) { row.classList.add('bad'); note.textContent = 'больше 50 МБ'; continue; }
      if (!UP_EXT.test(f.name) && !/^audio\//.test(f.type)) { row.classList.add('bad'); note.textContent = 'не аудиофайл'; continue; }
      const duration = await durationOf(f);
      const res = await new Promise((ok) => {
        const x = new XMLHttpRequest(); x.open('POST', '/api/music/up'); x.setRequestHeader('x-file-name', encodeURIComponent(f.name)); x.setRequestHeader('x-duration', String(Math.round(duration * 10) / 10));
        x.upload.onprogress = (e) => { if (e.lengthComputable) bar.style.width = (e.loaded / e.total * 100).toFixed(1) + '%'; };
        x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch { /* not json */ } ok({ status: x.status, d }); }; x.onerror = () => ok({ status: 0, d: {} }); x.send(f);
      });
      if (res.status === 402) { row.remove(); ctx.upgrade?.('music-upload'); return; }
      if (res.status !== 200 || !res.d.ok) { row.classList.add('bad'); note.textContent = res.d.message || 'не загрузился'; continue; }
      bar.style.width = '100%'; row.classList.add('done'); note.textContent = 'готово'; added++; setTimeout(() => row.remove(), 1600);
    }
    if (added) { data.upCount = (data.upCount || 0) + added; paintNav(); toast(added === 1 ? 'Трек в VIT Music' : `${added} ${plural(added, 'трек', 'трека', 'треков')} в VIT Music`); if (route.name === 'mine') render(); else go({ name: 'mine' }, true); }
  }
  // drag files onto the window
  const dropHint = h('div', { class: 'mu-drop', 'aria-hidden': 'true' }, h('div', null, ic('up'), h('b', null, 'Отпустите — и трек в VIT Music'), h('small', null, 'mp3, m4a, aac, flac, wav, ogg · до 50 МБ')));
  win.append(dropHint); let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  win.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; win.classList.add('mu-dragging'); });
  win.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  win.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; win.classList.remove('mu-dragging'); } });
  win.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; win.classList.remove('mu-dragging'); uploadFiles([...e.dataTransfer.files]); });

  async function toCloud(t) {
    try { await api(`/api/music/up/${t.id}/cloud`, { method: 'POST', body: {} }); toast('Трек в облаке VITON13'); render(); }
    catch (e) { if (e.status === 402) ctx.upgrade?.('music-upload'); else toast(e.message); }
  }
  async function toMac(t) {
    try { toast('Скачиваю на этот Mac…'); await api(`/api/music/cloud/${t.cloud}/download`, { method: 'POST', body: {} }); toast('Трек теперь и на этом Mac'); render(); } catch (e) { toast(e.message); }
  }
  function saveFile(t) { const a = h('a', { href: `/api/music/up/${t.id}?download=1`, download: t.name || t.title }); document.body.append(a); a.click(); a.remove(); }
  async function removeTrack(t, where) {
    const q = where === 'cloud' ? `Удалить «${t.title}» из облака VITON13?${t.place === 'both' ? ' На этом Mac он останется.' : ''}` : `Убрать «${t.title}» с этого Mac? Файл уйдёт в Корзину.${t.place === 'both' ? ' В облаке он останется.' : ''}`;
    if (!confirm(q)) return;
    try { if (where === 'cloud') await api(`/api/music/cloud/${t.cloud}`, { method: 'DELETE' }); else { await api(`/api/music/up/${t.id}`, { method: 'DELETE' }); data.upCount = Math.max(0, (data.upCount || 1) - 1); }
      paintNav(); render(); } catch (e) { toast(e.message); }
  }
  /** Rename a track and give it a cover: the picture is cut to a 600×600 square and sent as webp. */
  function editSheet(t) {
    const local = t.kind === 'upload';
    const title = h('input', { class: 'mu-field', value: t.title || '', maxlength: 120, placeholder: 'Название', 'aria-label': 'Название' });
    const artist = h('input', { class: 'mu-field', value: t.artist || '', maxlength: 90, placeholder: 'Исполнитель', 'aria-label': 'Исполнитель' });
    const album = h('input', { class: 'mu-field', value: t.album || '', maxlength: 90, placeholder: 'Альбом', 'aria-label': 'Альбом' });
    let coverBlob = null; const prev = h('span', { class: 'mu-sheet-art' }, art(t.cover, t.title, 'md'));
    const pickCover = h('button', { class: 'mu-pill soft', type: 'button', onclick: () => { const i = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }); i.onchange = () => i.files[0] && squareWebp(i.files[0]).then((b) => { coverBlob = b; prev.replaceChildren(h('span', { class: 'mu-art md' }, h('img', { src: URL.createObjectURL(b), alt: '' }))); }).catch(() => toast('Не получилось открыть картинку')); i.click(); } }, 'Выбрать обложку');
    const save = h('button', { class: 'mu-pill solid', type: 'submit' }, 'Сохранить');
    const close = () => { sheet.classList.remove('in'); setTimeout(() => sheet.remove(), 260); };
    const sheet = h('div', { class: 'mu-sheet', onclick: (e) => { if (e.target === sheet) close(); } }, h('form', { class: 'mu-sheet-in', onsubmit: async (e) => { e.preventDefault(); save.disabled = true;
      try {
        if (local) { await api(`/api/music/up/${t.id}`, { body: { title: title.value, artist: artist.value, album: album.value } });
          if (coverBlob) { const r = await fetch(`/api/music/up/${t.id}/cover`, { method: 'POST', body: coverBlob }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Обложка не сохранилась'); } }
        else await api(`/api/music/cloud/${t.cloud}`, { body: { title: title.value, artist: artist.value, album: album.value } });
        close(); toast('Сохранено'); render();
      } catch (er) { save.disabled = false; toast(er.message); } } },
      h('div', { class: 'mu-sheet-head' }, prev, h('div', null, h('b', null, 'Трек'), h('small', null, local ? (t.place === 'both' ? 'На этом Mac и в облаке' : 'На этом Mac') : 'В облаке VITON13'))),
      title, artist, album, local ? pickCover : h('small', { class: 'mu-fine' }, 'Обложку можно сменить, когда трек есть на этом Mac.'),
      h('div', { class: 'mu-sheet-acts' }, h('button', { class: 'mu-pill soft', type: 'button', onclick: close }, 'Отмена'), save)));
    root.append(sheet); requestAnimationFrame(() => sheet.classList.add('in')); title.focus();
  }
  function squareWebp(file) {
    return new Promise((ok, no) => { const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 600; const s = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 600, 600); URL.revokeObjectURL(u);
        c.toBlob((b) => (b ? ok(b) : no(new Error('webp'))), 'image/webp', 0.86); };
      img.onerror = () => { URL.revokeObjectURL(u); no(new Error('image')); }; img.src = u; });
  }

  // the ⋯ menu: queue, playlist, source
  let pop = null;
  function menu(anchor, t) {
    pop?.remove();
    const close = () => { pop?.remove(); pop = null; document.removeEventListener('pointerdown', away, true); };
    const away = (e) => { if (!pop?.contains(e.target)) close(); };
    const item = (label, fn) => h('button', { class: 'mu-pop-i', onclick: () => { close(); fn(); } }, label);
    const own = t.kind === 'upload' || t.kind === 'cloud';
    pop = h('div', { class: 'mu-pop', role: 'menu' },
      item('Играть следующим', () => { engine.enqueue(t); toast('Добавлено в очередь'); }),
      ...(own ? [
        t.kind === 'upload' ? item('Скачать файл', () => saveFile(t)) : item('Скачать на этот Mac', () => toMac(t)),
        item('Изменить', () => editSheet(t)),
        t.kind === 'upload' && !t.cloud ? item('Загрузить в облако VITON13', () => toCloud(t)) : null,
        t.kind === 'upload' ? item('Удалить с этого Mac', () => removeTrack(t, 'mac')) : null,
        t.cloud ? item('Удалить из облака', () => removeTrack(t, 'cloud')) : null,
      ].filter(Boolean) : []),
      ...(data.playlists || []).map((p) => item(`В плейлист «${p.title}»`, async () => { try { data.playlists = (await api('/api/music/playlists/' + p.id, { body: { track: t } })).items; paintNav(); toast(`Добавлено в «${p.title}»`); } catch (e) { toast(e.message); } })),
      item('Новый плейлист с этим треком', async () => { const title = prompt('Название плейлиста'); if (!title?.trim()) return; try { const d = await api('/api/music/playlists', { body: { title } }); data.playlists = (await api('/api/music/playlists/' + d.id, { body: { track: t } })).items; paintNav(); toast(`Плейлист «${title.trim()}» создан`); } catch (e) { toast(e.message); } }),
      t.link && item('Открыть источник', () => window.open(t.link, '_blank', 'noopener')),
      t.license && h('div', { class: 'mu-pop-note' }, `Лицензия: ${t.license}`));
    root.append(pop);
    const r = anchor.getBoundingClientRect(), rr = root.getBoundingClientRect();
    pop.style.left = Math.min(r.right - rr.left - 240, rr.width - 252) + 'px'; pop.style.top = Math.min(r.bottom - rr.top + 6, rr.height - pop.offsetHeight - 12) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', away, true));
  }

  // ── now playing column ──
  function paintNow() {
    const S = engine.state, t = S.track;
    if (!t) { now.replaceChildren(h('div', { class: 'mu-cap' }, 'Сейчас'), h('div', { class: 'mu-now-empty' }, art('', '♪', 'lg'), h('b', null, 'Ничего не играет'), h('span', null, 'Выберите станцию, трек или выпуск подкаста.'))); return; }
    const up = engine.upcoming(6);
    now.replaceChildren(...[h('div', { class: 'mu-now-head' }, h('div', { class: 'mu-cap' }, 'Сейчас'), h('span', { class: 'mu-kind' }, KIND[t.kind] || '')),
      art(t.cover, t.title, 'lg'),
      h('div', { class: 'mu-now-t' }, h('div', null, h('b', null, t.title), h('small', null, t.artist || '')), heartBtn(t)),
      S.error ? h('div', { class: 'mu-err' }, S.error) : null,
      t.license && h('a', { class: 'mu-lic', href: t.licenseUrl || t.link || '#', target: '_blank', rel: 'noopener noreferrer' }, t.license),
      h('div', { class: 'mu-q' }, h('div', { class: 'mu-cap' }, 'Дальше в очереди'),
        up.length ? up.map(({ t: x, k }) => h('button', { class: 'mu-q-i', onclick: () => engine.jump(k) }, art(x.cover, x.title, 'xs'), h('span', null, h('b', null, x.title), h('small', null, x.artist || KIND[x.kind] || ''))))
          : h('p', { class: 'mu-q-empty' }, t.live ? 'Это прямой эфир — он играет, пока вы слушаете.' : 'Очередь закончится на этом треке.'))].filter(Boolean));
  }
  const heartBtn = (t) => { const on = engine.state.liked.has(t.key); return h('button', { class: 'mu-heart big' + (on ? ' on' : ''), 'aria-label': on ? 'Убрать из любимого' : 'В любимое', onclick: () => engine.like(t) }, ic(on ? 'heartOn' : 'heart')); };

  // ── the player bar ──
  const bCover = h('span', { class: 'mu-bar-art' }), bTitle = h('b'), bArtist = h('small');
  const bHeart = h('button', { class: 'mu-heart', 'aria-label': 'В любимое', onclick: () => engine.state.track && engine.like(engine.state.track) });
  const bShuffle = h('button', { class: 'mu-ctl sm', 'aria-label': 'Перемешать', onclick: () => engine.shuffle() }, ic('shuffle'));
  const bPrev = h('button', { class: 'mu-ctl', 'aria-label': 'Предыдущий', onclick: () => engine.prev() }, ic('prev'));
  const bPlay = h('button', { class: 'mu-ctl play', 'aria-label': 'Играть', onclick: () => engine.toggle() });
  const bNext = h('button', { class: 'mu-ctl', 'aria-label': 'Следующий', onclick: () => engine.next() }, ic('next'));
  const bRepeat = h('button', { class: 'mu-ctl sm', 'aria-label': 'Повтор', onclick: () => engine.repeat() }, ic('repeat'));
  const bSeek = h('input', { class: 'mu-range', type: 'range', min: '0', max: '1000', value: '0', 'aria-label': 'Позиция' });
  const bTime = h('span', { class: 'mu-time' }), bVolIc = h('button', { class: 'mu-ctl sm', 'aria-label': 'Звук', onclick: () => engine.mute() });
  const bVol = h('input', { class: 'mu-range vol', type: 'range', min: '0', max: '100', 'aria-label': 'Громкость' });
  let seeking = false;
  bSeek.addEventListener('input', () => { seeking = true; const d = engine.audio.duration; if (Number.isFinite(d)) bTime.textContent = `${time(d * bSeek.value / 1000)} / ${time(d)}`; });
  bSeek.addEventListener('change', () => { seeking = false; const d = engine.audio.duration; if (Number.isFinite(d)) engine.seek(d * bSeek.value / 1000); });
  bVol.addEventListener('input', () => engine.volume(bVol.value / 100));
  bar.append(h('div', { class: 'mu-bar-l' }, bCover, h('div', { class: 'mu-bar-t' }, bTitle, bArtist), bHeart),
    h('div', { class: 'mu-bar-c' }, bShuffle, bPrev, bPlay, bNext, bRepeat),
    h('div', { class: 'mu-bar-r' }, bTime, bSeek, bVolIc, bVol));
  let lastKey = null;
  function paintBar(why) {
    const S = engine.state, t = S.track, a = engine.audio;
    root.classList.toggle('mu-idle', !t);
    if (t?.key !== lastKey) { lastKey = t?.key; bCover.replaceChildren(t ? art(t.cover, t.title, 'xs') : art('', '♪', 'xs')); bTitle.textContent = t ? t.title : 'Ничего не играет'; bArtist.textContent = t ? (t.artist || KIND[t.kind] || '') : 'Выберите, что послушать'; }
    const on = t && S.liked.has(t.key); bHeart.replaceChildren(ic(on ? 'heartOn' : 'heart')); bHeart.classList.toggle('on', !!on); bHeart.disabled = !t;
    bPlay.replaceChildren(ic(a.paused ? 'play' : 'pause')); bPlay.setAttribute('aria-label', a.paused ? 'Играть' : 'Пауза'); bPlay.classList.toggle('wait', !!(S.loading && !a.paused));
    bShuffle.classList.toggle('on', S.shuffle); bRepeat.classList.toggle('on', S.repeat !== 'off'); bRepeat.classList.toggle('one', S.repeat === 'one');
    bVolIc.replaceChildren(ic(a.muted || a.volume === 0 ? 'mute' : 'vol')); if (document.activeElement !== bVol) bVol.value = String(Math.round((a.muted ? 0 : a.volume) * 100));
    const live = t?.live, d = a.duration;
    bSeek.disabled = !t || live || !Number.isFinite(d); bar.classList.toggle('live', !!live);
    if (!seeking) { bSeek.value = Number.isFinite(d) && d > 0 ? String(Math.round(a.currentTime / d * 1000)) : '0'; bSeek.style.setProperty('--p', (bSeek.value / 10) + '%'); bTime.textContent = !t ? '' : live ? 'В эфире' : `${time(a.currentTime)} / ${time(Number.isFinite(d) ? d : t.duration)}`; }
    bVol.style.setProperty('--p', bVol.value + '%');
    if (why !== 'time') { paintNow(); paintRows(); }
  }
  const off = engine.on((why) => { if (!alive) return; paintBar(why); if (why === 'like') paintNav(); if (why === 'error' && engine.state.error) toast(engine.state.error); });

  // ── search, keys, VIT ──
  let st = 0;
  search.addEventListener('input', () => { clearTimeout(st); const v = search.value.trim(); st = setTimeout(() => { if (v.length >= 2) go({ name: 'search', q: v, title: 'Поиск' }, route.name !== 'search'); else if (!v && route.name === 'search') back(); }, 450); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(st); const v = search.value.trim(); if (v) go({ name: 'search', q: v, title: 'Поиск' }, route.name !== 'search'); } });
  const onKey = (e) => {
    if (!root.isConnected || e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); engine.toggle(); } else if (e.key === 'ArrowRight' && e.shiftKey) engine.next(); else if (e.key === 'ArrowLeft' && e.shiftKey) engine.prev();
  };
  window.addEventListener('keydown', onKey);
  async function askVit() {
    let likes = []; try { likes = (await api('/api/music/likes')).items; } catch { /* none */ }
    const names = [...likes, ...(data.recent || [])].slice(0, 12).map((t) => `${t.title}${t.artist ? ' — ' + t.artist : ''}`);
    ctx.askVit(names.length ? `Подбери мне музыку под настроение. Вот что я недавно слушал и отмечал: ${names.join('; ')}. Что включить сейчас — радио, жанр или альбомы, и почему?` : 'Подбери мне музыку под настроение: спроси пару вопросов и предложи радио или жанр.');
  }

  paintNav(); paintBar('init'); render();
  api('/api/music/likes').then((d) => { syncLikes(d.items); paintNav(); paintRows(); paintBar('like'); }).catch(() => {});
  api('/api/music/playlists').then((d) => { data.playlists = d.items; paintNav(); }).catch(() => {});
  api('/api/music/up').then((d) => { data.upCount = d.items.length; paintNav(); }).catch(() => {});
  return { root, destroy() { alive = false; off(); pop?.remove(); clearTimeout(st); window.removeEventListener('keydown', onKey); } };     // the music keeps playing
}

