// World «Медицина»: a sculpted 3D human you can turn and touch. Pick a zone on the body or in the list — it lights up on the
// surface, the camera turns to it and a card tells what is there, why people get it checked and when it is urgent.
// The texts are navigation, not diagnosis (they come from VITON13 MEDICINE, lib/bodyRegions.ts).
import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/GLTFLoader.js';
import { DRACOLoader } from '/vendor/three/DRACOLoader.js';
import { OrbitControls } from '/vendor/three/OrbitControls.js';

const BASE = '/worlds/medicine';
// glow: [x, y, depth-side, radius] in body units (height = 1, feet at 0, +x = the person's left, +z = front). mark: where the dot sits.
const ZONES = [
  { key: 'head', title: 'Голова и шея', organ: 'brain', organName: 'Головной мозг', side: 1, glow: [[0, 0.925, 0, 0.11]], mark: [0, 0.94],
    summary: 'Головной мозг, его оболочки и сосуды, органы чувств, щитовидная железа.',
    contains: ['Головной мозг и мозжечок', 'Оболочки мозга и сосуды', 'Глаза, уши, носовые пазухи', 'Щитовидная и паращитовидные железы'],
    complaints: ['Головная боль', 'Головокружение', 'Нарушение сна', 'Снижение памяти и концентрации', 'Шум в ушах'],
    redFlags: ['Внезапная сильнейшая головная боль', 'Асимметрия лица, слабость в руке или ноге', 'Нарушение речи или зрения', 'Спутанность сознания'] },
  { key: 'heart', title: 'Сердце', organ: 'heart', organName: 'Сердце', side: 1, glow: [[0.03, 0.735, 1, 0.062]], mark: [0.03, 0.735],
    summary: 'Сердечная мышца, клапаны и коронарные сосуды, которые её питают.',
    contains: ['Четыре камеры сердца', 'Клапаны сердца', 'Коронарные артерии', 'Начальный отдел аорты'],
    complaints: ['Боль или давление в груди', 'Перебои и учащённое сердцебиение', 'Одышка при нагрузке', 'Отёки к вечеру', 'Повышенное давление'],
    redFlags: ['Давящая боль за грудиной дольше 15 минут', 'Боль отдаёт в челюсть, левую руку или спину', 'Одышка в покое, холодный пот', 'Обморок'] },
  { key: 'chest', title: 'Грудная клетка и лёгкие', organ: 'lungs', organName: 'Лёгкие и дыхательные пути', side: 1, glow: [[-0.072, 0.74, 1, 0.082], [0.072, 0.74, 1, 0.082]], mark: [-0.072, 0.748],
    summary: 'Лёгкие, бронхи и трахея — весь путь воздуха до альвеол.',
    contains: ['Правое и левое лёгкое', 'Бронхиальное дерево', 'Трахея', 'Плевра и диафрагма'],
    complaints: ['Кашель', 'Одышка', 'Свистящее дыхание', 'Боль при глубоком вдохе', 'Затяжная простуда'],
    redFlags: ['Нехватка воздуха в покое', 'Кровь в мокроте', 'Синева губ или пальцев', 'Температура выше 39 °C с одышкой'] },
  { key: 'abdomen', title: 'Верх живота', organ: 'liver', organName: 'Печень и жёлчный пузырь', side: 1, glow: [[0, 0.64, 1, 0.09]], mark: [0, 0.64],
    summary: 'Желудок, печень, жёлчный пузырь, поджелудочная железа и селезёнка.',
    contains: ['Печень и жёлчный пузырь', 'Желудок и пищевод', 'Поджелудочная железа', 'Селезёнка'],
    complaints: ['Тяжесть и боль под рёбрами', 'Изжога и отрыжка', 'Тошнота', 'Горечь во рту', 'Непереносимость жирной пищи'],
    redFlags: ['Желтизна кожи или белков глаз', 'Рвота с кровью, чёрный стул', 'Резкая опоясывающая боль', 'Твёрдый болезненный живот'] },
  { key: 'kidneys', title: 'Почки и мочевые пути', organ: 'kidneys', organName: 'Почки и мочевыводящие пути', side: -1, glow: [[-0.055, 0.632, -1, 0.066], [0.055, 0.632, -1, 0.066]], mark: [0.055, 0.632],
    summary: 'Почки, мочеточники и мочевой пузырь — фильтрация и вывод жидкости.',
    contains: ['Правая и левая почка', 'Мочеточники', 'Мочевой пузырь', 'Надпочечники'],
    complaints: ['Боль в пояснице', 'Частое или болезненное мочеиспускание', 'Отёки на лице по утрам', 'Изменение цвета мочи'],
    redFlags: ['Кровь в моче', 'Боль в пояснице с высокой температурой', 'Резкая приступообразная боль в боку', 'Отсутствие мочи больше суток'] },
  { key: 'pelvis', title: 'Низ живота и таз', organ: 'intestines', organName: 'Кишечник', side: 1, glow: [[0, 0.522, 1, 0.095]], mark: [0, 0.522],
    summary: 'Кишечник, органы малого таза и тазовое дно.',
    contains: ['Тонкий кишечник', 'Толстый кишечник и прямая кишка', 'Органы малого таза', 'Мышцы тазового дна'],
    complaints: ['Вздутие и спазмы', 'Запор или диарея', 'Боль внизу живота', 'Изменение стула'],
    redFlags: ['Кровь в стуле', 'Боль внизу живота справа с температурой', 'Задержка стула и газов со рвотой', 'Резкое похудение без причины'] },
];
const SVG = { chev: '<path d="M9 5.500l6.500 6.500L9 18.500"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', spark: '<path d="M12 3.500l1.900 5.100 5.100 1.900-5.100 1.900-1.900 5.100-1.900-5.100-5.100-1.900 5.100-1.900z"/>' };

/** Draco-compressed GLB → one mesh group normalised so that the largest side (or the height) is `size`, centred, standing on y = 0. */
function loaders() { const draco = new DRACOLoader(); draco.setDecoderPath('/vendor/three/draco/'); const gltf = new GLTFLoader(); gltf.setDRACOLoader(draco); return { gltf, draco }; }
function normalise(root, material, byHeight, to = 1) {
  root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = to / (byHeight ? size.y : Math.max(size.x, size.y, size.z));
  const g = new THREE.Group(); root.position.set(-c.x, byHeight ? -box.min.y : -c.y, -c.z); g.add(root); g.scale.setScalar(k);
  root.traverse((o) => { if (o.isMesh) { o.material = material; o.castShadow = true; o.receiveShadow = false; } });
  g.updateMatrixWorld(true); return g;
}
const disposeTree = (o) => o?.traverse((m) => { m.geometry?.dispose(); });

// Real counts only: everything a widget shows is counted from the zone texts above.
const TOTAL = { zones: ZONES.length, contains: ZONES.reduce((n, z) => n + z.contains.length, 0), complaints: ZONES.reduce((n, z) => n + z.complaints.length, 0), flags: ZONES.reduce((n, z) => n + z.redFlags.length, 0) };
/** A ring indicator like the ones on visionOS widgets: coloured arcs that add up, a big number in the middle. */
function ring(h, parts, total, big, small) {
  const R = 26, C = 2 * Math.PI * R, gap = parts.length > 1 ? 3.2 : 0; let at = 0;
  const arcs = parts.map(([v, color], i) => { const len = Math.max(0, (v / total) * C - gap); const el = `<circle r="${R}" cx="32" cy="32" fill="none" stroke="${color}" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" style="--len:${len.toFixed(2)};--i:${i}"/>`; at += (v / total) * C; return el; }).join('');
  return h('div', { class: 'md-ring' }, h('span', { style: 'display:contents', html: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle r="${R}" cx="32" cy="32" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="5.5"/><g transform="rotate(-90 32 32)">${arcs}</g></svg>` }),
    h('span', { class: 'md-ring-n' }, h('b', null, big), small && h('small', null, small)));
}
/** The two widgets under the list of zones: the whole map, or the chosen zone. */
function widgets(h, z) {
  const i = z ? ZONES.indexOf(z) : -1, hot = 'var(--hot)', bad = 'var(--bad)', ok = 'var(--ok)', blue = 'var(--accent)';
  const legend = (rows) => h('ul', { class: 'md-legend' }, rows.map(([c, t]) => h('li', null, h('i', { style: `background:${c}` }), t)));
  const a = z
    ? h('div', { class: 'md-widget glass' }, h('div', { class: 'md-wt' }, 'Зона'), h('div', { class: 'md-wrow' }, ring(h, [[i + 1, hot]], TOTAL.zones, String(i + 1), `из ${TOTAL.zones}`), legend([[blue, `${z.contains.length} ${pl(z.contains.length, 'структура', 'структуры', 'структур')}`], [hot, `${z.complaints.length} ${pl(z.complaints.length, 'повод', 'повода', 'поводов')}`], [bad, `${z.redFlags.length} ${pl(z.redFlags.length, 'флаг', 'флага', 'флагов')}`]])))
    : h('div', { class: 'md-widget glass' }, h('div', { class: 'md-wt' }, 'Карта тела'), h('div', { class: 'md-wrow' }, ring(h, [[TOTAL.contains, blue], [TOTAL.complaints, hot], [TOTAL.flags, bad]], TOTAL.contains + TOTAL.complaints + TOTAL.flags, String(TOTAL.zones), 'зон'), legend([[blue, `${TOTAL.contains} структур`], [hot, `${TOTAL.complaints} поводов`], [bad, `${TOTAL.flags} флагов`]])));
  const b = z
    ? h('div', { class: 'md-widget glass' }, h('div', { class: 'md-wt' }, 'Когда к врачу'), h('div', { class: 'md-wrow' }, ring(h, [[z.complaints.length, ok], [z.redFlags.length, bad]], z.complaints.length + z.redFlags.length, String(z.redFlags.length), 'срочно'), legend([[ok, 'Плановая проверка'], [bad, 'Срочно: 103 или 112']])))
    : h('div', { class: 'md-widget glass' }, h('div', { class: 'md-wt' }, 'Как пользоваться'), h('p', { class: 'md-wp' }, 'Нажмите на точку на теле или на зону в списке. Тело вращается мышью или пальцем.'));
  return [a, b];
}
const pl = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many);
/** The zone card: what is there, why people get it checked, when it is urgent. Same in 3D and in the flat view. */
function zoneCard(h, ctx, svg, z, organNode, close) {
  const sect = (title, items, cls) => h('section', { class: 'md-sect ' + (cls || '') }, h('div', { class: 'cap' }, title), h('ul', null, items.map((t) => h('li', null, t))));
  return [h('button', { class: 'icon-btn w-press md-close', 'aria-label': 'Закрыть карточку', onclick: close }, svg('x')),
    h('div', { class: 'md-card-top' }, h('div', { class: 'md-organ' }, organNode), h('div', null, h('div', { class: 'cap' }, `Зона ${ZONES.indexOf(z) + 1} из ${ZONES.length}`), h('h2', null, z.title), h('p', null, z.summary))),
    sect('Что здесь находится', z.contains), sect('Частые поводы провериться', z.complaints), sect('Красные флаги — срочно к врачу', z.redFlags, 'md-flags'),
    h('button', { class: 'btn w-press md-ask', onclick: () => ctx.askVit(`Расскажи про зону «${z.title}»: что здесь находится, на какие симптомы обращать внимание и когда нужно срочно к врачу.`) }, svg('spark'), 'Спросить VIT'),
    h('p', { class: 'md-note' }, 'Это навигация, а не диагноз. При красных флагах звоните 103 или 112.'),
    h('p', { class: 'md-credit' }, `Орган: ${z.organName}. Модель — `, h('a', { href: 'https://www.z-anatomy.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Z-Anatomy'), ', CC BY-SA 4.0. Фигура — Blender Studio, CC0.')];
}
const webglOK = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

// ── the flat view: when this machine cannot draw 3D, the world still opens — the same figure as a studio render, the same zones and cards ──
// Poster geometry (560×1200 renders): the body spans 6.5 %…93.2 % of the height, centred; one body unit = 1.857 poster widths.
const POSTER = { top: 0.065, foot: 0.932, k: 1.857 };
function flatView(ctx, why) {
  const { h } = ctx; ctx.css('/worlds/_ui.css'); ctx.css(`${BASE}.css`);
  const svg = (name) => h('span', { style: 'display:contents', html: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>` });
  let sex = 'male', picked = null;
  const img = h('img', { class: 'md-flat-img', alt: 'Фигура человека спереди', draggable: 'false' }), glow = h('div', { class: 'md-flat-glow' }), marks = h('div', { class: 'md-flat-marks' });
  const fig = h('div', { class: 'md-flat-fig' }, img, glow, marks), stage = h('div', { class: 'md-stage md-flat' }, fig);
  const list = h('div', { class: 'md-list' }), card = h('aside', { class: 'md-card glass scroll', 'aria-live': 'polite' }), wbox = h('div', { class: 'md-widgets' });
  const sexSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Фигура' });
  const root = h('div', { class: 'view md-root md-is-flat' }, stage,
    h('header', { class: 'md-head' }, h('div', { class: 'cap' }, 'VITON13 MEDICINE'), h('h1', null, 'Карта тела'), h('p', null, 'Нажмите на точку на теле или выберите зону в списке')),
    h('nav', { class: 'md-side' }, h('div', { class: 'md-panel glass w-mat', style: '--d:1' }, h('div', { class: 'md-side-head' }, h('b', null, 'Зоны тела'), h('span', { class: 'cap' }, String(ZONES.length))), list, h('p', { class: 'md-note' }, 'Это навигация, а не диагноз.')), wbox),
    card, h('div', { class: 'md-bar glass' }, sexSeg, h('button', { class: 'md-pill w-press', onclick: () => select(null) }, 'Сброс')), h('div', { class: 'md-flat-why cap' }, why));
  const rows = new Map(), dots = new Map();
  const place = (z) => ({ x: 0.5 + (z.side < 0 ? 0.11 : z.mark[0]) * POSTER.k * 0.4667, y: POSTER.foot - z.mark[1] * (POSTER.foot - POSTER.top) });       // 0.4667 = 560 / 1200; zones on the back sit at the flank of the front view
  for (const z of ZONES) {
    rows.set(z.key, list.appendChild(h('button', { class: 'md-row w-press', 'aria-pressed': 'false', onclick: () => select(picked === z ? null : z), onpointerenter: () => hover(z), onpointerleave: () => hover(null) }, h('i'), h('span', null, z.title), svg('chev'))));
    const p = place(z); dots.set(z.key, marks.appendChild(h('button', { class: 'md-mark', style: `left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%;opacity:1`, 'aria-label': z.title, onclick: () => select(picked === z ? null : z), onpointerenter: () => hover(z), onpointerleave: () => hover(null) }, h('i'), h('span', null, z.title))));
  }
  function glowAt(z, strong) { if (!z) { glow.style.opacity = 0; return; } const p = place(z), r = Math.max(...z.glow.map((g) => g[3])) * (z.glow.length > 1 ? 1.9 : 1.2);
    glow.style.cssText = `left:${(p.x * 100).toFixed(2)}%;top:${(p.y * 100).toFixed(2)}%;width:${(r * POSTER.k * 100 * 2).toFixed(1)}%;opacity:${strong ? 1 : 0.45}`; }
  function hover(z) { if (!picked) glowAt(z, false); for (const [k, d] of dots) d.classList.toggle('hover', z?.key === k); }
  function select(z) { picked = z; glowAt(z, true);
    for (const [k, r] of rows) { r.classList.toggle('on', z?.key === k); r.setAttribute('aria-pressed', String(z?.key === k)); } for (const [k, d] of dots) d.classList.toggle('on', z?.key === k);
    root.classList.toggle('picked', !!z); wbox.replaceChildren(...widgets(h, z));
    if (!z) return card.replaceChildren();
    card.replaceChildren(...zoneCard(h, ctx, svg, z, h('img', { class: 'md-organ-poster', src: `${BASE}/organs/${z.organ}-poster.webp`, alt: '' }), () => select(null))); card.scrollTop = 0; }
  function setSex(next) { sex = next; img.src = `${BASE}/body/${sex}-poster.webp`;
    sexSeg.replaceChildren(...[['male', 'Муж', 'чина'], ['female', 'Жен', 'щина']].map(([id, a, b]) => h('button', { class: id === sex ? 'on' : '', 'aria-pressed': String(id === sex), 'aria-label': a + b, onclick: () => id !== sex && setSex(id) }, a, h('span', null, b)))); }
  img.addEventListener('load', () => stage.classList.add('shown'), { once: true });
  const onKey = (e) => { if (e.key === 'Escape' && picked) select(null); }; document.addEventListener('keydown', onKey);
  setSex('male'); wbox.replaceChildren(...widgets(h, null));
  return { root, destroy() { document.removeEventListener('keydown', onKey); } };
}

export default function view(ctx) {
  if (!webglOK()) return flatView(ctx, 'Упрощённый вид: 3D на этом устройстве не запускается');
  const { h } = ctx; ctx.css('/worlds/_ui.css'); ctx.css(`${BASE}.css`);
  const svg = (name) => h('span', { style: 'display:contents', html: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>` });
  const canvas = h('canvas', { class: 'md-canvas', 'aria-label': 'Трёхмерная фигура человека. Нажмите на зону тела.' }), marks = h('div', { class: 'md-marks' }), loading = h('div', { class: 'md-loading cap' }, 'Загружаю фигуру…');
  const stage = h('div', { class: 'md-stage' }, canvas, marks, loading);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); loading.textContent = '3D-фигура остановилась. Откройте раздел ещё раз.'; loading.classList.remove('hide'); });
  const list = h('div', { class: 'md-list' }), card = h('aside', { class: 'md-card glass scroll', 'aria-live': 'polite' }), wbox = h('div', { class: 'md-widgets' });
  const sexSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Фигура' });
  const bar = h('div', { class: 'md-bar glass' },
    h('button', { class: 'md-pill w-press', onclick: () => lookAt(0) }, 'Перед'), h('button', { class: 'md-pill w-press', onclick: () => lookAt(Math.PI) }, 'Спина'), sexSeg,
    h('button', { class: 'md-pill w-press', onclick: () => { select(null); lookAt(0.35, true); } }, 'Сброс'));
  const root = h('div', { class: 'view md-root' }, stage,
    h('header', { class: 'md-head' }, h('div', { class: 'cap' }, 'VITON13 MEDICINE'), h('h1', null, 'Карта тела'), h('p', null, 'Нажмите на зону тела или выберите её в списке')),
    h('nav', { class: 'md-side', 'aria-label': 'Зоны тела' }, h('div', { class: 'md-panel glass w-mat', style: '--d:1' }, h('div', { class: 'md-side-head' }, h('b', null, 'Зоны тела'), h('span', { class: 'cap' }, String(ZONES.length))), list, h('p', { class: 'md-note' }, 'Это навигация, а не диагноз.')), wbox),
    card, bar);

  // ── scene ──
  let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return flatView(ctx, 'Упрощённый вид: 3D на этом устройстве не запускается'); }
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(27, 1, 0.1, 30); camera.position.set(0.95, 0.68, 2.6);
  const controls = new OrbitControls(camera, canvas); controls.target.set(0, 0.53, 0); controls.enableDamping = true; controls.dampingFactor = 0.07; controls.enablePan = false; controls.rotateSpeed = 0.75;
  controls.minDistance = 1.25; controls.maxDistance = 4.4; controls.minPolarAngle = 0.95; controls.maxPolarAngle = 1.82; controls.autoRotate = true; controls.autoRotateSpeed = 0.7;
  const hemi = new THREE.HemisphereLight(0xcfdcff, 0x2b2622, 0.32), key = new THREE.DirectionalLight(0xfff1e2, 2.5), rim = new THREE.DirectionalLight(0x8fb6ff, 3.2), fill = new THREE.DirectionalLight(0xffd9c2, 0.35);
  key.position.set(1.9, 2.3, 1.7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012; key.shadow.radius = 5;
  Object.assign(key.shadow.camera, { left: -0.9, right: 0.9, top: 1.3, bottom: -0.3, near: 0.5, far: 7 }); key.target.position.set(0, 0.5, 0);
  rim.position.set(-1.8, 1.6, -2.2); fill.position.set(-1.6, 0.4, 1.4);
  const rig = new THREE.Group(); rig.add(key, key.target, rim, fill); scene.add(hemi, rig);                  // the lights turn with the camera: a studio turntable
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.ShadowMaterial({ opacity: 0.4 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const halo = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.72, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.5 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.002; return m; })();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.0012, 8, 120), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.6;
  scene.add(halo, ring);

  // the body material: matte clay with a soft sheen; the selected zone glows from inside the surface
  const U = { uZA: { value: new THREE.Vector4() }, uZB: { value: new THREE.Vector4() }, uHA: { value: new THREE.Vector4() }, uHB: { value: new THREE.Vector4() }, uGlow: { value: 0 }, uHover: { value: 0 }, uHot: { value: new THREE.Color('#ff8a2a') }, uRim: { value: new THREE.Color('#5d7dbb') }, uTime: { value: 0 } };
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xc9c2b9, roughness: 0.62, metalness: 0, sheen: 0.22, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff0e4) });
  skin.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform vec4 uZA, uZB, uHA, uHB; uniform float uGlow, uHover, uTime; uniform vec3 uHot, uRim;
      float zoneF(vec4 z) { return z.w <= 0.0 ? 0.0 : smoothstep(z.w, z.w * 0.12, distance(vWP, z.xyz)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float zg = max(zoneF(uZA), zoneF(uZB)) * uGlow, hg = max(zoneF(uHA), zoneF(uHB)) * uHover, pulse = 0.84 + 0.16 * sin(uTime * 2.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, uHot, zg * 0.42);
      totalEmissiveRadiance += uHot * (zg * pulse * 1.25 + hg * 0.28);`)
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.2);\n#include <opaque_fragment>'); };

  function palette() {                                                    // follows the app theme
    const cs = getComputedStyle(document.documentElement), light = ctx.theme() === 'aurora', axon = ctx.theme() === 'axon';
    const hot = new THREE.Color(cs.getPropertyValue('--hot').trim() || '#ff8a2a'); U.uHot.value.copy(hot); ring.material.color.copy(hot);
    skin.color.set(light ? 0xc4bdb5 : axon ? 0xd6d6de : 0xc9c2b9); U.uRim.value.set(light ? 0x2a3550 : axon ? 0x9a9ab0 : 0x5d7dbb);
    hemi.intensity = light ? 0.8 : 0.32; hemi.groundColor.set(light ? 0xd8d2cc : 0x2b2622); key.intensity = light ? 2.4 : 2.5; key.color.set(axon ? 0xffffff : 0xfff1e2); rim.intensity = light ? 1.2 : 3.2; rim.color.set(axon ? 0xffffff : 0x8fb6ff);
    floor.material.opacity = light ? 0.1 : 0.32; halo.material.opacity = light ? 0 : 0.5; renderer.toneMappingExposure = light ? 1.05 : 0.95;
  }
  const themeWatch = new MutationObserver(palette); themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); palette();

  // ── the figure ──
  const { gltf, draco } = loaders(), bodies = {}, ray = new THREE.Raycaster(); let body = null, sex = 'male', picked = null, hover = null, dead = false;
  const anchors = new Map();                                              // zone key → { glow: Vector4[], mark: Vector3, normal: Vector3 }
  function surface(x, y, side) {                                          // where a ray from the front/back meets the skin
    ray.set(new THREE.Vector3(x, y, side * 2), new THREE.Vector3(0, 0, -side)); const hit = ray.intersectObject(body, true)[0];
    return hit ? { p: hit.point, n: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) } : { p: new THREE.Vector3(x, y, side * 0.08), n: new THREE.Vector3(0, 0, side) };
  }
  function anchor() {
    for (const z of ZONES) {
      const glow = z.glow.map(([x, y, d, r]) => { if (!d) return new THREE.Vector4(x, y, 0, r); const s = surface(x, y, d); return new THREE.Vector4(x, y, s.p.z - d * r * 0.35, r); });
      const m = surface(z.mark[0], z.mark[1], z.side); anchors.set(z.key, { glow, mark: m.p.clone().addScaledVector(m.n, 0.012), normal: m.n });
    }
  }
  async function setSex(next) {
    sex = next; sexSeg.replaceChildren(...[['male', 'Муж', 'чина'], ['female', 'Жен', 'щина']].map(([id, a, b]) => h('button', { class: id === sex ? 'on' : '', 'aria-pressed': String(id === sex), 'aria-label': a + b, onclick: () => id !== sex && setSex(id) }, a, h('span', null, b))));
    if (!bodies[next]) { loading.classList.remove('hide'); try { bodies[next] = normalise((await gltf.loadAsync(`${BASE}/body/${next}.glb`)).scene, skin, true); } catch { loading.textContent = 'Не получилось загрузить фигуру'; return; } }
    if (dead || sex !== next) return;
    if (body) scene.remove(body); body = bodies[next]; scene.add(body); body.updateMatrixWorld(true); anchor(); loading.classList.add('hide'); applyZone(); stage.classList.add('shown');
  }

  // ── camera moves ──
  let fly = null, idleAt = performance.now(), shift = 0, shiftT = 0; const fv = { t: 0, p: 0, r: 0 };
  const sph = new THREE.Spherical(), tmp = new THREE.Vector3();
  function lookAt(theta, wide, zone) {
    const a = zone && anchors.get(zone.key); fly = { theta, phi: zone ? 1.42 : 1.5, radius: zone ? (zone.key === 'head' ? 2.1 : 2.35) : wide ? 2.85 : 2.7, target: new THREE.Vector3(0, a ? THREE.MathUtils.lerp(0.53, a.mark.y, 0.6) : 0.53, 0) };
    controls.autoRotate = false; idleAt = performance.now();
  }
  controls.addEventListener('start', () => { fly = null; fv.t = fv.p = fv.r = 0; controls.autoRotate = false; idleAt = performance.now(); });
  controls.addEventListener('end', () => { idleAt = performance.now(); });

  // ── zones ──
  const rows = new Map(), dots = new Map();
  for (const z of ZONES) {
    const row = h('button', { class: 'md-row', 'aria-pressed': 'false', onclick: () => select(picked?.key === z.key ? null : z), onpointerenter: () => setHover(z), onpointerleave: () => setHover(null) }, h('i'), h('span', null, z.title), svg('chev')); rows.set(z.key, row); list.append(row);
    const dot = h('button', { class: 'md-mark', 'aria-label': z.title, onclick: (e) => { e.stopPropagation(); select(picked?.key === z.key ? null : z); }, onpointerenter: () => setHover(z), onpointerleave: () => setHover(null) }, h('i'), h('span', null, z.title)); dots.set(z.key, dot); marks.append(dot);
  }
  const setV4 = (u, v) => (v ? u.value.copy(v) : u.value.set(0, 0, 0, 0));
  function setHover(z) { hover = z && z !== picked ? z : null; const a = hover && anchors.get(hover.key); setV4(U.uHA, a?.glow[0]); setV4(U.uHB, a?.glow[1]); for (const [k, d] of dots) d.classList.toggle('hover', hover?.key === k); }
  function applyZone() { const a = picked && anchors.get(picked.key); if (a) { setV4(U.uZA, a.glow[0]); setV4(U.uZB, a.glow[1]); } }
  let organ = null;
  function select(z) {
    picked = z; setHover(null); if (z) { U.uGlow.value = 0; applyZone(); }
    for (const [k, r] of rows) { r.classList.toggle('on', z?.key === k); r.setAttribute('aria-pressed', String(z?.key === k)); }
    for (const [k, d] of dots) d.classList.toggle('on', z?.key === k);
    root.classList.toggle('picked', !!z); wbox.replaceChildren(...widgets(h, z)); shiftT = z && matchMedia('(max-width: 760px)').matches ? 0.2 : 0;
    if (!z) { card.replaceChildren(); organ?.show(null); idleAt = performance.now(); return; }
    lookAt(z.side > 0 ? 0.3 : Math.PI - 0.3, false, z);
    const organCanvas = h('canvas', { class: 'md-organ-gl', 'aria-hidden': 'true' }), poster = h('img', { class: 'md-organ-poster', src: `${BASE}/organs/${z.organ}-poster.webp`, alt: '' });
    card.replaceChildren(...zoneCard(h, ctx, svg, z, h('span', { style: 'display:contents' }, poster, organCanvas), () => select(null)));
    card.scrollTop = 0; (organ ||= organStage()).show(z.organ, organCanvas, poster);
  }

  // a small turning organ in the card (models: Z-Anatomy, CC BY-SA 4.0 — the credit stays visible in the card)
  function organStage() {
    const cache = {}, sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10); cam.position.set(0, 0.1, 2.5); cam.lookAt(0, 0, 0);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xe3cfc4, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color(0xffd9c4) });
    const k1 = new THREE.DirectionalLight(0xfff0e0, 3); k1.position.set(1.5, 2, 2.5); const k2 = new THREE.DirectionalLight(0x8fb6ff, 2); k2.position.set(-2, 0.5, -2); sc.add(new THREE.HemisphereLight(0xdde6ff, 0x3a302a, 0.9), k1, k2);
    let r = null, cur = null, key = null, target = null;
    return { get active() { return !!cur; }, scene: sc, camera: cam,
      async show(next, cnv, poster) { key = next; if (cur) { sc.remove(cur); cur = null; } r?.dispose(); r = null; target = cnv; if (!next) return;
        try { cache[next] ||= normalise((await gltf.loadAsync(`${BASE}/organs/${next}.glb`)).scene, mat, false, 1.08); } catch { return; }
        if (dead || key !== next || !cnv.isConnected) return;
        try { r = new THREE.WebGLRenderer({ canvas: cnv, antialias: true, alpha: true }); } catch { r = null; return; } r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); r.setSize(cnv.clientWidth || 112, cnv.clientHeight || 112, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
        cur = cache[next]; sc.add(cur); poster?.classList.add('hide'); },
      frame(t) { if (r && cur && target?.isConnected) { cur.rotation.y = t * 0.6; r.render(sc, cam); } },
      dispose() { r?.dispose(); Object.values(cache).forEach(disposeTree); mat.dispose(); } };
  }

  // ── pointer: hover and click on the body itself ──
  const ptr = new THREE.Vector2(); let down = null, moveQueued = false, lastMove = null;
  // Hover uses the zone points already projected to the screen each frame — a ray against the 100k-triangle body on every mouse move cost a quarter of a core.
  const onScreen = new Map();
  function zoneNear(e) { const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 70 * 70;
    for (const z of ZONES) { const p = onScreen.get(z.key); if (!p) continue; const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = z; } } return best; }
  function zoneAt(e) {
    if (!body) return null; const r = canvas.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera); const hit = ray.intersectObject(body, true)[0]; if (!hit) return null;
    let best = null, score = 1.35;                                       // distance in units of the zone radius
    for (const z of ZONES) for (const g of anchors.get(z.key).glow) { const s = Math.hypot(hit.point.x - g.x, hit.point.y - g.y, hit.point.z - g.z) / g.w; if (s < score) { score = s; best = z; } }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => { if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 500) return; const z = zoneAt(e); if (z) select(z.key === picked?.key ? null : z); });
  canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') return; lastMove = e; if (moveQueued) return; moveQueued = true;
    requestAnimationFrame(() => { moveQueued = false; const z = zoneNear(lastMove); setHover(z); canvas.style.cursor = z ? 'pointer' : 'grab'; }); });
  canvas.addEventListener('pointerleave', () => setHover(null));

  // ── frame ──
  let W = 0, H = 0, raf = 0, last = performance.now();
  const resize = () => { W = stage.clientWidth; H = stage.clientHeight; if (!W || !H) return; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); controls.minDistance = 1.25; };
  const ro = new ResizeObserver(resize); ro.observe(stage);
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!W || document.hidden) return;
    U.uTime.value = now / 1000; U.uGlow.value += ((picked ? 1 : 0) - U.uGlow.value) * Math.min(1, dt * 5); U.uHover.value += ((hover ? 1 : 0) - U.uHover.value) * Math.min(1, dt * 9);
    if (fly) { const k = 1 - Math.exp(-dt * 4.2), w = 2 * Math.PI / 0.62; sph.setFromVector3(tmp.copy(camera.position).sub(controls.target));
      let d = fly.theta - sph.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
      const sp = (x, v, err) => { v += (w * w * err - 2 * w * v) * dt; return [x + v * dt, v]; };                       // critically damped: no overshoot, keeps its speed if the target changes mid-turn
      [sph.theta, fv.t] = sp(sph.theta, fv.t, d); [sph.phi, fv.p] = sp(sph.phi, fv.p, fly.phi - sph.phi); [sph.radius, fv.r] = sp(sph.radius, fv.r, fly.radius - sph.radius); controls.target.lerp(fly.target, k);
      camera.position.setFromSpherical(sph).add(controls.target); if (Math.abs(d) < 0.004 && Math.abs(fly.radius - sph.radius) < 0.004 && controls.target.distanceTo(fly.target) < 0.003 && Math.abs(fv.t) < 0.02) { fly = null; fv.t = fv.p = fv.r = 0; } }
    else if (!picked && !controls.autoRotate && now - idleAt > 5000) controls.autoRotate = true;
    controls.update(); rig.rotation.y = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    shift += (shiftT - shift) * Math.min(1, dt * 5); if (shift > 0.002) camera.setViewOffset(W, H, 0, H * shift, W, H); else if (camera.view) camera.clearViewOffset();
    const a = picked && anchors.get(picked.key); ring.material.opacity += ((a ? 0.55 : 0) - ring.material.opacity) * Math.min(1, dt * 5); if (a) { ring.position.y += (a.mark.y - ring.position.y) * Math.min(1, dt * 6); ring.scale.setScalar(1 + 0.03 * Math.sin(now / 420)); }
    renderer.render(scene, camera);
    for (const z of ZONES) { const an = anchors.get(z.key), dot = dots.get(z.key); if (!an) { dot.style.opacity = 0; continue; }
      tmp.copy(an.mark).project(camera); const facing = an.normal.dot(new THREE.Vector3().copy(camera.position).sub(an.mark).normalize());
      const sx = ((tmp.x + 1) / 2) * W, sy = ((1 - tmp.y) / 2) * H; if (facing > 0.12) onScreen.set(z.key, [sx, sy]); else onScreen.delete(z.key);
      dot.style.transform = `translate(${sx}px, ${sy}px)`; dot.style.opacity = facing > 0.12 ? 1 : 0; dot.style.pointerEvents = facing > 0.12 ? 'auto' : 'none'; }
    organ?.frame(now / 1000);
  }
  const onKey = (e) => { if (e.key === 'Escape' && picked) select(null); }; document.addEventListener('keydown', onKey);
  setSex('male'); wbox.replaceChildren(...widgets(h, null)); raf = requestAnimationFrame(frame);

  return { root, destroy() {
    dead = true; cancelAnimationFrame(raf); ro.disconnect(); themeWatch.disconnect(); document.removeEventListener('keydown', onKey); controls.dispose(); organ?.dispose();
    Object.values(bodies).forEach(disposeTree); [floor, halo, ring].forEach((m) => { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); }); skin.dispose(); draco.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  } };
}
