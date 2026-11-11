// The front door of the ecosystem: the welcome in five languages, five themes shown in clean frames, and the home screen each theme lays out its own way.
import { h, icon, api, css } from '/kit.js';
import { createOrb } from '/orb.js';
css('/home.css');

export const THEMES = [
  { id: 'spatial', name: 'Пространство', line: 'Стеклянные панели в тёмной комнате. Основная.' },
  { id: 'ribbon', name: 'Лента', line: 'Миры на изогнутой ленте вокруг вас.' },
  { id: 'axon', name: 'Пыль', line: 'Чёрный экран, частицы и моноширинный текст.' },
  { id: 'aurora', name: 'Свет', line: 'Белый лист, мягкое сияние, крупный заголовок.' },
  { id: 'horizon', name: 'Горизонт', line: 'Озеро на закате и одно поле для цели.' },
];
export const WORLDS = [
  { id: 'vit', name: 'VIT', cap: 'Агент', line: 'Персональный агент. Вы ставите цель — он доводит её до результата.' },
  { id: 'journal', name: 'VJOURNAL', cap: 'Журнал', line: 'Журнал VITON13: материалы на полке и в библиотеке.' },
  { id: 'store', name: 'Store', cap: 'Магазин', line: 'Магазины VITON13 в одном зале.' },
  { id: 'medicine', name: 'Медицина', cap: 'Тело', line: 'Тело человека по зонам: что там находится и когда провериться.' },
  { id: 'hub', name: 'Hub', cap: 'Приложения', line: 'Приложения и сервисы экосистемы.' },
];
const root = document.documentElement;
export const getTheme = () => root.dataset.theme || 'spatial';
export function setTheme(id, save = true) {
  if (!THEMES.some((t) => t.id === id)) id = 'spatial';
  root.dataset.theme = id; try { localStorage.setItem('vit.theme', id); } catch { /* private mode */ }
  if (id === 'horizon') drawScene();
  if (save) api('/api/settings', { body: { theme: id } }).catch(() => {});
  window.dispatchEvent(new CustomEvent('vit:theme', { detail: id }));
}
export function initTheme(server) { let id = server; try { id ||= localStorage.getItem('vit.theme'); } catch { /* ignore */ } setTheme(id || 'spatial', false); window.addEventListener('resize', () => getTheme() === 'horizon' && drawScene()); }

// ── welcome: five languages, then the globe rises ──
const HELLO = [['Welcome to the ecosystem', 'en'], ['Добро пожаловать в экосистему', 'ru'], ['Bienvenido al ecosistema', 'es'], ['Bienvenue dans l’écosystème', 'fr'], ['欢迎来到生态系统', 'zh']];
export function runIntro({ short = false } = {}) {
  return new Promise((resolve) => {
    const lines = (short ? HELLO.slice(1, 2) : HELLO).map(([t, lang]) => h('div', { class: 'line', lang }, t, ' ', h('b', null, 'VITON13')));
    const globe = h('img', { class: 'globe', src: '/logo-mark.png', alt: '' }), el = h('div', { class: 'intro', role: 'dialog', 'aria-label': 'Добро пожаловать в экосистему VITON13' }, h('div', { class: 'glow' }), lines, globe, h('button', { class: 'skip', onclick: () => finish() }, 'Пропустить'));
    document.body.append(el); let done = false; const timers = [], at = (ms, fn) => timers.push(setTimeout(fn, ms));
    function finish() { if (done) return; done = true; timers.forEach(clearTimeout); el.classList.add('out'); window.removeEventListener('keydown', key); setTimeout(() => el.remove(), 950); resolve(); }
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); }; window.addEventListener('keydown', key);
    const hold = short ? 1500 : 1650, gap = 950; let t = 350;
    lines.forEach((l) => { at(t, () => l.classList.add('in')); at(t + hold, () => l.classList.add('gone')); t += hold + gap * 0.55; });
    at(t + 150, () => globe.classList.add('in')); at(t + 1500, () => globe.classList.add('up')); at(t + 2300, finish);
  });
}

// ── theme picker: every theme in a clean frame ──
const MINI = {
  spatial: [[8, 22, 20, 60], [31, 22, 40, 60], [74, 22, 18, 36], [74, 61, 18, 21]], axon: [[8, 14, 16, 12], [8, 30, 16, 12], [8, 46, 16, 12], [62, 20, 30, 34]],
  aurora: [[26, 44, 48, 5], [36, 54, 28, 3]], horizon: [[26, 36, 48, 22]],
};
function mini(id) {
  if (id === 'ribbon') return h('div', { class: 'pic ribbon' }, [-2, -1, 0, 1, 2].map((k) => h('i', { style: `left:${38 + k * 22}%;background:${['#274b8a', '#c9793a', '#2d8f6b', '#7a52c7', '#b33f5a'][k + 2]};transform:rotateY(${k * -32}deg) translateZ(${Math.abs(k) * 14}px)` })));
  return h('div', { class: 'pic ' + id }, (MINI[id] || []).map(([x, y, w, hh]) => h('i', { style: `left:${x}%;top:${y}%;width:${w}%;height:${hh}%` })));
}
export function themeSheet() {
  const back = h('div', { class: 'sheet-back', onclick: (e) => e.target === back && close() }), frames = h('div', { class: 'frames' });
  const close = () => { back.remove(); window.removeEventListener('keydown', key); }, key = (e) => e.key === 'Escape' && close();
  const paint = () => frames.replaceChildren(...THEMES.map((t) => h('button', { class: 'frame' + (t.id === getTheme() ? ' on' : ''), 'aria-pressed': String(t.id === getTheme()), onclick: () => { setTheme(t.id); paint(); } }, mini(t.id), h('div', null, h('b', null, t.name), h('small', null, t.line)))));
  back.append(h('div', { class: 'sheet glass scroll', role: 'dialog', 'aria-label': 'Тематика' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h2', null, 'Тематика'), ), h('button', { class: 'btn ghost sm', onclick: close }, 'Готово')), h('p', null, 'Меняет главную и весь облик приложения. Выбор сохраняется за вашим профилем.'), frames));
  paint(); document.body.append(back); window.addEventListener('keydown', key);
}

// ── the horizon scene: a lake at dusk, drawn in code ──
export function drawScene() {
  const c = document.getElementById('scene'); if (!c) return; const W = (c.width = innerWidth), H = (c.height = innerHeight), g = c.getContext('2d'), hz = H * 0.56;
  let s = 42; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sky = g.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#0d1424'); sky.addColorStop(0.45, '#2b3350'); sky.addColorStop(0.8, '#8a6f78'); sky.addColorStop(1, '#f0a868'); g.fillStyle = sky; g.fillRect(0, 0, W, hz);
  const sx = W * 0.78, sun = g.createRadialGradient(sx, hz - 6, 0, sx, hz - 6, W * 0.42); sun.addColorStop(0, 'rgba(255,214,150,0.95)'); sun.addColorStop(0.08, 'rgba(255,170,90,0.55)'); sun.addColorStop(0.4, 'rgba(255,120,70,0.12)'); sun.addColorStop(1, 'rgba(255,120,70,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, hz);
  for (let i = 0; i < 26; i++) { const x = r() * W, y = hz * (0.12 + r() * 0.55), w = 120 + r() * 380, hh = 8 + r() * 22, cl = g.createRadialGradient(x, y, 0, x, y, w); cl.addColorStop(0, `rgba(${y > hz * 0.45 ? '255,190,150' : '150,160,200'},${0.05 + r() * 0.08})`); cl.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(x, y); g.scale(1, hh / w); g.translate(-x, -y); g.fillStyle = cl; g.fillRect(x - w, y - w, w * 2, w * 2); g.restore(); }
  const ridge = (base, amp, col, peak) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, hz); let y = base; for (let x = 0; x <= W; x += 6) { y += (r() - 0.5) * amp; y += (base - y) * 0.06; const p = peak ? Math.exp(-Math.pow((x - W * peak[0]) / (W * peak[1]), 2)) * peak[2] : 0; g.lineTo(x, Math.min(hz, y - p)); } g.lineTo(W, hz); g.closePath(); g.fill(); };
  ridge(hz - H * 0.07, 5, '#5d566e', [0.2, 0.2, H * 0.12]); ridge(hz - H * 0.045, 6, '#3d3a52', [0.1, 0.13, H * 0.2]); ridge(hz - H * 0.022, 4, '#23243a', [0.9, 0.16, H * 0.07]);
  // the lake mirrors what is above it, darker and rippled
  g.save(); g.translate(0, hz * 2); g.scale(1, -1); g.drawImage(c, 0, 0, W, hz, 0, 0, W, hz); g.restore();
  const lake = g.createLinearGradient(0, hz, 0, H); lake.addColorStop(0, 'rgba(10,14,26,0.25)'); lake.addColorStop(0.5, 'rgba(8,11,20,0.62)'); lake.addColorStop(1, 'rgba(5,7,14,0.92)'); g.fillStyle = lake; g.fillRect(0, hz, W, H - hz);
  for (let i = 0; i < 180; i++) { const y = hz + Math.pow(r(), 1.6) * (H - hz), w = 30 + r() * 160 * ((y - hz) / (H - hz) + 0.2); g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.03})`; g.fillRect(r() * W, y, w, 1); }
  const mist = g.createLinearGradient(0, hz - 26, 0, hz + 30); mist.addColorStop(0, 'rgba(255,220,190,0)'); mist.addColorStop(0.5, 'rgba(255,220,190,0.2)'); mist.addColorStop(1, 'rgba(255,220,190,0)'); g.fillStyle = mist; g.fillRect(0, hz - 26, W, 56);
  const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

// ── a photograph for each world (VITON13's own imagery), plus the live dust for VIT ──
const PHOTO = { vit: '/media/vit.jpg', journal: '/media/journal.jpg', store: '/media/beauty.jpg', hub: '/media/hub.jpg', medicine: '/media/body.webp' };
/** A world's picture as an element. opts.live puts the turning dust over VIT's photograph. */
function picture(id, orbs, opts = {}) {
  const box = h('div', { class: `art art-${id}` }, h('img', { src: PHOTO[id], alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }));
  if (id === 'vit' && opts.live) { const cv = h('canvas', { 'aria-hidden': 'true' }); box.append(cv); orbs.push(createOrb(cv, { size: opts.size || 420, points: opts.points || 5200, interactive: !!opts.interactive })); }
  return box;
}
const thumb = (id) => h('div', { class: `art art-${id}` }, h('img', { src: PHOTO[id], alt: '', loading: 'lazy', decoding: 'async' }));
const brand = () => h('span', { class: 'wordmark' }, 'VITON', h('sup', null, '13'));
const plural = (n, one, few, many) => `${n.toLocaleString('ru-RU')} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
/** Real numbers under each world's name; filled in as the worlds answer. */
function counts(ctx, onChange) {
  const c = { vit: '13 агентов', medicine: '6 зон тела' };
  const ask = (id, path, fn) => ctx.api(path).then((d) => { const t = fn(d); if (t) { c[id] = t; onChange(); } }).catch(() => {});
  ask('journal', '/api/journal', (d) => d.total && plural(d.total, 'материал', 'материала', 'материалов'));
  ask('store', '/api/store', (d) => d.items?.length && plural(d.items.length, 'товар', 'товара', 'товаров'));
  ask('hub', '/api/hub', (d) => d.total && plural(d.total, 'приложение', 'приложения', 'приложений'));
  return c;
}
const HEAD = { vit: ['Персональный', 'агент VIT'], journal: ['Журнал', 'VJOURNAL'], store: ['Магазины', 'VITON13 Store'], medicine: ['Карта тела', 'человека'], hub: ['Приложения', 'экосистемы'] };

// ── home, laid out by the theme ──
const LAYOUT = {
  // A window of tiles floating in the room: brand, photograph and a white note on the left, the chosen world in the middle, the list of worlds on the right.
  spatial(root, ctx, orbs) {
    let sel = 0, alive = true; const hero = h('div', { class: 'sp-hero' }), list = h('div', { class: 'sp-rows' }), open = h('button', { class: 'sp-open' });
    const info = counts(ctx, () => alive && paintList()), pick = (i) => { sel = i; paint(); };
    let dragged = false, down = null; hero.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; dragged = false; }, true); hero.addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 7) dragged = true; }, true); hero.addEventListener('pointerup', () => { down = null; setTimeout(() => { dragged = false; }, 0); }, true);
    const nav = h('div', { class: 'sp-nav' }, h('button', { class: 'sp-burger', 'aria-label': 'Тематика', title: 'Тематика', onclick: (e) => { e.stopPropagation(); themeSheet(); } }, h('i'), h('i'), h('i')),
      h('div', { class: 'sp-pills' }, [['home', 'Главная'], ['vit', 'VIT'], ['memory', 'Память']].map(([id, t]) => h('button', { class: id === 'home' ? 'on' : '', onclick: (e) => { e.stopPropagation(); if (id !== 'home') ctx.go(id); } }, t))),
      h('button', { class: 'sp-contact', onclick: (e) => { e.stopPropagation(); ctx.go('settings'); } }, 'Профиль'));
    function paintList() { list.replaceChildren(...WORLDS.map((x, i) => h('button', { class: 'sp-row' + (i === sel ? ' on' : ''), onclick: () => pick(i), ondblclick: () => ctx.go(x.id) }, thumb(x.id), h('span', null, h('b', null, x.name), h('small', null, info[x.id] || x.cap)), icon('chev')))); }
    function paint() { const w = WORLDS[sel], nx = WORLDS[(sel + 1) % WORLDS.length]; orbs.splice(0).forEach((o) => o.stop());
      const pic = picture(w.id, orbs, { live: true, size: 900, points: 15000, interactive: true }), text = h('h2', null, HEAD[w.id][0], h('br'), HEAD[w.id][1]);
      hero.replaceChildren(pic, h('div', { class: 'sp-shade' }), nav, text,
        h('div', { class: 'sp-hero-bot' },
          h('button', { class: 'sp-team', onclick: (e) => { e.stopPropagation(); ctx.go('agents'); } }, h('span', { class: 'sp-faces' }, ['#0a84ff', '#bf5af2', '#ff375f'].map((c, i) => h('i', { style: `background:${c}` }, 'СДК'[i]))), h('small', null, 'Команда агентов')),
          h('button', { class: 'sp-next', onclick: (e) => { e.stopPropagation(); pick((sel + 1) % WORLDS.length); } }, h('span', null, 'Дальше ', nx.name), thumb(nx.id))));
      hero.onclick = () => { if (!dragged) ctx.go(w.id, undefined, hero); };                                  // turning the cosmos is not a tap hero.setAttribute('aria-label', `Открыть ${w.name}`);
      open.textContent = `Открыть ${w.name}`; open.onclick = () => ctx.go(w.id, undefined, hero); paintList(); }
    root.append(h('div', { class: 'sp-win' },
      h('div', { class: 'sp-col' }, h('div', { class: 'sp-brand' }, brand()),
        h('button', { class: 'sp-tile sp-pic', onclick: () => ctx.go('settings'), 'aria-label': 'VITON ID — профиль' }, h('img', { src: '/media/id.jpg', alt: '' })),
        h('div', { class: 'sp-tile sp-white' }, h('h3', null, 'Одна экосистема.', h('br'), 'Пять миров.'), h('p', null, 'Агент, журнал, магазин, медицина и приложения — под одним входом.'))),
      hero,
      h('div', { class: 'sp-col' }, h('div', { class: 'sp-tile sp-list' }, h('div', { class: 'sp-list-head' }, h('b', null, 'Миры'), h('button', { class: 'sp-i', 'aria-label': 'Помощь', onclick: () => ctx.go('settings', { tab: 'help' }) }, 'i')), list, open),
        h('button', { class: 'sp-tile sp-explore', onclick: (e) => ctx.go('vit', undefined, e.currentTarget) }, h('img', { src: '/media/portal.jpg', alt: '' }), h('span', null, 'Спросить VIT')))));
    paint();
    return () => { alive = false; };
  },
  ribbon(root, ctx, orbs) {
    let sel = 0; const STEP = 27, ring = h('div', { class: 'rb-ring' }), foot = h('div', { class: 'rb-foot' });
    const panels = WORLDS.map((w, i) => h('button', { class: 'rb-panel', style: `--a:${i * STEP}deg`, onclick: (e) => (i === sel ? ctx.go(w.id, undefined, e.currentTarget.querySelector('.rb-face')) : pick(i)), 'aria-label': w.name }, h('span', { class: 'rb-label' }, w.name), h('div', { class: 'rb-face' }, picture(w.id, orbs, { live: true, size: 420, points: 5200 }))));
    const pick = (i) => { sel = Math.max(0, Math.min(WORLDS.length - 1, i)); paint(); };
    function paint() { const w = WORLDS[sel]; ring.style.setProperty('--rot', `${sel * STEP}deg`); panels.forEach((p, i) => p.classList.toggle('on', i === sel));
      foot.replaceChildren(h('button', { class: 'icon-btn', 'aria-label': 'Назад', onclick: () => pick(sel - 1), disabled: sel === 0 }, icon('back')), h('div', { class: 'rb-text' }, h('h2', null, w.name), h('p', null, w.line), h('button', { class: 'btn', onclick: () => ctx.go(w.id) }, 'Войти')), h('button', { class: 'icon-btn', 'aria-label': 'Вперёд', style: 'transform:scaleX(-1)', onclick: () => pick(sel + 1), disabled: sel === WORLDS.length - 1 }, icon('back'))); }
    ring.append(...panels); const stage = h('div', { class: 'rb-stage' }, ring);
    let x0 = null; stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; }); stage.addEventListener('pointerup', (e) => { if (x0 == null) return; const d = e.clientX - x0; x0 = null; if (Math.abs(d) > 50) pick(sel + (d < 0 ? 1 : -1)); });
    let wheelT = 0; stage.addEventListener('wheel', (e) => { const now = Date.now(); if (now - wheelT < 420 || Math.abs(e.deltaX + e.deltaY) < 12) return; wheelT = now; pick(sel + (e.deltaX + e.deltaY > 0 ? 1 : -1)); }, { passive: true });
    const key = (e) => { if (e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight') pick(sel + 1); if (e.key === 'ArrowLeft') pick(sel - 1); if (e.key === 'Enter') ctx.go(WORLDS[sel].id); }; window.addEventListener('keydown', key);
    root.append(h('div', { class: 'rb-top' }, h('img', { src: '/logo-mark.png', alt: 'VITON13' })), stage, foot); paint();
    return () => window.removeEventListener('keydown', key);
  },
  axon(root, ctx, orbs) {
    const cv = h('canvas', { class: 'ax-dust', 'aria-hidden': 'true' }); orbs.push(createOrb(cv, { size: 1100, points: 18000, interactive: false }));
    const sect = (t, ...kids) => h('div', { class: 'ax-sect' }, h('div', { class: 'ax-h' }, `[${t}]`), kids);
    root.append(cv, h('div', { class: 'ax-left' }, h('div', { class: 'ax-tags' }, ['Агент', 'Память', 'Агенты', 'Журнал', 'Магазин', 'Тело', 'Приложения'].map((t) => h('span', null, t))),
        WORLDS.slice(1).map((w, i) => h('button', { class: 'ax-item', onclick: () => ctx.go(w.id) }, thumb(w.id), h('div', { class: 'ax-meta' }, h('span', null, w.name), h('span', null, `0${i + 2}`))))),
      h('div', { class: 'ax-right' }, sect('Инфо', h('p', null, 'VITON13 — частная экосистема. В центре — VIT: агент, который планирует шаги, ищет данные, подключает агентов и доводит работу до результата.')),
        sect('Миры', WORLDS.map((w, i) => h('button', { class: 'ax-link', onclick: () => ctx.go(w.id) }, `0${i + 1} — ${w.name}`, h('span', null, w.cap)))),
        sect('Профиль', h('p', null, `${ctx.me.name} · ${ctx.me.kind === 'viton' ? 'VITON ID' : 'локальный профиль'}`)), h('button', { class: 'btn', onclick: () => ctx.go('vit') }, 'Открыть VIT')));
  },
  aurora(root, ctx) {
    root.append(h('div', { class: 'au-blob', 'aria-hidden': 'true' }), h('div', { class: 'au-in' }, h('img', { class: 'au-mark', src: '/logo-mark.png', alt: '' }), h('h1', null, h('i', null, 'одна экосистема,'), ' пять миров.'),
      h('p', null, `${ctx.me.name}, выберите, куда войти. VIT доведёт цель до результата, остальное — рядом.`),
      h('div', { class: 'au-row' }, WORLDS.map((w, i) => h('button', { class: 'au-card', onclick: () => ctx.go(w.id) }, h('span', { class: 'cap' }, `0${i + 1}`), h('b', null, w.name), h('small', null, w.cap), icon('right'))))));
  },
  horizon(root, ctx) {
    const ta = h('textarea', { rows: 2, placeholder: 'Например: хочу запустить арт-студию современной живописи', 'aria-label': 'Цель для VIT' }), send = () => { const t = ta.value.trim(); if (t) ctx.askVit(t); else ctx.go('vit'); };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    root.append(h('div', { class: 'hz-in' }, h('h1', null, 'Опишите цель. VIT доведёт её до результата.'),
      h('div', { class: 'glass hz-box' }, ta, h('div', { class: 'hz-row' }, WORLDS.slice(1).map((w) => h('button', { class: 'hz-chip', onclick: () => ctx.go(w.id) }, icon(w.id), w.name)), h('span', { style: 'flex:1' }), h('button', { class: 'round send', 'aria-label': 'Отправить VIT', onclick: send }, icon('up')))),
      h('div', { class: 'cap' }, 'Экосистема VITON13 · агент, журнал, магазин, медицина, приложения')));
  },
};
export function viewHome(ctx) {
  const theme = getTheme(), root = h('div', { class: `view home home-${theme}` }), orbs = [];
  const off = (LAYOUT[theme] || LAYOUT.spatial)(root, ctx, orbs);
  return { root, destroy() { orbs.forEach((o) => o.stop()); off?.(); } };
}
