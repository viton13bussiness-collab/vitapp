// VJOURNAL in VIT. Two ways to look at the same published stories: a shelf of spines you can throw with a finger — the nearest
// cover slides forward — and a library with a lead story and rows by section. A cover opens into the reader and closes back into it.
import { head, styled, spring, drag, project, clamp, growFrom, skeleton, reduced } from '/worlds/_ui.js';

const SPINES = [['#7a1f1f', '#f1e3c8'], ['#1f3a7a', '#f3ead6'], ['#e9dcc0', '#2a2420'], ['#1d3b2c', '#ead9b8'], ['#1b1b1d', '#e7dcc5'], ['#c98a2b', '#201a12'], ['#5a2a4a', '#f0dfd0'], ['#2c4a52', '#eadfc8'], ['#b8452c', '#f5e6cf'], ['#d8cfc0', '#3a2f28']];
const hash = (s) => { let x = 7; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); };
const short = (t) => { const s = String(t).split(/[:?!]| — | – /)[0].trim(); return s.length > 44 ? s.slice(0, 42).trimEnd() + '…' : s; };
const mod = (a, n) => ((a % n) + n) % n;

export default function view(ctx) {
  const { h, icon, api, toast, css } = ctx; css('/worlds/_ui.css'); css('/worlds/journal.css');
  const ready = Promise.all([styled('/worlds/_ui.css'), styled('/worlds/journal.css')]);
  const body = h('div', { class: 'jr-body' }), seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Вид журнала' });
  const top = head(h, { title: 'VJOURNAL', cls: 'jr-top', controls: [seg] });
  const root = h('div', { class: 'view jr' }, top.el, body);
  let data = null, mode = 'shelf', cat = '', items = [], sel = 0, books = [], reader = null, stage = null, ro = null, alive = true, pos = null, offDrag = null;
  try { mode = localStorage.getItem('vit.jr.mode') === 'library' ? 'library' : 'shelf'; } catch { /* private window */ }

  const cover = (c, cls = '') => { const [bg, ink] = SPINES[hash(c.id) % SPINES.length], box = h('span', { class: 'jr-pic ' + cls, style: `--c:${bg};--t:${ink}` });
    if (c.cover) box.append(h('img', { src: c.cover, alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => { e.target.remove(); box.classList.add('noimg'); } })); else box.classList.add('noimg'); return box; };
  const meta = (c) => [day(c.publishedAt), c.readingTime, c.author].filter(Boolean).join(' · ');
  const ask = (c) => ctx.askVit(`Расскажи коротко, о чём материал VJOURNAL «${c.title}» и что в нём главное.`);
  const actions = (c, from) => h('div', { class: 'jr-acts' }, h('button', { class: 'btn w-press', onclick: () => open(c, from?.()) }, 'Читать'),
    h('a', { class: 'btn ghost w-press', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'На сайте', icon('out')),
    h('button', { class: 'btn ghost w-press', onclick: () => ask(c) }, 'Спросить VIT'));

  function paintSeg() { seg.replaceChildren(...[['shelf', 'Полка'], ['library', 'Библиотека']].map(([id, name]) => h('button', { class: id === mode ? 'on' : '', 'aria-pressed': String(id === mode), onclick: () => id !== mode && setMode(id) }, name))); }
  function setMode(m) { mode = m; try { localStorage.setItem('vit.jr.mode', m); } catch { /* fine */ } paintSeg(); m === 'shelf' ? shelf() : library(); }

  // ── the shelf ──────────────────────────────────────────────────────────────
  // `pos` is a spring on the (fractional) index standing at the centre. Dragging holds it, a flick throws it, and it lands on a whole book.
  const info = h('div', { class: 'jr-info' });
  let D = { w: 58, g: 8, cw: 250 };
  function dims() { const s = getComputedStyle(root), n = (k) => parseFloat(s.getPropertyValue(k)) || 0; D = { w: n('--jr-w') || 58, g: n('--jr-g') || 8, cw: n('--jr-cw') || 250 }; D.a = D.cw / 2 + D.g + D.w / 2; D.s = D.w + D.g; }
  const X = (d) => { const ad = Math.abs(d); return Math.sign(d) * (ad <= 1 ? ad * D.a : D.a + (ad - 1) * D.s); };                 // index offset → pixels from the centre
  const Xinv = (x) => { const ax = Math.abs(x); return Math.sign(x) * (ax <= D.a ? ax / D.a : 1 + (ax - D.a) / D.s); };
  const centre = () => books[sel]?.el.querySelector('.jr-face');
  function paintInfo() { const c = items[sel]; if (!c) return;
    info.replaceChildren(h('div', { class: 'cap' }, c.categoryName), h('h2', null, c.title), h('div', { class: 'jr-meta' }, meta(c)), c.excerpt && h('p', null, c.excerpt), actions(c, () => centre()));
    info.style.animation = 'none'; void info.offsetWidth; info.style.animation = ''; }
  function render(p) {
    if (!stage || !books.length) return; const n = books.length, half = n / 2, reach = Math.ceil(stage.clientWidth / 2 / D.s) + 2;
    for (let i = 0; i < n; i++) { const b = books[i]; let d = mod(i - p, n); if (d > half) d -= n; b.d = d;
      if (Math.abs(d) > reach) { if (!b.off) { b.off = true; b.el.style.visibility = 'hidden'; } continue; }
      if (b.off) { b.off = false; b.el.style.visibility = ''; }
      const o = clamp(1 - Math.abs(d), 0, 1); b.el.style.transform = `translate3d(${X(d).toFixed(2)}px,0,0)`; b.el.style.setProperty('--o', o.toFixed(4)); b.el.style.zIndex = o > 0.5 ? 3 : o > 0 ? 2 : 1;
      if (Math.abs(d) <= 1.6 && b.img && !b.img.getAttribute('src')) b.img.src = b.c.cover; }
    const near = mod(Math.round(p), n);
    if (near !== sel) { books[sel]?.el.classList.remove('on'); books[sel]?.el.setAttribute('aria-selected', 'false'); if (books[sel]) books[sel].el.tabIndex = -1; sel = near; books[sel].el.classList.add('on'); books[sel].el.setAttribute('aria-selected', 'true'); books[sel].el.tabIndex = 0; paintInfo(); }
  }
  const step = (k) => { if (pos && books.length) pos.to(Math.round(pos.target) + k); };
  function book(c, i) {
    const [bg, ink] = SPINES[hash(c.id) % SPINES.length], img = c.cover ? h('img', { alt: '', decoding: 'async', draggable: 'false', onerror: (e) => { e.target.remove(); } }) : null;
    const el = h('button', { class: 'jr-book', role: 'option', 'aria-label': c.title, 'aria-selected': 'false', tabindex: '-1', style: `--c:${bg};--t:${ink};--o:0`, onclick: () => { const b = books[i]; if (Math.abs(b.d) < 0.5) open(c, el.querySelector('.jr-face')); else pos.to(pos.value + b.d); } },
      h('span', { class: 'jr-lift' }, h('span', { class: 'jr-face' }, h('span', { class: 'jr-spine' }, h('span', { class: 'jr-spine-cat' }, c.categoryName), h('span', { class: 'jr-spine-title' }, short(c.title)), h('span', { class: 'jr-spine-mark' }, 'VJ')),
        h('span', { class: 'jr-cover' }, img, h('span', { class: 'jr-cover-top' }, 'VJOURNAL'), h('span', { class: 'jr-cover-title' }, short(c.title)), h('span', { class: 'jr-cover-foot' }, h('b', null, c.categoryName), h('i', null, 'VJ'))))));
    return { el, c, img, d: 0, off: false };
  }
  async function pickCat(id) { cat = id; root.querySelectorAll('.jr-pill').forEach((p) => { const on = p.dataset.id === id; p.classList.toggle('on', on); p.setAttribute('aria-pressed', String(on)); });
    try { items = id ? (await api('/api/journal/list?cat=' + encodeURIComponent(id) + '&limit=48')).items : data.latest; } catch (e) { toast(e.message); return; } if (alive && mode === 'shelf') shelf(true); }
  function shelf(keepPills) {
    if (!items.length) items = data.latest; sel = -1; dims(); offDrag?.(); pos?.stop();
    const pill = (id, name) => h('button', { class: 'w-pill w-press jr-pill' + (id === cat ? ' on' : ''), 'data-id': id, 'aria-pressed': String(id === cat), onclick: () => id !== cat && pickCat(id) }, name);
    books = items.map(book);
    stage = h('div', { class: 'jr-stage', role: 'listbox', 'aria-label': 'Полка материалов. Тяните, листайте колесом или стрелками.' }, books.map((b) => b.el), h('div', { class: 'jr-plank' }));
    const arrow = (k, label) => h('button', { class: 'icon-btn w-press jr-arrow' + (k > 0 ? ' next' : ''), 'aria-label': label, onclick: () => step(k) }, icon('back'));
    const shelfEl = h('div', { class: 'jr-shelf' }, arrow(-1, 'Предыдущий материал'), stage, arrow(1, 'Следующий материал'));
    if (keepPills && body.querySelector('.jr-pills')) { body.querySelector('.jr-shelf')?.replaceWith(shelfEl); if (!info.isConnected) body.append(info); }
    else body.replaceChildren(h('div', { class: 'jr-pills' }, pill('', 'Все'), data.categories.map((c) => pill(c.id, c.name))), shelfEl, info);
    pos = spring(0, { damping: 0.84, response: 0.5, onUpdate: render });
    // drag: the book under the finger stays under the finger; on release the flick is projected forward and lands on a spine
    let grab = 0, hist = [];
    offDrag = drag(stage, { axis: 'x',
      onStart: (_e, st) => { const r = stage.getBoundingClientRect(); stage.classList.add('drag'); grab = { x: st.x - (r.left + r.width / 2), at: 0 }; grab.at = pos.value + Xinv(grab.x); pos.hold(); hist = [[performance.now(), pos.value]]; },
      onMove: (dx) => { const p = grab.at - Xinv(grab.x + dx); pos.hold(p); hist.push([performance.now(), p]); if (hist.length > 8) hist.shift(); },
      onEnd: () => { stage.classList.remove('drag'); const now = performance.now(), rec = hist.filter((x) => now - x[0] < 100), a = rec[0], b = rec[rec.length - 1], dt = a && b ? (b[0] - a[0]) / 1000 : 0, v = dt > 0.01 ? (b[1] - a[1]) / dt : 0;
        pos.to(Math.round(pos.value + clamp(project(v), -14, 14)), v); } });
    let wheelT = 0;
    stage.addEventListener('wheel', (e) => { const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return; e.preventDefault();
      pos.to((pos.moving ? pos.target : pos.value) + clamp(d, -160, 160) / 150); clearTimeout(wheelT); wheelT = setTimeout(() => pos.to(Math.round(pos.target)), 140); }, { passive: false });
    ro?.disconnect(); ro = new ResizeObserver(() => { dims(); render(pos.value); }); ro.observe(stage);
    render(0);
    if (!reduced()) { pos.jump(-2.4); pos.to(0, 6); }                                               // the shelf slides in and settles
  }
  function shelfSkeleton() { body.replaceChildren(h('div', { class: 'jr-pills' }, skeleton(h, 9, 'jr-sk-pill')), h('div', { class: 'jr-shelf' }, h('div', { class: 'jr-stage jr-sk' }, skeleton(h, 21, 'jr-sk-spine'), h('div', { class: 'jr-plank' }))), h('div', { class: 'jr-info' }, skeleton(h, 1, 'jr-sk-line s'), skeleton(h, 1, 'jr-sk-line l'), skeleton(h, 1, 'jr-sk-line m'))); }

  // ── the library ────────────────────────────────────────────────────────────
  const tile = (c) => { const pic = cover(c), el = h('button', { class: 'jr-card w-press', onclick: () => open(c, pic), 'aria-label': c.title }, pic, h('b', null, c.title), h('small', null, day(c.publishedAt))); return el; };
  function strip(cards) {                                                                          // a row that scrolls smoothly and fades where it continues
    const track = h('div', { class: 'jr-strip' }, cards), wrap = h('div', { class: 'jr-row at-start' });
    const sync = () => { wrap.classList.toggle('at-start', track.scrollLeft < 4); wrap.classList.toggle('at-end', track.scrollLeft + track.clientWidth > track.scrollWidth - 4); };
    const go = (k) => track.scrollBy({ left: k * Math.max(200, track.clientWidth * 0.8), behavior: reduced() ? 'auto' : 'smooth' });
    track.addEventListener('scroll', sync, { passive: true }); requestAnimationFrame(sync);
    wrap.append(track, h('button', { class: 'icon-btn w-press jr-nav prev', 'aria-label': 'Назад по ряду', onclick: () => go(-1) }, icon('back')), h('button', { class: 'icon-btn w-press jr-nav next', 'aria-label': 'Дальше по ряду', onclick: () => go(1) }, icon('back'))); return wrap;
  }
  function library() {
    ro?.disconnect(); offDrag?.(); pos?.stop(); stage = null; books = []; const f = data.featured; let fpic = null;
    body.replaceChildren(h('div', { class: 'jr-lib scroll' }, h('div', { class: 'jr-lib-in' },
      f && h('section', { class: 'jr-feat glass w-mat' }, (fpic = cover(f, 'jr-feat-pic')), h('div', { class: 'jr-feat-text' }, h('div', { class: 'cap' }, 'Главный материал · ' + f.categoryName), h('h2', null, f.title), f.excerpt && h('p', null, f.excerpt), h('div', { class: 'jr-meta' }, meta(f)), actions(f, () => fpic))),
      data.rows.map((r, i) => h('section', { class: 'jr-sec w-mat', style: `--d:${Math.min(i + 1, 5)}` }, h('div', { class: 'jr-sec-head' }, h('h3', null, r.name), h('span', { class: 'cap' }, String(r.count)), h('span', { class: 'jr-grow' }), h('button', { class: 'btn sm ghost w-press', onclick: () => { mode = 'shelf'; paintSeg(); body.replaceChildren(); cat = r.id; api('/api/journal/list?cat=' + encodeURIComponent(r.id) + '&limit=48').then((d) => { items = d.items; if (alive) shelf(); }).catch((e) => { toast(e.message); items = data.latest; cat = ''; shelf(); }); } }, 'На полку')),
        strip(r.items.map(tile)))))));
  }

  // ── reading: the cover opens into the page and closes back into the cover ──
  let grow = null, source = null;
  async function close() { if (!reader) return; const r = reader, g = grow; reader = null; grow = null; r.classList.add('closing');
    const rect = source?.isConnected ? source.getBoundingClientRect() : null; await (g && rect && rect.width ? g.back(rect) : Promise.resolve()); r.remove(); (source?.closest?.('button') || root).focus?.({ preventScroll: true }); }
  async function open(c, from) {
    if (reader) { reader.remove(); reader = null; }
    source = from || null; const fromRect = from?.getBoundingClientRect();
    const text = h('div', { class: 'jr-text' }, skeleton(h, 7, 'jr-sk-text')), bar = h('i'), pct = h('span', { class: 'cap jr-pct' }, '0 %');
    const read = h('div', { class: 'jr-read scroll' }, h('article', { class: 'jr-article' }, h('div', { class: 'cap' }, c.categoryName), h('h1', null, c.title), h('div', { class: 'jr-meta' }, meta(c)), c.cover && cover(c, 'jr-lead'), c.excerpt && h('p', { class: 'jr-deck' }, c.excerpt), text,
      h('div', { class: 'jr-acts jr-end' }, h('button', { class: 'btn w-press', onclick: close }, 'Вернуть на полку'), h('button', { class: 'btn ghost w-press', onclick: () => ask(c) }, 'Спросить VIT'), h('a', { class: 'btn ghost w-press', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'Читать на сайте', icon('out')))));
    read.addEventListener('scroll', () => { const p = clamp(read.scrollTop / Math.max(1, read.scrollHeight - read.clientHeight), 0, 1); bar.style.transform = `scaleX(${p.toFixed(4)})`; pct.textContent = `${Math.round(p * 100)} %`; }, { passive: true });
    reader = h('div', { class: 'jr-reader', role: 'dialog', 'aria-label': c.title, tabindex: '-1' }, h('div', { class: 'jr-bar' }, h('button', { class: 'icon-btn w-press', 'aria-label': 'Назад к журналу', onclick: close }, icon('back')), h('span', { class: 'cap' }, 'VJOURNAL'), h('span', { class: 'jr-grow' }), pct,
        h('a', { class: 'btn sm ghost w-press', href: c.url, target: '_blank', rel: 'noopener noreferrer' }, 'На сайте', icon('out')), h('div', { class: 'jr-progress' }, bar)), read);
    root.append(reader); const mine = reader; grow = growFrom(reader, fromRect, { radius: 8 }); reader.focus({ preventScroll: true });
    try { const a = (await api('/api/journal/article?slug=' + encodeURIComponent(c.slug))).article; if (reader !== mine) return;
      if (a.html) text.innerHTML = a.html;                                                    // sanitised on the server: text tags only
      else text.replaceChildren(h('p', { class: 'jr-wait' }, 'Текст этого материала открыть здесь не получилось. Он доступен на сайте журнала.')); }
    catch { if (reader === mine) text.replaceChildren(h('p', { class: 'jr-wait' }, 'Нет связи с журналом. Материал доступен на сайте.')); }
  }

  const onKey = (e) => { if (!root.isConnected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (reader) { if (e.key === 'Escape') close(); return; }
    if (mode !== 'shelf') return; if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'Enter' && document.activeElement === document.body && items[sel]) open(items[sel], centre()); };
  window.addEventListener('keydown', onKey);

  ready.then(() => { if (alive && !data) shelfSkeleton(); });
  Promise.all([api('/api/journal'), ready]).then(([d]) => { if (!alive) return; data = d;
    if (!d.available || !d.latest.length) { seg.classList.add('hide'); return body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Журнал сейчас недоступен'), 'Не получилось связаться с сайтом VJOURNAL. ', h('a', { href: 'https://journal.viton13.com/ru', target: '_blank', rel: 'noopener noreferrer' }, 'Открыть журнал в браузере'))); }
    top.count(`${d.total.toLocaleString('ru-RU')} материалов`); items = d.latest; paintSeg(); mode === 'shelf' ? shelf() : library();
  }).catch((e) => { if (alive) body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Журнал не открылся'), e.message)); });

  return { root, destroy() { alive = false; window.removeEventListener('keydown', onKey); ro?.disconnect(); offDrag?.(); pos?.stop(); } };
}
