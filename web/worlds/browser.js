// Meridian — the browser inside VITON13. In the app every tab is a <webview> with its own session (persist:meridian, set up in
// electron/main.cjs: no Node, no preload, nothing of the app reaches the page). In a plain browser the start page still works and
// sites open in a new window. A meridian runs across the whole VITON13 globe — hence the name.
import { reduced } from '/worlds/_ui.js';

export const NAME = 'Meridian';
const ENGINES = {
  google: { name: 'Google', url: (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q) },
  yandex: { name: 'Яндекс', url: (q) => 'https://yandex.ru/search/?text=' + encodeURIComponent(q) },
  ddg: { name: 'DuckDuckGo', url: (q) => 'https://duckduckgo.com/?q=' + encodeURIComponent(q) },
};
const SCOPES = [['all', 'Везде'], ['github', 'GitHub'], ['viton', 'VITON13']];
const QUICK = [
  ['VITON13', 'https://www.viton13.com', 'Экосистема'], ['VJOURNAL', 'https://journal.viton13.com/ru', 'Журнал'], ['Store', 'https://store.viton13.com/ru', 'Магазины'],
  ['Школа', 'https://school.viton13.com/ru', 'Курсы'], ['Hub', 'https://hub.viton13.com/ru', 'Приложения'], ['GitHub', 'https://github.com', 'Открытый код'],
];
const SVG = {
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>', fwd: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>', x: '<path d="M7 7l10 10M17 7L7 17"/>',
  reload: '<path d="M19 12a7 7 0 11-2.05-4.95"/><path d="M19.5 4.5v4h-4"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="6" y="10.5" width="12" height="9" rx="2.2"/><path d="M8.8 10.5V8a3.2 3.2 0 016.4 0v2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', vit: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  out: '<path d="M10 5H6.5A1.5 1.5 0 005 6.5v11A1.5 1.5 0 006.5 19h11a1.5 1.5 0 001.5-1.5V14M14 5h5v5M19 5l-8 8"/>',
  up: '<path d="M12 7l-5 5M12 7l5 5"/>', down: '<path d="M12 17l-5-5M12 17l5-5"/>',
};
const store = { get(k, d) { try { const v = localStorage.getItem('meridian.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('meridian.' + k, JSON.stringify(v)); } catch { /* private mode */ } } };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const web = (u) => /^https?:\/\//i.test(u);

/** What the address bar means: a URL to open or words to search. */
export function resolve(text, engine = 'google', scope = 'all') {
  const t = String(text || '').trim(); if (!t) return '';
  if (scope === 'all' && !/\s/.test(t)) {
    if (web(t)) return t;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
    if (/^[\w-]+(\.[\w-]+)*\.[a-zа-я]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  }
  if (scope === 'github') return `https://github.com/search?q=${encodeURIComponent(t)}&type=repositories`;
  return (ENGINES[engine] || ENGINES.google).url(scope === 'viton' ? 'site:viton13.com ' + t : t);
}

export default function view(ctx) {
  const { h, api, css, toast } = ctx; css('/worlds/browser.css');
  const app = /Electron/.test(navigator.userAgent);
  const ic = (name, cls = '') => h('span', { class: 'mr-ic ' + cls, html: `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>` });
  let engine = ENGINES[store.get('engine', 'google')] ? store.get('engine', 'google') : 'google', scope = 'all', alive = true, seq = 0;
  const tabs = []; let active = null;

  // ── chrome ──
  const backB = h('button', { class: 'icon-btn mr-nav', 'aria-label': 'Назад', title: 'Назад  ⌘[', onclick: () => active?.wv?.canGoBack() && active.wv.goBack() }, ic('back'));
  const fwdB = h('button', { class: 'icon-btn mr-nav', 'aria-label': 'Вперёд', title: 'Вперёд  ⌘]', onclick: () => active?.wv?.canGoForward() && active.wv.goForward() }, ic('fwd'));
  const loadB = h('button', { class: 'icon-btn mr-nav', 'aria-label': 'Обновить', title: 'Обновить  ⌘R', onclick: () => { if (!active?.wv) return; active.loading ? active.wv.stop() : active.wv.reload(); } }, ic('reload'));
  const lock = ic('lock', 'mr-lock'), addr = h('input', { class: 'mr-addr', type: 'text', placeholder: 'Поиск или адрес сайта', 'aria-label': 'Адрес или поиск', autocomplete: 'off', spellcheck: 'false' });
  const bar = h('form', { class: 'mr-bar', onsubmit: (e) => { e.preventDefault(); const u = resolve(addr.value, engine); if (u) { addr.blur(); open(u); } } }, lock, addr, h('i', { class: 'mr-progress' }));
  const askB = h('button', { class: 'btn sm ghost mr-ask', title: ctx.plan === 'vit' ? 'VIT расскажет, что на странице' : 'Входит в подписку VIT', onclick: ask }, ic('vit'), h('span', null, 'Спросить VIT'));
  const strip = h('div', { class: 'mr-tabs', role: 'tablist', 'aria-label': 'Вкладки' }), plus = h('button', { class: 'mr-plus', 'aria-label': 'Новая вкладка', title: 'Новая вкладка  ⌘T', onclick: () => newTab('', true) }, ic('plus'));
  const findIn = h('input', { class: 'field sm', type: 'search', placeholder: 'Найти на странице', 'aria-label': 'Найти на странице' }), findN = h('span', { class: 'cap' });
  const findBar = h('div', { class: 'mr-find glass hide' }, findIn, findN, h('button', { class: 'icon-btn', 'aria-label': 'Предыдущее', onclick: () => find(false) }, ic('up')), h('button', { class: 'icon-btn', 'aria-label': 'Следующее', onclick: () => find(true) }, ic('down')), h('button', { class: 'icon-btn', 'aria-label': 'Закрыть поиск', onclick: closeFind }, ic('x')));
  const stage = h('div', { class: 'mr-stage' }, findBar);
  const root = h('div', { class: 'view mr' + (app ? '' : ' mr-web') },
    h('div', { class: 'mr-top' }, h('div', { class: 'mr-row glass' }, backB, fwdB, loadB, bar, askB), h('div', { class: 'mr-strip' }, strip, plus)), stage);

  // ── the start page ──
  function startPage() {
    const q = h('input', { class: 'mr-q', type: 'search', placeholder: `Искать в ${ENGINES[engine].name} или ввести адрес`, 'aria-label': 'Поиск', autocomplete: 'off', spellcheck: 'false' });
    const engSeg = h('div', { class: 'seg mr-eng', role: 'group', 'aria-label': 'Поисковик' }), scopeRow = h('div', { class: 'mr-scopes', role: 'group', 'aria-label': 'Где искать' });
    const paintEng = () => { engSeg.replaceChildren(...Object.entries(ENGINES).map(([id, e]) => h('button', { class: id === engine ? 'on' : '', 'aria-pressed': String(id === engine), onclick: () => { engine = id; store.set('engine', id); q.placeholder = scope === 'github' ? 'Искать репозитории на GitHub' : `Искать в ${e.name} или ввести адрес`; paintEng(); q.focus(); } }, e.name))); };
    const paintScope = () => { scopeRow.replaceChildren(...SCOPES.map(([id, name]) => h('button', { class: 'mr-chip' + (id === scope ? ' on' : ''), 'aria-pressed': String(id === scope), onclick: () => { scope = id; q.placeholder = id === 'github' ? 'Искать репозитории на GitHub' : id === 'viton' ? 'Искать на сайтах VITON13' : `Искать в ${ENGINES[engine].name} или ввести адрес`; paintScope(); q.focus(); } }, name))); };
    paintEng(); paintScope();
    const projects = h('div', { class: 'mr-projects' });
    const page = h('div', { class: 'mr-start scroll' }, h('div', { class: 'mr-start-in' },
      h('div', { class: 'mr-brand' }, h('span', { class: 'mr-mark', html: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="19"/><ellipse cx="24" cy="24" rx="7.5" ry="19"/><path d="M5 24h38"/></svg>' }), h('h1', null, NAME)),
      h('p', { class: 'mr-sub' }, 'Браузер экосистемы VITON13. Весь интернет — не выходя из приложения.'),
      h('form', { class: 'mr-search glass', onsubmit: (e) => { e.preventDefault(); const u = resolve(q.value, engine, scope); if (u) open(u); } }, ic('search'), q, h('button', { class: 'btn sm', type: 'submit' }, 'Найти')),
      h('div', { class: 'mr-opts' }, engSeg, scopeRow),
      !app && h('p', { class: 'mr-note' }, 'Сайты открываются во встроенном браузере в приложении VITON13. Здесь — в новом окне.'),
      h('section', { class: 'mr-sec' }, h('h2', { class: 'cap' }, 'Быстрый доступ'), h('div', { class: 'mr-quick' }, QUICK.map(([name, url, cap], i) => h('button', { class: 'mr-tile glass', style: `--k:${i}`, onclick: () => open(url) },
        h('span', { class: 'mr-glyph' }, name[0]), h('b', null, name), h('small', null, cap))))),
      h('section', { class: 'mr-sec' }, h('h2', { class: 'cap' }, 'Открытые проекты на GitHub'), projects)));
    api('/api/projects').then((d) => { if (!alive) return; const seen = new Set();
      const items = (d.items || []).filter((p) => /^https:\/\/github\.com\//.test(p.url) && !seen.has(p.url) && seen.add(p.url));
      projects.replaceChildren(...items.map((p) => h('button', { class: 'mr-proj glass', onclick: () => open(p.url) }, h('span', { class: 'mr-proj-top' }, h('b', null, p.name), h('span', { class: 'tag' }, p.license)), h('small', null, p.role), h('span', { class: 'cap' }, p.url.replace('https://github.com/', '')))));
    }).catch(() => projects.replaceChildren(h('p', { class: 'mr-note' }, 'Список проектов сейчас не загрузился.')));
    return { page, focus: () => q.focus() };
  }

  // ── tabs ──
  function newTab(url = '', show = true) {
    const t = { id: ++seq, url, title: url ? host(url) : 'Новая вкладка', icon: '', loading: false, wv: null, start: null };
    t.el = h('div', { class: 'mr-tab', role: 'tab', tabindex: '0', onclick: () => activate(t), onauxclick: (e) => { if (e.button === 1) close(t); }, onkeydown: (e) => { if (e.key === 'Enter') activate(t); } },
      (t.fav = h('span', { class: 'mr-fav' })), (t.name = h('span', { class: 'mr-name' }, t.title)), h('button', { class: 'mr-x', 'aria-label': 'Закрыть вкладку', onclick: (e) => { e.stopPropagation(); close(t); } }, ic('x')));
    tabs.push(t); strip.append(t.el); paintFav(t);
    if (show) activate(t); save(); return t;
  }
  function mount(t) {
    if (!t.url) { if (!t.start) { t.start = startPage(); stage.append(t.start.page); } return; }
    if (t.wv || !app) return;
    const wv = (t.wv = document.createElement('webview')); wv.className = 'mr-wv'; wv.setAttribute('partition', 'persist:meridian'); wv.setAttribute('allowpopups', ''); wv.setAttribute('src', t.url);      // popups never open: main.cjs turns them into Meridian tabs
    wv.addEventListener('did-start-loading', () => { t.loading = true; sync(t); });
    wv.addEventListener('did-stop-loading', () => { t.loading = false; sync(t); });
    wv.addEventListener('did-navigate', (e) => { t.url = e.url; t.icon = ''; paintFav(t); sync(t); save(); });
    wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { t.url = e.url; sync(t); save(); } });
    wv.addEventListener('page-title-updated', (e) => { t.title = e.title || host(t.url); t.name.textContent = t.title; t.el.title = t.title; });
    wv.addEventListener('page-favicon-updated', (e) => { t.icon = (e.favicons || []).find((f) => /^https:/.test(f)) || ''; paintFav(t); });
    wv.addEventListener('found-in-page', (e) => { const r = e.result; if (r.finalUpdate) findN.textContent = r.matches ? `${r.activeMatchOrdinal} из ${r.matches}` : 'нет'; });
    wv.addEventListener('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode !== -3 && t === active) toast(`Страница не открылась: ${e.errorDescription || 'нет связи'}`); });
    stage.append(wv);
  }
  function paintFav(t) { t.fav.replaceChildren(t.icon ? h('img', { src: t.icon, alt: '', onerror: () => { t.icon = ''; paintFav(t); } }) : t.url ? ic('globe') : ic('search')); }
  function activate(t) {
    active = t; mount(t);
    for (const x of tabs) { const on = x === t; x.el.classList.toggle('on', on); x.el.setAttribute('aria-selected', String(on)); x.wv?.classList.toggle('off', !on); x.start?.page.classList.toggle('off', !on); }
    t.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    sync(t); closeFind(); save();
    if (!t.url) setTimeout(() => t.start?.focus(), 30);
  }
  function close(t) {
    const i = tabs.indexOf(t); if (i < 0) return; tabs.splice(i, 1); t.el.remove(); t.wv?.remove(); t.start?.page.remove();
    if (!tabs.length) newTab('', true); else if (active === t) activate(tabs[Math.min(i, tabs.length - 1)]); else save();
  }
  /** Open an address: in the current tab (a start page turns into the site) or, outside the app, in a new window. */
  function open(url, inNew = false) {
    if (!web(url)) return;
    if (!app) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    if (inNew || !active) return newTab(url, true);
    if (!active.url) { active.url = url; active.title = host(url); active.name.textContent = active.title; active.start?.page.remove(); active.start = null; paintFav(active); mount(active); activate(active); return; }
    active.wv ? active.wv.loadURL(url).catch(() => {}) : (active.url = url, mount(active)); sync(active);
  }
  function sync(t) {
    if (t !== active) return;
    const live = !!t.wv && t.url; let back = false, fwd = false; try { back = live && t.wv.canGoBack(); fwd = live && t.wv.canGoForward(); } catch { /* not attached yet */ }
    backB.disabled = !back; fwdB.disabled = !fwd; loadB.disabled = !live;
    loadB.replaceChildren(ic(t.loading ? 'x' : 'reload')); loadB.setAttribute('aria-label', t.loading ? 'Остановить' : 'Обновить');
    bar.classList.toggle('loading', !!t.loading); t.el.classList.toggle('loading', !!t.loading);
    lock.classList.toggle('on', /^https:/.test(t.url)); askB.disabled = !t.url;
    if (document.activeElement !== addr) addr.value = t.url ? host(t.url) : '';
  }
  addr.addEventListener('focus', () => { addr.value = active?.url || ''; requestAnimationFrame(() => addr.select()); root.classList.add('typing'); });
  addr.addEventListener('blur', () => { root.classList.remove('typing'); if (active) sync(active); });
  function save() { if (!alive || !app) return; store.set('tabs', tabs.map((t) => t.url)); store.set('active', Math.max(0, tabs.indexOf(active))); }

  function ask() {
    if (!active?.url) return;
    if (ctx.plan !== 'vit') return ctx.upgrade?.('browser');
    ctx.askVit(`Что на этой странице: ${active.title} — ${active.url}`);
  }

  // ── find on page ──
  function openFind() { if (!active?.wv) return; findBar.classList.remove('hide'); findIn.focus(); findIn.select(); }
  function closeFind() { if (findBar.classList.contains('hide')) return; findBar.classList.add('hide'); findN.textContent = ''; try { active?.wv?.stopFindInPage('clearSelection'); } catch { /* gone */ } }
  function find(forward = true) { const q = findIn.value.trim(); if (!q || !active?.wv) return; active.wv.findInPage(q, { forward, findNext: true }); }
  findIn.addEventListener('input', () => { const q = findIn.value.trim(); if (!active?.wv) return; if (q) active.wv.findInPage(q); else { active.wv.stopFindInPage('clearSelection'); findN.textContent = ''; } });
  findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(!e.shiftKey); } else if (e.key === 'Escape') closeFind(); });

  // ── keys and links that want a new window ──
  const onKey = (e) => {
    if (!root.isConnected || !(e.metaKey || e.ctrlKey)) return; const k = e.key.toLowerCase();
    const act = { l: () => addr.focus(), t: () => newTab('', true), w: () => active && close(active), r: () => active?.wv?.reload(), '[': () => active?.wv?.canGoBack() && active.wv.goBack(), ']': () => active?.wv?.canGoForward() && active.wv.goForward(), f: openFind }[k];
    if (act) { e.preventDefault(); act(); }
  };
  const onOpen = (e) => { if (web(String(e.detail || ''))) open(String(e.detail), true); };
  const onPageKey = (e) => onKey({ key: String(e.detail || ''), metaKey: true, preventDefault() {} });      // the same keys pressed while a page has focus (sent by main.cjs)
  window.addEventListener('keydown', onKey); window.addEventListener('meridian:open', onOpen); window.addEventListener('meridian:key', onPageKey);

  // restore what was open last time
  const saved = (store.get('tabs', []) || []).filter((u) => u === '' || web(u)).slice(0, 12);
  if (app && saved.length) { const at = store.get('active', 0) | 0; saved.forEach((u) => newTab(u, false)); activate(tabs[Math.min(at, tabs.length - 1)]); }
  else newTab('', true);

  return { root, open: (u) => open(u, true), destroy() { save(); alive = false; window.removeEventListener('keydown', onKey); window.removeEventListener('meridian:open', onOpen); window.removeEventListener('meridian:key', onPageKey); } };
}
