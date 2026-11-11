// VITON13 Store in VIT: a virtual hall. Two rails of real products run into the fog, the chrome sign hangs in the aisle,
// the hall turns a little after the pointer, and you walk it with the wheel, a swipe or the arrow keys. No cart here: the site sells, VIT helps.
const money = (n, cur) => (!n ? '' : cur === 'USD' ? '$' + n.toLocaleString('en-US') : cur === 'RUR' || cur === 'RUB' ? n.toLocaleString('ru-RU') + ' ₽' : `${n.toLocaleString('ru-RU')} ${cur}`);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export default function view(ctx) {
  const { h, icon, api, css } = ctx; css('/worlds/store.css');
  const sheetLink = document.querySelector('link[href="/worlds/store.css"]');                         // sizes live in the stylesheet: wait for it before measuring
  const styled = !sheetLink || sheetLink.sheet ? Promise.resolve() : new Promise((r) => { sheetLink.addEventListener('load', r, { once: true }); sheetLink.addEventListener('error', r, { once: true }); });
  const pills = h('div', { class: 'st-pills' }), count = h('span', { class: 'cap' });
  const world = h('div', { class: 'st-world' }), room = h('div', { class: 'st-room', tabindex: '0', 'aria-label': 'Зал магазина' }, world, h('div', { class: 'st-fog' }), h('div', { class: 'cap st-hint' }, 'Колесо, свайп или стрелки — идти по залу'));
  const root = h('div', { class: 'view st' }, h('div', { class: 'st-head' }, h('div', { class: 'st-brand' }, h('b', null, 'VITON13 STORE'), count), pills), room);
  let data = null, vendor = '', cards = [], sheet = null, alive = true, raf = 0, ro = null, sign = null, signZ = 0;
  const cam = { z: 0, zT: 0, rx: 0, ry: 0, rxT: 0, ryT: 0, max: 0 };

  const dims = () => { const s = getComputedStyle(root), n = (k) => parseFloat(s.getPropertyValue(k)) || 0; return { x: n('--st-x'), gap: n('--st-gap'), ch: n('--st-ch') }; };
  function frame() {
    raf = 0; cam.z += (cam.zT - cam.z) * 0.1; cam.rx += (cam.rxT - cam.rx) * 0.08; cam.ry += (cam.ryT - cam.ry) * 0.08;
    world.style.transform = `translateZ(${cam.z.toFixed(1)}px) rotateX(${cam.rx.toFixed(2)}deg) rotateY(${cam.ry.toFixed(2)}deg)`;
    if (sign) sign.style.transform = `translate3d(0, -4%, ${(signZ - cam.z * 0.82).toFixed(1)}px)`;                          // the sign drifts ahead of you, so you never walk through it
    for (const c of cards) { const ahead = -(c.z + cam.z), fog = clamp((ahead - 320) / 1900, 0, 0.94), gone = ahead < -140;            // how far in front of the viewer this card hangs
      c.haze.style.opacity = fog.toFixed(3); c.el.style.opacity = gone ? '0' : '1'; c.el.style.pointerEvents = gone || fog > 0.85 ? 'none' : ''; }
    if (Math.abs(cam.zT - cam.z) > 0.4 || Math.abs(cam.rxT - cam.rx) > 0.01 || Math.abs(cam.ryT - cam.ry) > 0.01) kick();
  }
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };
  const walk = (dz) => { cam.zT = clamp(cam.zT + dz, 0, cam.max); kick(); };

  function build() {
    const list = data.items.filter((p) => !vendor || p.vendor === vendor), { x, gap, ch } = dims(), per = Math.ceil(list.length / 2), depth = 160 + Math.max(0, per - 1) * gap;
    cards = list.map((p, i) => { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), z = -(160 + k * gap), haze = h('span', { class: 'st-haze' });
      const el = h('button', { class: 'st-card', 'aria-label': `${p.name}, ${money(p.price, p.currency)}`, style: `transform: translate3d(${side * x}px, 0, ${z}px) rotateY(${-side * 50}deg)`, onclick: () => open(p), onfocus: () => { cam.zT = clamp(-z - 320, 0, cam.max); kick(); } },
        h('span', { class: 'st-photo' }, p.pictures[0] ? h('img', { src: p.pictures[0], alt: '', loading: i < 8 ? 'eager' : 'lazy', decoding: 'async', onerror: (e) => { e.target.remove(); el.classList.add('noimg'); } }) : null, h('span', { class: 'st-noimg' }, p.vendor)),
        h('span', { class: 'st-label' }, h('b', null, p.name), h('i', null, money(p.price, p.currency))), haze);
      if (!p.pictures[0]) el.classList.add('noimg'); return { el, z, haze }; });
    cam.max = Math.max(0, depth - 420); cam.z = cam.zT = 0;
    const bar = (side) => h('div', { class: 'st-bar', style: `width:${depth + 300}px; transform: translate3d(${side * x}px, ${-ch / 2 - 22}px, ${-(depth + 300) / 2 + 40}px) rotateY(90deg)` });
    signZ = -Math.min(depth * 0.3, 640); sign = h('div', { class: 'st-sign' }, h('span', null, 'VITON13'), h('em', null, 'STORE'));
    world.replaceChildren(h('div', { class: 'st-floor', style: `height:${depth + 1600}px` }), bar(-1), bar(1), sign, ...cards.map((c) => c.el));
    count.textContent = `${list.length} ${plural(list.length)}`; kick();
  }
  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'вещь' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'вещи' : 'вещей');
  function paintPills() { const pill = (id, name) => h('button', { class: 'st-pill' + (id === vendor ? ' on' : ''), 'aria-pressed': String(id === vendor), onclick: () => { vendor = id; close(); paintPills(); build(); } }, name);
    pills.replaceChildren(pill('', 'Все'), ...data.vendors.map((v) => pill(v.name, v.name.replace(/^VITON13 /, '')))); }

  function close() { sheet?.remove(); sheet = null; root.classList.remove('st-open'); }
  function open(p) {
    close(); const main = h('img', { class: 'st-main', src: p.pictures[0] || '', alt: p.name, onerror: (e) => e.target.classList.add('hide') });
    const thumbs = p.pictures.length > 1 && h('div', { class: 'st-thumbs' }, p.pictures.map((src, i) => { const b = h('button', { class: i ? '' : 'on', 'aria-label': `Фото ${i + 1}`, onclick: () => { main.classList.remove('hide'); main.src = src; thumbs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } }, h('img', { src, alt: '', loading: 'lazy', onerror: (e) => e.target.parentNode.remove() })); return b; }));
    const price = money(p.price, p.currency);
    sheet = h('aside', { class: 'st-sheet glass', role: 'dialog', 'aria-label': p.name }, h('button', { class: 'icon-btn st-close', 'aria-label': 'Закрыть', onclick: close }, icon('plus')),
      h('div', { class: 'st-sheet-in scroll' }, h('div', { class: 'st-gallery' }, main), thumbs, h('div', { class: 'cap' }, [p.vendor, p.category].filter(Boolean).join(' · ')), h('h2', null, p.name), price && h('div', { class: 'st-price' }, price, !p.available && h('small', null, 'нет в наличии')),
        p.description && h('p', null, p.description), p.params.length ? h('dl', { class: 'st-params' }, p.params.map((x) => [h('dt', null, x.name), h('dd', null, x.value)])) : null,
        h('div', { class: 'st-acts' }, h('a', { class: 'btn', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть на сайте', icon('out')),
          h('button', { class: 'btn ghost', onclick: () => ctx.askVit(`Найди дешевле похожую вещь: «${p.name}» (${p.vendor}). В VITON13 Store она стоит ${price}.`) }, 'Попросить VIT найти дешевле'))));
    root.append(sheet); root.classList.add('st-open');
  }

  // walking and looking around
  let py = null;
  room.addEventListener('wheel', (e) => { e.preventDefault(); walk((Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 1.1); }, { passive: false });
  room.addEventListener('pointermove', (e) => { if (py != null) { walk((py - e.clientY) * 3.2); py = e.clientY; return; } if (e.pointerType !== 'mouse') return; const r = room.getBoundingClientRect(); cam.ryT = ((e.clientX - r.left) / r.width - 0.5) * 9; cam.rxT = (0.5 - (e.clientY - r.top) / r.height) * 4; kick(); });
  room.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') py = e.clientY; });
  const up = () => { py = null; }; window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  room.addEventListener('pointerleave', () => { cam.rxT = cam.ryT = 0; kick(); });
  const onKey = (e) => { if (!root.isConnected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'Escape') return close();
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); walk(240); } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); walk(-240); } };
  window.addEventListener('keydown', onKey);

  world.append(h('div', { class: 'empty' }, 'Открываю магазин…'));
  Promise.all([api('/api/store'), styled]).then(([d]) => { if (!alive) return; data = d;
    if (!d.available || !d.items.length) { room.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Магазин сейчас недоступен'), 'Не получилось получить каталог с сайта. ', h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, 'Открыть VITON13 Store в браузере'))); return; }
    paintPills(); build(); let w = room.clientWidth; ro = new ResizeObserver(() => { if (Math.abs(room.clientWidth - w) > 40) { w = room.clientWidth; build(); } }); ro.observe(room);
  }).catch((e) => { if (alive) room.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Магазин не открылся'), e.message)); });

  return { root, destroy() { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); } };
}
