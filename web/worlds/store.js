// VITON13 Store in VIT: a virtual hall. Two rails of real products run into the fog, a chrome sign with real depth hangs in the aisle,
// the hall turns a little after the pointer, and you walk it by dragging (a flick carries you on), with the wheel or the arrow keys.
// A product's card grows out of the thing you touched. No cart here: the site sells, VIT helps.
import { head, styled, spring, drag, project, rubber, clamp, skeleton, reduced } from '/worlds/_ui.js';

const money = (n, cur) => (!n ? '' : cur === 'USD' ? '$' + n.toLocaleString('en-US') : cur === 'RUR' || cur === 'RUB' ? n.toLocaleString('ru-RU') + ' ₽' : `${n.toLocaleString('ru-RU')} ${cur}`);
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'вещь' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'вещи' : 'вещей');

export default function view(ctx) {
  const { h, icon, api, css } = ctx; css('/worlds/_ui.css'); css('/worlds/store.css');
  const ready = Promise.all([styled('/worlds/_ui.css'), styled('/worlds/store.css')]);
  const pills = h('div', { class: 'st-pills' }), top = head(h, { title: 'Store', controls: [pills] });
  const world = h('div', { class: 'st-world' }), hint = h('div', { class: 'cap st-hint' }, matchMedia('(pointer: coarse)').matches ? 'Тяните вверх — идти по залу' : 'Тяните, крутите колесо или жмите стрелки — идти по залу');
  const room = h('div', { class: 'st-room', tabindex: '0', 'aria-label': 'Зал магазина. Тяните вверх, чтобы идти вперёд.' }, world, h('div', { class: 'st-fog' }), hint);
  const root = h('div', { class: 'view st' }, top.el, room);
  let data = null, vendor = '', cards = [], sheet = null, picked = null, alive = true, raf = 0, ro = null, sign = null, signZ = 0, max = 0;
  const look = { rx: 0, ry: 0, rxT: 0, ryT: 0 };

  const dims = () => { const s = getComputedStyle(root), n = (k) => parseFloat(s.getPropertyValue(k)) || 0; return { x: n('--st-x'), gap: n('--st-gap'), ch: n('--st-ch') }; };
  // z is how far you have walked. It is a spring: a wheel tick, a key or a flick only move its target, and a drag takes it in hand.
  const z = spring(0, { damping: 1, response: 0.55, onUpdate: paint });
  function paint() {
    const cz = z.value; world.style.transform = `translateZ(${cz.toFixed(1)}px) rotateX(${look.rx.toFixed(2)}deg) rotateY(${look.ry.toFixed(2)}deg)`;
    if (sign) { sign.style.transform = `translate3d(0, -6%, ${(signZ - cz * 0.82).toFixed(1)}px)`; sign.style.setProperty('--sx', `${(50 + look.ry * 5).toFixed(1)}%`); }       // the sign drifts ahead of you, so you never walk through it
    for (const c of cards) { const ahead = -(c.z + cz), fog = clamp((ahead - 320) / 1900, 0, 0.94), gone = ahead < -140;            // how far in front of the viewer this card hangs
      if (c.fog !== fog) { c.fog = fog; c.haze.style.opacity = fog.toFixed(3); } if (c.gone !== gone) { c.gone = gone; c.el.style.opacity = gone ? '0' : '1'; } c.el.style.pointerEvents = gone || fog > 0.85 ? 'none' : ''; }
    hint.classList.toggle('away', cz > 40);
  }
  function lookFrame() { raf = 0; look.rx += (look.rxT - look.rx) * 0.08; look.ry += (look.ryT - look.ry) * 0.08; paint(); if (Math.abs(look.rxT - look.rx) > 0.01 || Math.abs(look.ryT - look.ry) > 0.01) kick(); }
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(lookFrame); };
  const walk = (dz) => z.to(clamp((z.moving ? z.target : z.value) + dz, 0, max));

  function build() {
    const list = data.items.filter((p) => !vendor || p.vendor === vendor), { x, gap, ch } = dims(), per = Math.ceil(list.length / 2), depth = 160 + Math.max(0, per - 1) * gap;
    cards = list.map((p, i) => { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), cz = -(160 + k * gap), haze = h('span', { class: 'st-haze' });
      const el = h('button', { class: 'st-card', 'aria-label': `${p.name}, ${money(p.price, p.currency)}`, style: `transform: translate3d(${side * x}px, 0, ${cz}px) rotateY(${-side * 50}deg); --i:${i}`, onclick: () => open(p, el), onfocus: () => z.to(clamp(-cz - 320, 0, max)) },
        h('span', { class: 'st-hook' }), h('span', { class: 'st-in' },
          h('span', { class: 'st-photo' }, p.pictures[0] ? h('img', { src: p.pictures[0], alt: '', draggable: 'false', loading: i < 8 ? 'eager' : 'lazy', decoding: 'async', onerror: (e) => { e.target.remove(); el.classList.add('noimg'); } }) : null, h('span', { class: 'st-noimg' }, p.vendor)),
          h('span', { class: 'st-label' }, h('b', null, p.name), h('i', null, money(p.price, p.currency))), haze));
      if (!p.pictures[0]) el.classList.add('noimg'); return { el, z: cz, haze, p }; });
    max = Math.max(0, depth - 420); z.jump(0);
    const bar = (side) => h('div', { class: 'st-bar', style: `width:${depth + 300}px; transform: translate3d(${side * x}px, ${-ch / 2 - 30}px, ${-(depth + 300) / 2 + 40}px) rotateY(90deg)` });
    // the sign has real depth: a stack of the same letters going back, bright chrome in front, dark steel behind
    const letters = (text, tag) => h(tag, null, Array.from({ length: 10 }, (_, k) => h('i', { style: `--k:${k}`, 'aria-hidden': k ? 'true' : null }, text)));
    signZ = -Math.min(depth * 0.3, 640); sign = h('div', { class: 'st-sign' }, letters('VITON13', 'span'), letters('STORE', 'em'));
    world.replaceChildren(h('div', { class: 'st-floor', style: `height:${depth + 1600}px` }), bar(-1), bar(1), sign, ...cards.map((c) => c.el));
    top.count(`${list.length} ${plural(list.length)}`); paint();
    if (!reduced()) { z.jump(-520); z.to(0); }                                                       // you step into the hall
  }
  function paintPills() { const pill = (id, name) => h('button', { class: 'w-pill w-press st-pill' + (id === vendor ? ' on' : ''), 'aria-pressed': String(id === vendor), onclick: () => { if (id === vendor) return; vendor = id; close(true); paintPills(); build(); } }, name);
    pills.replaceChildren(pill('', 'Все'), ...data.vendors.map((v) => pill(v.name, v.name.replace(/^VITON13 /, '')))); }

  // ── the product card: it materialises out of the thing on the rail and goes back into it ──
  const flight = (from, to) => `translate(${(from.left - to.left).toFixed(1)}px, ${(from.top - to.top).toFixed(1)}px) scale(${(from.width / to.width).toFixed(4)}, ${(from.height / to.height).toFixed(4)})`;
  function close(now) { const s = sheet, card = picked; if (!s) return; sheet = null; picked = null; root.classList.remove('st-open'); card?.classList.remove('picked');
    const from = card?.isConnected && card.style.opacity !== '0' ? card.getBoundingClientRect() : null, to = s.getBoundingClientRect();
    if (now || reduced() || !from || !from.width || !s.animate) return s.remove();
    s.animate([{ transform: 'none', opacity: 1, filter: 'blur(0px)' }, { transform: flight(from, to), opacity: 0, filter: 'blur(10px)' }], { duration: 340, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' }).finished.then(() => s.remove(), () => s.remove()); }
  function open(p, card) {
    close(true); const main = h('img', { class: 'st-main', src: p.pictures[0] || '', alt: p.name, onerror: (e) => e.target.classList.add('hide') });
    const thumbs = p.pictures.length > 1 && h('div', { class: 'st-thumbs' }, p.pictures.map((src, i) => { const b = h('button', { class: 'w-press' + (i ? '' : ' on'), 'aria-label': `Фото ${i + 1}`, onclick: () => { main.classList.remove('hide'); main.src = src; thumbs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } }, h('img', { src, alt: '', loading: 'lazy', onerror: (e) => e.target.parentNode.remove() })); return b; }));
    const price = money(p.price, p.currency);
    sheet = h('aside', { class: 'st-sheet glass', role: 'dialog', 'aria-label': p.name }, h('button', { class: 'icon-btn w-press st-close', 'aria-label': 'Закрыть', onclick: () => close() }, icon('plus')),
      h('div', { class: 'st-sheet-in scroll' }, h('div', { class: 'st-gallery' }, main), thumbs, h('div', { class: 'cap' }, [p.vendor, p.category].filter(Boolean).join(' · ')), h('h2', null, p.name), price && h('div', { class: 'st-price' }, price, !p.available && h('small', null, 'нет в наличии')),
        p.description && h('p', null, p.description), p.params.length ? h('dl', { class: 'st-params' }, p.params.map((x) => [h('dt', null, x.name), h('dd', null, x.value)])) : null,
        h('div', { class: 'st-acts' }, h('a', { class: 'btn w-press', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть на сайте', icon('out')),
          h('button', { class: 'btn ghost w-press', onclick: () => ctx.askVit(`Найди дешевле похожую вещь: «${p.name}» (${p.vendor}). В VITON13 Store она стоит ${price}.`) }, 'Попросить VIT найти дешевле'))));
    root.append(sheet); root.classList.add('st-open'); picked = card || null; card?.classList.add('picked');
    const from = card?.getBoundingClientRect(), to = sheet.getBoundingClientRect();
    if (!reduced() && from?.width && sheet.animate) sheet.animate([{ transform: flight(from, to), opacity: 0.2, filter: 'blur(12px)', borderRadius: '14px' }, { transform: 'none', opacity: 1, filter: 'blur(0px)' }], { duration: 560, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.04)' });
  }

  // ── walking and looking around ──
  let z0 = 0, zh = [];
  const offDrag = drag(room, {
    onStart: (e) => { if (e.target.closest('.st-sheet')) return false; room.classList.add('drag'); z0 = z.value; z.hold(); zh = [[performance.now(), z0]]; },
    onMove: (_dx, dy) => { let nz = z0 - dy * 3; if (nz < 0) nz = -rubber(-nz, 500); else if (nz > max) nz = max + rubber(nz - max, 500); z.hold(nz); zh.push([performance.now(), nz]); if (zh.length > 8) zh.shift(); },
    onEnd: () => { room.classList.remove('drag'); const now = performance.now(), rec = zh.filter((p) => now - p[0] < 100), a = rec[0], b = rec[rec.length - 1], dt = a && b ? (b[0] - a[0]) / 1000 : 0, v = dt > 0.01 ? (b[1] - a[1]) / dt : 0;
      z.to(clamp(z.value + project(v), 0, max), v); } });                                           // the flick is projected forward, like a scroll that keeps going
  room.addEventListener('wheel', (e) => { e.preventDefault(); walk((Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 1.15); }, { passive: false });
  room.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || e.buttons) return; const r = room.getBoundingClientRect(); look.ryT = ((e.clientX - r.left) / r.width - 0.5) * 9; look.rxT = (0.5 - (e.clientY - r.top) / r.height) * 4; kick(); });
  room.addEventListener('pointerleave', () => { look.rxT = look.ryT = 0; kick(); });
  const onKey = (e) => { if (!root.isConnected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'Escape') return close();
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); walk(260); } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); walk(-260); } };
  window.addEventListener('keydown', onKey);

  ready.then(() => { if (alive && !data) world.replaceChildren(h('div', { class: 'st-skel' }, skeleton(h, 5, 'st-sk-card'))); });
  Promise.all([api('/api/store'), ready]).then(([d]) => { if (!alive) return; data = d;
    if (!d.available || !d.items.length) { room.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Магазин сейчас недоступен'), 'Не получилось получить каталог с сайта. ', h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть VITON13 Store в браузере'))); return; }
    paintPills(); build(); let w = room.clientWidth; ro = new ResizeObserver(() => { if (Math.abs(room.clientWidth - w) > 40) { w = room.clientWidth; const keep = z.value; build(); z.jump(clamp(keep, 0, max)); } }); ro.observe(room);
  }).catch((e) => { if (alive) room.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Магазин не открылся'), e.message)); });

  return { root, destroy() { alive = false; cancelAnimationFrame(raf); z.stop(); ro?.disconnect(); offDrag(); window.removeEventListener('keydown', onKey); } };
}
