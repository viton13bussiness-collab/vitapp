// VJOURNAL in VIT. Two ways to look at the same published stories: a shelf of spines with one cover pulled forward,
// and a library with a lead story and rows by section. Reading happens here when the article text is available.
const SPINES = [['#7a1f1f', '#f1e3c8'], ['#1f3a7a', '#f3ead6'], ['#e9dcc0', '#2a2420'], ['#1d3b2c', '#ead9b8'], ['#1b1b1d', '#e7dcc5'], ['#c98a2b', '#201a12'], ['#5a2a4a', '#f0dfd0'], ['#2c4a52', '#eadfc8'], ['#b8452c', '#f5e6cf'], ['#d8cfc0', '#3a2f28']];
const hash = (s) => { let x = 7; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
const short = (t) => { const s = String(t).split(/[:?!]| — | – /)[0].trim(); return s.length > 44 ? s.slice(0, 42).trimEnd() + '…' : s; };

export default function view(ctx) {
  const { h, icon, api, toast, css } = ctx; css('/worlds/journal.css');
  const sheetLink = document.querySelector('link[href="/worlds/journal.css"]');                         // sizes live in the stylesheet: wait for it before measuring
  const styled = !sheetLink || sheetLink.sheet ? Promise.resolve() : new Promise((r) => { sheetLink.addEventListener('load', r, { once: true }); sheetLink.addEventListener('error', r, { once: true }); });
  const body = h('div', { class: 'jr-body' }), count = h('span', { class: 'cap' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Вид журнала' });
  const root = h('div', { class: 'view jr' }, h('div', { class: 'jr-head' }, h('div', { class: 'jr-brand' }, h('span', { class: 'jr-word' }, 'VJOURNAL'), count), seg), body);
  let data = null, mode = 'shelf', cat = '', items = [], sel = 0, books = [], reader = null, stage = null, ro = null, alive = true;
  try { mode = localStorage.getItem('vit.jr.mode') === 'library' ? 'library' : 'shelf'; } catch { /* private window */ }

  const cover = (c, cls = '') => { const [bg, ink] = SPINES[hash(c.id) % SPINES.length], box = h('span', { class: 'jr-pic ' + cls, style: `--c:${bg};--t:${ink}` });
    if (c.cover) box.append(h('img', { src: c.cover, alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => { e.target.remove(); box.classList.add('noimg'); } })); else box.classList.add('noimg'); return box; };
  const meta = (c) => [day(c.publishedAt), c.readingTime, c.author].filter(Boolean).join(' · ');
  const actions = (c) => h('div', { class: 'jr-acts' }, h('button', { class: 'btn', onclick: () => open(c) }, 'Читать'),
    h('a', { class: 'btn ghost', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'На сайте', icon('out')),
    h('button', { class: 'btn ghost', onclick: () => ctx.askVit(`Расскажи коротко, о чём материал VJOURNAL «${c.title}» и что в нём главное.`) }, 'Спросить VIT'));

  function paintSeg() { seg.replaceChildren(...[['shelf', 'Полка'], ['library', 'Библиотека']].map(([id, name]) => h('button', { class: id === mode ? 'on' : '', 'aria-pressed': String(id === mode), onclick: () => setMode(id) }, name))); }
  function setMode(m) { mode = m; try { localStorage.setItem('vit.jr.mode', m); } catch { /* fine */ } paintSeg(); m === 'shelf' ? shelf() : library(); }

  // ── the shelf ──────────────────────────────────────────────────────────────
  const info = h('div', { class: 'jr-info' });
  function dims() { const s = getComputedStyle(root), n = (k) => parseFloat(s.getPropertyValue(k)) || 0; return { w: n('--jr-w'), g: n('--jr-g'), cw: n('--jr-cw') }; }
  function place(instant) {
    if (!stage || !books.length) return; const { w, g, cw } = dims(), n = books.length, half = Math.floor(n / 2), reach = Math.ceil(stage.clientWidth / 2 / (w + g)) + 1;
    books.forEach((b, i) => { let d = ((i - sel) % n + n) % n; if (d > half) d -= n;
      const x = d === 0 ? 0 : Math.sign(d) * (cw / 2 + g + (Math.abs(d) - 1) * (w + g) + w / 2), far = Math.abs(d) > reach, jump = instant || Math.abs(d - (b.d ?? d)) > 2;
      b.d = d; b.el.style.transition = jump ? 'none' : ''; b.el.style.transform = `translateX(${x}px)`; b.el.style.opacity = far ? '0' : '1'; b.el.style.pointerEvents = far ? 'none' : '';
      b.el.classList.toggle('on', d === 0); b.el.setAttribute('aria-selected', String(d === 0)); b.el.tabIndex = d === 0 ? 0 : -1;
      if (Math.abs(d) <= 1 && b.img && !b.img.src) b.img.src = b.c.cover; });
    const c = items[sel]; if (!c) return;
    info.replaceChildren(h('div', { class: 'cap' }, c.categoryName), h('h2', null, c.title), h('div', { class: 'jr-meta' }, meta(c)), c.excerpt && h('p', null, c.excerpt), actions(c));
    info.style.animation = 'none'; void info.offsetWidth; info.style.animation = '';
  }
  const step = (k) => { if (!books.length) return; sel = ((sel + k) % books.length + books.length) % books.length; place(); };
  function book(c, i) {
    const [bg, ink] = SPINES[hash(c.id) % SPINES.length], img = c.cover ? h('img', { alt: '', decoding: 'async', onerror: (e) => { e.target.remove(); } }) : null;
    const el = h('button', { class: 'jr-book', role: 'option', 'aria-label': c.title, style: `--c:${bg};--t:${ink}`, onclick: () => (i === sel ? open(c) : ((sel = i), place())) },
      h('span', { class: 'jr-face' }, h('span', { class: 'jr-spine' }, h('span', { class: 'jr-spine-cat' }, c.categoryName), h('span', { class: 'jr-spine-title' }, short(c.title)), h('span', { class: 'jr-spine-mark' }, 'VJ')),
        h('span', { class: 'jr-cover' }, img, h('span', { class: 'jr-cover-top' }, 'VJOURNAL'), h('span', { class: 'jr-cover-title' }, short(c.title)), h('span', { class: 'jr-cover-foot' }, h('b', null, c.categoryName), h('i', null, 'VJ')))));
    return { el, c, img, d: null };
  }
  async function pickCat(id) { cat = id; try { items = id ? (await api('/api/journal/list?cat=' + encodeURIComponent(id) + '&limit=48')).items : data.latest; } catch (e) { toast(e.message); return; } if (alive && mode === 'shelf') shelf(); }
  function shelf() {
    if (!items.length) items = data.latest; sel = 0;
    const pill = (id, name) => h('button', { class: 'jr-pill' + (id === cat ? ' on' : ''), 'aria-pressed': String(id === cat), onclick: () => pickCat(id) }, name);
    books = items.map(book);
    stage = h('div', { class: 'jr-stage', role: 'listbox', 'aria-label': 'Полка материалов' }, books.map((b) => b.el), h('div', { class: 'jr-plank' }));
    const arrow = (k, label) => h('button', { class: 'icon-btn jr-arrow' + (k > 0 ? ' next' : ''), 'aria-label': label, onclick: () => step(k) }, icon('back'));
    body.replaceChildren(h('div', { class: 'jr-pills' }, pill('', 'Все'), data.categories.map((c) => pill(c.id, c.name))), h('div', { class: 'jr-shelf' }, arrow(-1, 'Предыдущий материал'), stage, arrow(1, 'Следующий материал')), info);
    let acc = 0, wheelT = 0, px = null;
    stage.addEventListener('wheel', (e) => { e.preventDefault(); acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; clearTimeout(wheelT); wheelT = setTimeout(() => { acc = 0; }, 180); if (Math.abs(acc) > 60) { step(acc > 0 ? 1 : -1); acc = 0; } }, { passive: false });
    stage.addEventListener('pointerdown', (e) => { px = e.clientX; });
    stage.addEventListener('pointerup', (e) => { if (px == null) return; const dx = e.clientX - px; px = null; if (Math.abs(dx) > 36) { step(-Math.sign(dx) * Math.max(1, Math.round(Math.abs(dx) / 90))); stage.dataset.swiped = '1'; setTimeout(() => delete stage.dataset.swiped, 0); } });
    stage.addEventListener('click', (e) => { if (stage.dataset.swiped) { e.stopPropagation(); e.preventDefault(); } }, true);
    ro?.disconnect(); ro = new ResizeObserver(() => place(true)); ro.observe(stage); place(true);
  }

  // ── the library ────────────────────────────────────────────────────────────
  const tile = (c) => h('button', { class: 'jr-card', onclick: () => open(c), 'aria-label': c.title }, cover(c), h('b', null, c.title), h('small', null, day(c.publishedAt)));
  function library() {
    ro?.disconnect(); stage = null; books = []; const f = data.featured;
    body.replaceChildren(h('div', { class: 'jr-lib scroll' }, h('div', { class: 'jr-lib-in' },
      f && h('section', { class: 'jr-feat glass' }, cover(f, 'jr-feat-pic'), h('div', { class: 'jr-feat-text' }, h('div', { class: 'cap' }, 'Главный материал · ' + f.categoryName), h('h2', null, f.title), f.excerpt && h('p', null, f.excerpt), h('div', { class: 'jr-meta' }, meta(f)), actions(f))),
      data.rows.map((r) => h('section', { class: 'jr-sec' }, h('div', { class: 'jr-sec-head' }, h('h3', null, r.name), h('span', { class: 'cap' }, String(r.count)), h('span', { class: 'jr-grow' }), h('button', { class: 'btn sm ghost', onclick: () => { mode = 'shelf'; paintSeg(); pickCat(r.id); } }, 'На полку')),
        h('div', { class: 'jr-strip' }, r.items.map(tile)))))));
  }

  // ── reading ────────────────────────────────────────────────────────────────
  function close() { reader?.remove(); reader = null; }
  async function open(c) {
    close(); const text = h('div', { class: 'jr-text' }, h('p', { class: 'jr-wait' }, 'Открываю материал…'));
    reader = h('div', { class: 'jr-reader', role: 'dialog', 'aria-label': c.title }, h('div', { class: 'jr-bar' }, h('button', { class: 'icon-btn', 'aria-label': 'Назад к журналу', onclick: close }, icon('back')), h('span', { class: 'cap' }, 'VJOURNAL · ' + c.categoryName), h('span', { class: 'jr-grow' }),
        h('a', { class: 'btn sm ghost', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'На сайте', icon('out'))),
      h('div', { class: 'jr-read scroll' }, h('article', { class: 'jr-article' }, h('h1', null, c.title), h('div', { class: 'jr-meta' }, meta(c)), c.cover && cover(c, 'jr-lead'), c.excerpt && h('p', { class: 'jr-deck' }, c.excerpt), text,
        h('div', { class: 'jr-acts' }, h('button', { class: 'btn ghost', onclick: () => ctx.askVit(`Расскажи коротко, о чём материал VJOURNAL «${c.title}» и что в нём главное.`) }, 'Спросить VIT'), h('a', { class: 'btn ghost', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'Читать на сайте', icon('out'))))));
    root.append(reader); const mine = reader;
    try { const a = (await api('/api/journal/article?slug=' + encodeURIComponent(c.slug))).article; if (reader !== mine) return;
      if (a.html) text.innerHTML = a.html;                                                    // sanitised on the server: text tags only
      else text.replaceChildren(h('p', { class: 'jr-wait' }, 'Текст этого материала открыть здесь не получилось. Он доступен на сайте журнала.')); }
    catch { if (reader === mine) text.replaceChildren(h('p', { class: 'jr-wait' }, 'Нет связи с журналом. Материал доступен на сайте.')); }
  }

  const onKey = (e) => { if (!root.isConnected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (reader) { if (e.key === 'Escape') close(); return; }
    if (mode !== 'shelf') return; if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } };
  window.addEventListener('keydown', onKey);

  body.append(h('div', { class: 'empty' }, 'Открываю журнал…'));
  Promise.all([api('/api/journal'), styled]).then(([d]) => { if (!alive) return; data = d;
    if (!d.available || !d.latest.length) { seg.classList.add('hide'); return body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Журнал сейчас недоступен'), 'Не получилось связаться с сайтом VJOURNAL. ', h('a', { href: 'https://journal.viton13.com/ru', target: '_blank', rel: 'noopener noreferrer' }, 'Открыть журнал в браузере'))); }
    count.textContent = `${d.total.toLocaleString('ru-RU')} материалов`; items = d.latest; paintSeg(); mode === 'shelf' ? shelf() : library();
  }).catch((e) => { if (alive) body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Журнал не открылся'), e.message)); });

  return { root, destroy() { alive = false; window.removeEventListener('keydown', onKey); ro?.disconnect(); } };
}
