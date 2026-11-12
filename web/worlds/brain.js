// «Мозг» — the person's memory as a living brain, on black.
// Outside: an anatomically shaped brain drawn in light — two hemispheres split by the longitudinal fissure, frontal, parietal,
// temporal and occipital lobes, the lateral and central sulci, dense gyri, the cerebellum with its fine folia, the stem —
// with a galaxy turning inside and every kept thought a star in its own lobe.
// «Посетить мысли» flies the camera through the cortex into the brain: a huge neural web with the person's thoughts as bright
// stars. Arrows (on screen and ← → ↑ ↓) glide along the links from one thought to the next; «Выйти из мозга» flies back out.
// The inside is the outside brain scaled ×16, so the flight in is one continuous move. Without WebGL — a plain list.
import { head, styled, reduced } from '/worlds/_ui.js';
import Fuse from '/vendor/lib/fuse.basic.min.mjs';

const S16 = 16;                                                     // the inside is the brain at this scale
// where each kind of memory lives (brain space: x — right, y — up, z — forward; the cerebrum is 2 units long)
const REGION = {
  goals: [-0.36, 0.2, 0.58], tasks: [0.36, 0.2, 0.58],
  knowledge: [-0.38, 0.42, -0.2], ideas: [0.38, 0.42, -0.2],
  people: [-0.6, -0.26, 0.06], said: [0.6, -0.26, 0.06],
  emotions: [-0.2, -0.02, 0.02], mood: [0.2, -0.02, 0.02],
  money: [0, 0.16, -0.66],
};
const LOBE = { goals: 'лобная доля', tasks: 'лобная доля', knowledge: 'теменная доля', ideas: 'теменная доля', people: 'височная доля', said: 'височная доля', emotions: 'глубина мозга', mood: 'глубина мозга', money: 'затылочная доля' };
const FALLBACK_CATS = [
  { id: 'emotions', name: 'Эмоции', color: '#ff375f' }, { id: 'mood', name: 'Настроение', color: '#bf5af2' }, { id: 'knowledge', name: 'Знания', color: '#0a84ff' },
  { id: 'people', name: 'Люди', color: '#30d158' }, { id: 'goals', name: 'Цели', color: '#ffd60a' }, { id: 'tasks', name: 'Задачи', color: '#ff9f0a' },
  { id: 'ideas', name: 'Идеи', color: '#66d4cf' }, { id: 'said', name: 'Вы говорили', color: '#64d2ff' }, { id: 'money', name: 'Деньги', color: '#34e0a1' },
];
// shown only inside, only while memory is empty, always marked «пример»; never sent anywhere, never mixed with real thoughts
const EXAMPLES = [
  { id: -1, cat: 'goals', text: 'Накопить на путешествие к лету' }, { id: -2, cat: 'people', text: 'Мама — позвонить в воскресенье' },
  { id: -3, cat: 'ideas', text: 'Запустить свой подкаст' }, { id: -4, cat: 'money', text: 'Откладывать 10% с каждого дохода' },
  { id: -5, cat: 'knowledge', text: 'Лучше всего работаю утром' }, { id: -6, cat: 'emotions', text: 'Радуюсь, когда дело доведено до конца' },
  { id: -7, cat: 'people', text: 'Аня — партнёр по проекту' }, { id: -8, cat: 'tasks', text: 'Записаться к врачу на осмотр' },
].map((n) => ({ ...n, example: true, weight: 1, created: 0, quote: '' }));
const EXAMPLE_EDGES = [[-1, -4], [-2, -7], [-3, -5], [-6, -3], [-1, -6], [-8, -5], [-7, -3]].map(([a, b]) => ({ a, b }));
const PLAN_LINE = { vit: 'VIT наполняет мозг сам — из разговоров и бюджета', id: 'Вы наполняете мозг сами. С подпиской VIT он растёт сам', guest: 'Пробный режим' };

const rnd = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const plural = (n, [one, few, many]) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// improved Perlin noise, for the folds of the cortex
function perlin(seed) {
  const r = rnd(seed), a = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), lerp = (x, y, t) => x + t * (y - x);
  const g = (hh, x, y, z) => { const h = hh & 15, u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z), A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(lerp(lerp(g(p[AA], x, y, z), g(p[BA], x - 1, y, z), u), lerp(g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1), u), lerp(g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
}
// a smooth curve through control points (Catmull-Rom), for the brain's profiles
const curve = (zs, vs) => (z) => {
  if (z <= zs[0]) return vs[0]; if (z >= zs[zs.length - 1]) return vs[vs.length - 1];
  let i = 0; while (z > zs[i + 1]) i++;
  const t = (z - zs[i]) / (zs[i + 1] - zs[i]), p0 = vs[Math.max(0, i - 1)], p1 = vs[i], p2 = vs[i + 1], p3 = vs[Math.min(vs.length - 1, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
};

// ── anatomy ──────────────────────────────────────────────────────────────────
// Proportions of an adult cerebrum: length 167 mm → 2 units, width 140 mm, height 93 mm. z runs from the occipital pole (−1)
// to the frontal pole (+1). TOP — the dome; BOT — the underside (the dip is the temporal lobe, the notch at z≈0.38 is the
// temporal pole under the Sylvian fissure); LAT — the half-width of one hemisphere from the midline (widest at the parietal lobes).
const TOP = curve([-1, -0.92, -0.75, -0.45, -0.1, 0.25, 0.55, 0.8, 0.94, 1], [0.02, 0.22, 0.42, 0.57, 0.62, 0.58, 0.47, 0.31, 0.15, 0.0]);
const BOT = curve([-1, -0.92, -0.75, -0.5, -0.2, 0.1, 0.3, 0.38, 0.46, 0.65, 0.86, 1], [-0.03, -0.15, -0.25, -0.31, -0.43, -0.47, -0.42, -0.31, -0.2, -0.17, -0.12, -0.02]);
const LAT = curve([-1, -0.9, -0.7, -0.4, -0.1, 0.2, 0.5, 0.75, 0.92, 1], [0.05, 0.36, 0.6, 0.76, 0.8, 0.77, 0.68, 0.53, 0.3, 0.05]);
const MID = 0.014, SE = 2.5;                                        // the gap of the longitudinal fissure; superellipse power of the cross-section
const SYL = (z) => -0.24 + (0.36 - z) * 0.33;                        // height of the lateral (Sylvian) fissure along the side
const yMid = (z) => BOT(z) + (TOP(z) - BOT(z)) * 0.44;
function insideBrain(x, y, z, k = 1) {
  if (z <= -1 || z >= 1) return false;
  const L = LAT(z), ax = (Math.abs(x) - MID) / Math.max(1e-3, L - MID), yc = yMid(z), ay = (y - yc) / Math.max(1e-3, y > yc ? TOP(z) - yc : yc - BOT(z));
  return ax >= 0 && ax ** SE + Math.abs(ay) ** SE < k ** SE;
}

function buildBrain(count) {
  const noise = perlin(13), r = rnd(2026);
  const pos = [], nor = [], col = [], bri = [], seed = [];
  const deep = [0.16, 0.25, 1.0], violet = [0.58, 0.38, 1.0], cyan = [0.4, 0.9, 1.0], rose = [0.92, 0.46, 0.96];
  const push = (x, y, z, nx, ny, nz, c, b) => { pos.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l); col.push(...c); bri.push(b); seed.push(r()); };
  const pw = (v, p) => Math.sign(v) * Math.abs(v) ** p, E = 0.01;
  const cortex = Math.round(count * 0.84), maxPer = 1.9;
  for (let made = 0, guard = 0; made < cortex && guard < cortex * 12; guard++) {
    const z = r() * 2 - 1, L = LAT(z), T = TOP(z), B = BOT(z), yc = yMid(z);
    if (r() > ((L - MID) + (T - B)) / maxPer) continue;                                    // sample by the size of the cross-section
    const side = made % 2 ? 1 : -1, medialWall = r() < 0.07;
    let x, y, nx, ny, nz, wall = 1;
    if (medialWall) {                                                                      // the flat inner face, seen only through the fissure
      const s = r() * 2 - 1; x = MID; y = yc + (s > 0 ? T - yc : yc - B) * s * 0.96; nx = -1; ny = 0; nz = 0; wall = 0.15;
    } else {
      const phi = (r() - 0.5) * Math.PI, c = Math.cos(phi), s = Math.sin(phi);
      x = MID + (L - MID) * Math.abs(c) ** (2 / SE); y = yc + (s > 0 ? T - yc : yc - B) * pw(s, 2 / SE);
      const dL = (LAT(z + E) - LAT(z - E)) / (2 * E), dT = (TOP(z + E) - TOP(z - E)) / (2 * E), dB = (BOT(z + E) - BOT(z - E)) / (2 * E);
      nx = c; ny = s; nz = -(dL * c * c + (s > 0 ? dT * s * s : -dB * s * s));
    }
    // the great furrows: lateral (Sylvian), central, and the lips of the longitudinal fissure
    let groove = 1, sink = 0;
    if (!medialWall && x > MID + (L - MID) * 0.55 && z > -0.45 && z < 0.4) { const d = Math.abs(y - SYL(z)), k = smooth(0.0, 0.07, d); groove *= k; sink += (1 - k) * 0.03; }
    if (!medialWall && y > SYL(z) && z > -0.3 && z < 0.3) { const d = Math.abs(z - (-0.06 + (0.62 - y) * 0.3)), k = smooth(0.0, 0.028, d); groove *= 0.15 + 0.85 * k; }
    if (!medialWall && y > yc && x < MID + 0.045) { if (r() < 0.8) continue; groove *= 0.4; }
    // gyri: ridged noise, warped so the folds wind like the real ones
    const q = 5.2, w = noise(x * 2.2 + 7, y * 2.2, z * 2.2) * 0.7;
    const n1 = 1 - Math.abs(noise(x * q + w, y * q - w, z * q)), n2 = 1 - Math.abs(noise(x * q * 2.1 + 3, y * q * 2.1 + w, z * q * 2.1));
    const ridge = medialWall ? 0.5 : n1 ** 3 * 0.72 + n2 ** 3 * 0.28;
    if (!medialWall && (r() > 0.16 + 0.84 * ridge * (0.3 + 0.7 * groove) || (groove < 0.35 && r() < 0.85))) continue;            // points gather on the gyri — the folds draw themselves
    const nl = Math.hypot(nx, ny, nz) || 1, dep = 0.032 * (ridge - 0.55) - sink;
    const px = side * (x + (nx / nl) * dep), py = y + (ny / nl) * dep, pz = z + (nz / nl) * dep;
    const t = clamp((pz + 1) / 2 * 0.65 + noise(px * 1.3, py * 1.3, pz * 1.3) * 0.5 + 0.18, 0, 1);
    let c = t < 0.5 ? mix3(deep, violet, t * 2) : mix3(violet, rose, (t - 0.5) * 1.1);
    c = mix3(c, cyan, clamp(ridge ** 3 * 0.95 + (py > 0.48 ? 0.15 : 0), 0, 0.85));
    push(px, py, pz, side * nx, ny, nz, c, (0.12 + 1.1 * ridge * ridge) * (0.22 + 0.78 * groove) * wall);
    made++;
  }
  // cerebellum: two lobes tucked under the occipital lobe, striped by fine horizontal folia
  const cereb = Math.round(count * 0.12);
  for (let i = 0, guard = 0; i < cereb && guard < cereb * 6; guard++) {
    const side = guard % 2 ? 1 : -1, u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(th), dy = u, dz = s * Math.sin(th);
    const x = side * 0.26 + dx * (dx * side < 0 ? 0.24 : 0.3), y = -0.5 + dy * 0.17 * (dy > 0 ? 1 : 0.9), z = -0.62 + dz * 0.27;
    const f = (0.5 + 0.5 * Math.sin((y * 0.9 - z * 0.25) * 260 + noise(x * 5, y * 5, z * 5) * 3)) ** 3;
    if (r() > 0.25 + 0.75 * f) continue;
    push(x, y, z, dx, dy, dz, mix3([0.48, 0.32, 1.0], [0.95, 0.48, 0.92], f * 0.7), 0.3 + 1.35 * f); i++;
  }
  // brain stem: midbrain, the bulge of the pons, the medulla
  const stem = Math.round(count * 0.04);
  for (let i = 0; i < stem; i++) {
    const t = r(), th = r() * Math.PI * 2, pons = Math.exp(-(((t - 0.32) / 0.13) ** 2)), rad = 0.13 * (1 - 0.4 * t) * (1 + 0.28 * pons);
    push(Math.cos(th) * rad, -0.26 - 0.66 * t, -0.2 - 0.18 * t + 0.05 * pons + Math.sin(th) * rad * 0.85, Math.cos(th), 0, Math.sin(th), mix3([0.3, 0.34, 1.0], [0.26, 0.72, 1.0], t), 0.3 + 0.35 * r());
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), bri: new Float32Array(bri), seed: new Float32Array(seed) };
}

function buildGalaxy(count) {
  const r = rnd(77), R = 0.42, ARMS = 3, gauss = () => (r() + r() + r() + r() - 2) / 2;
  const rad = [], ang = [], hgt = [], col = [], size = [];
  const core = [1.0, 0.86, 0.62], mid = [0.98, 0.36, 0.86], out = [0.32, 0.74, 1.0], cats = FALLBACK_CATS.map((c) => hexRGB(c.color));
  for (let i = 0; i < count; i++) {
    const inCore = r() < 0.2, rr = inCore ? Math.abs(gauss()) * 0.06 : 0.03 + R * Math.pow(r(), 1.35);
    const arm = Math.floor(r() * ARMS), diffuse = r() < 0.22, spread = diffuse ? r() * Math.PI * 2 : gauss() * (0.75 * (1 - rr / R) + 0.28);
    rad.push(rr); ang.push(inCore ? r() * Math.PI * 2 : arm * (Math.PI * 2 / ARMS) + Math.log(rr * 9 + 1) * 1.9 + spread);
    hgt.push(gauss() * (inCore ? 0.035 : 0.014 * (1 - rr / R) + 0.004));
    const t = rr / R; let c = t < 0.35 ? mix3(core, mid, t / 0.35) : mix3(mid, out, (t - 0.35) / 0.65);
    if (r() < 0.14) c = mix3(c, cats[Math.floor(r() * cats.length)], 0.7);
    col.push(...c); size.push(inCore ? 0.9 + r() * 0.8 : 0.5 + r() * 0.9);
  }
  return { rad: new Float32Array(rad), ang: new Float32Array(ang), hgt: new Float32Array(hgt), col: new Float32Array(col), size: new Float32Array(size) };
}

/** Points inside the brain, each linked to its nearest neighbours (a spatial grid keeps it fast). scale: 1 outside, S16 inside. */
function buildWeb(n, seed, scale, k, maxD, linksPer) {
  const r = rnd(seed), pts = [];
  for (let guard = 0; pts.length < n && guard < n * 60; guard++) { const x = (r() * 2 - 1) * 0.82, y = -0.5 + r() * 1.12, z = (r() * 2 - 1) * 0.98; if (insideBrain(x, y, z, k)) pts.push([x * scale, y * scale, z * scale]); }
  const cell = maxD, grid = new Map(), key = (a, b, c) => a + ',' + b + ',' + c;
  pts.forEach((p, i) => { const kk = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)); (grid.get(kk) || grid.set(kk, []).get(kk)).push(i); });
  const nearest = (p, count, skip = -1) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell), out = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of grid.get(key(cx + a, cy + b, cz + c)) || []) {
      if (j === skip) continue; const q = pts[j], d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < maxD * maxD) out.push([j, d]);
    }
    return out.sort((x, y) => x[1] - y[1]).slice(0, count);
  };
  const links = [], seen = new Set();
  pts.forEach((p, i) => { for (const [j] of nearest(p, linksPer, i)) { const kk = i < j ? i * 1e5 + j : j * 1e5 + i; if (!seen.has(kk)) { seen.add(kk); links.push([i, j]); } } });
  return { pts, links, nearest };
}

// ── shaders ──────────────────────────────────────────────────────────────────
// uSz scales distances (near fade) between outside (1) and inside (16); uK scales the size of points; uFog fades with depth inside.
const SPRITE = `varying vec3 vC; varying float vA;
void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC, exp(-r * 3.6) * vA); }`;
const CORTEX_V = `uniform float uTime, uPx, uFade, uWave; attribute vec3 aN; attribute float aB, aSeed; varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * aN);
  float fr = 1.0 - abs(dot(n, normalize(-mv.xyz))), d = -mv.z;
  float tw = 0.84 + 0.16 * sin(uTime * 1.4 + aSeed * 40.0);
  float wave = 1.0 + 0.8 * exp(-pow((position.z - uWave) * 7.0, 2.0));
  vA = (0.36 + 0.82 * pow(fr, 1.8)) * aB * tw * uFade * wave * 1.35 * smoothstep(0.04, 0.4, d);
  vC = color;
  gl_PointSize = min(22.0, uPx * (0.6 + 0.8 * aB) * 5.2 / d);
  gl_Position = projectionMatrix * mv;
}`;
const GALAXY_V = `uniform float uTime, uPx, uFade; attribute float aR, aAng, aH, aS; varying vec3 vC; varying float vA;
void main() {
  float a = aAng + uTime * 0.11 / (aR + 0.09);
  vec4 mv = modelViewMatrix * vec4(cos(a) * aR, aH, sin(a) * aR, 1.0);
  vA = (0.55 + 0.45 * (1.0 - aR / 0.45)) * uFade * smoothstep(0.04, 0.3, -mv.z); vC = color;
  gl_PointSize = min(20.0, uPx * aS * 4.6 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const NEURON_V = `uniform float uTime, uPx, uFade, uFog, uSz, uK; attribute float aPh; varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
  float fire = pow(max(0.0, sin(uTime * (0.6 + fract(aPh * 3.7)) + aPh * 6.2831)), 40.0);
  vA = (0.35 + 1.8 * fire) * uFade * exp(-pow(d / uFog, 2.0)) * smoothstep(0.03 * uSz, 0.12 * uSz, d); vC = mix(color, vec3(1.0), fire * 0.6);
  gl_PointSize = min(30.0, uPx * uK * (5.0 + 9.0 * fire) / d);
  gl_Position = projectionMatrix * mv;
}`;
const LINE_V = `uniform float uFade, uFog, uOp, uSz; varying vec3 vC; varying float vA;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z; vA = uOp * uFade * exp(-pow(d / uFog, 2.0)) * smoothstep(0.02 * uSz, 0.08 * uSz, d); vC = color; gl_Position = projectionMatrix * mv; }`;
const LINE_F = `varying vec3 vC; varying float vA; void main() { gl_FragColor = vec4(vC, vA); }`;
const PULSE_V = `uniform float uTime, uPx, uFade, uSpeed, uAll, uFog, uSz, uK; uniform vec4 uBurst; attribute vec3 aA, aB; attribute float aPh, aSp; varying vec3 vC; varying float vA;
void main() {
  float run = uTime * aSp * uSpeed + aPh; float t = fract(run);
  float on = max(uAll, step(0.62, fract(sin(floor(run) * 12.9898 + aPh * 78.233) * 43758.5453)));
  vec3 p = mix(aA, aB, t);
  float b = 0.0; if (uBurst.w > 0.0) { float dd = distance(p, uBurst.xyz) / uSz; float age = uTime - uBurst.w; b = exp(-pow(age * 1.4 - dd * 1.6, 2.0) * 6.0) * exp(-age * 0.6); }
  vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
  vA = (on * smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t)) + b * 1.4) * uFade * exp(-pow(d / uFog, 2.0)) * smoothstep(0.03 * uSz, 0.1 * uSz, d);
  vC = mix(color, vec3(1.0), 0.35 + b * 0.4);
  gl_PointSize = min(26.0, uPx * uK * (6.0 + 6.0 * b) / d);
  gl_Position = projectionMatrix * mv;
}`;
const STAR_V = `uniform float uTime, uPx, uFade, uFog, uSz, uK; attribute float aSize, aState, aSeed; varying vec3 vC; varying float vA; varying float vSel;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
  float breathe = 1.0 + 0.12 * sin(uTime * 2.1 + aSeed * 9.0);
  float k = aState < 0.5 ? 0.0 : aState < 1.5 ? 0.22 : aState < 2.4 ? 1.0 : aState < 2.9 ? 1.25 : aState < 3.5 ? 1.45 + 0.35 * sin(uTime * 5.0) : 1.9;
  vA = min(aState, 1.0) * (aState < 1.5 ? 0.35 : 1.0) * uFade * exp(-pow(d / (uFog * 1.6), 2.0)) * smoothstep(0.02 * uSz, 0.08 * uSz, d); vC = color; vSel = aState > 3.5 ? 1.0 : 0.0;
  gl_PointSize = min(90.0, uPx * uK * aSize * k * breathe * 30.0 / d);
  gl_Position = projectionMatrix * mv;
}`;
const STAR_F = `uniform float uTime; varying vec3 vC; varying float vA; varying float vSel;
void main() {
  vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
  float core = exp(-r * r * 22.0), halo = exp(-r * r * 4.0) * 0.45, spike = (max(0.0, 1.0 - abs(d.x) * 40.0) + max(0.0, 1.0 - abs(d.y) * 40.0)) * exp(-r * 3.0) * 0.35;
  float ring = vSel * smoothstep(0.06, 0.0, abs(r - 0.72 - 0.04 * sin(uTime * 4.0))) * 0.9;
  gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.75), (core + halo + spike + ring) * vA);
}`;
const ARROW = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7' };
const DIRS = { left: [-1, 0], right: [1, 0], up: [0, 1], down: [0, -1] }, KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const KEYCAP = { left: '←', right: '→', up: '↑', down: '↓' };

// ── the world ────────────────────────────────────────────────────────────────
export default function view(ctx) {
  const { h, icon, api, toast, css, when } = ctx; css('/worlds/_ui.css'); css('/worlds/brain.css');
  const plan = ctx.plan || 'guest';
  const search = h('input', { class: 'field sm br-search', type: 'search', placeholder: 'Найти мысль или человека', 'aria-label': 'Найти в мозге', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'br-results' });
  const results = h('div', { class: 'br-results glass', id: 'br-results', role: 'listbox' });
  const top = head(h, { title: 'Мозг', cls: 'br-head', controls: [h('div', { class: 'br-find' }, icon('search'), search, results)] });
  const canvas = h('canvas', { class: 'br-canvas', 'aria-label': 'Мозг: память в трёх измерениях. Перетащите, чтобы повернуть; нажмите на звезду, чтобы прочитать мысль.' });
  const labels = h('div', { class: 'br-labels', 'aria-hidden': 'true' }), inLabels = h('div', { class: 'br-inlabels', 'aria-hidden': 'true' }), tip = h('div', { class: 'br-tip', role: 'tooltip' });
  const legend = h('div', { class: 'br-legend glass br-out', role: 'group', 'aria-label': 'Разделы памяти' }), stats = h('div', { class: 'br-stats glass br-out' });
  const card = h('aside', { class: 'br-card glass', 'aria-live': 'polite' }), empty = h('div', { class: 'br-empty br-out' });
  const catSel = h('select', { class: 'field sm br-cat', 'aria-label': 'Раздел' });
  const text = h('input', { class: 'field sm br-text', placeholder: 'Новая мысль — например, «Хочу накопить на квартиру к 2028»', maxlength: 240, 'aria-label': 'Новая мысль', autocomplete: 'off' });
  const addBtn = h('button', { class: 'btn sm', type: 'submit' }, icon('plus'), 'В мозг');
  const add = h('form', { class: 'br-add glass br-out', onsubmit: (e) => { e.preventDefault(); addThought(); } }, catSel, text, addBtn);
  const enterBtn = h('button', { class: 'br-enter br-out', onclick: () => visit(null) }, h('span', { class: 'br-enter-dot' }), 'Посетить мысли');
  const exitBtn = h('button', { class: 'br-exit glass br-in', onclick: () => gl?.exit() }, h('span', { class: 'br-ico', html: svg(ARROW.left) }), 'Выйти из мозга');
  const arrows = Object.fromEntries(Object.keys(ARROW).map((d) => [d, h('button', { class: `br-arrow br-arrow-${d} br-in`, disabled: true, onclick: () => gl?.step(d), 'aria-label': 'Нет пути' },
    h('span', { class: 'br-ico', html: svg(ARROW[d]) }), h('span', { class: 'br-arrow-t' }))]));
  const hint = h('div', { class: 'br-hint br-in' }, '← → ↑ ↓ — по связям к другим мыслям · тяните, чтобы осмотреться');
  const stage = h('div', { class: 'br-stage', 'data-mode': 'out' }, canvas, labels, inLabels, legend, stats, empty, card, tip, enterBtn, add, exitBtn, ...Object.values(arrows), hint);
  const root = h('div', { class: 'view br' }, top.el, stage);

  let data = { cats: FALLBACK_CATS, nodes: [], edges: [] }, alive = true, gl = null, fallback = null;
  const hidden = new Set(); let selected = null, matches = null, mode = 'out';
  const catOf = (id) => data.cats.find((c) => c.id === id) || FALLBACK_CATS.find((c) => c.id === id) || { id, name: id, color: '#86868b' };
  const setMode = (m) => { mode = m; stage.dataset.mode = m; };

  // ── panels ─────────────────────────────────────────────────────────────────
  function paintCats() { const was = catSel.value; catSel.replaceChildren(...data.cats.map((c) => h('option', { value: c.id }, c.name))); catSel.value = was || 'ideas'; }
  function paintLegend() {
    const counts = Object.fromEntries(data.cats.map((c) => [c.id, data.nodes.filter((n) => n.cat === c.id).length]));
    legend.replaceChildren(h('div', { class: 'br-leg-head cap' }, 'Разделы'), ...data.cats.map((c) => h('button', {
      class: 'br-leg' + (hidden.has(c.id) ? ' off' : '') + (counts[c.id] ? '' : ' none'), 'aria-pressed': String(!hidden.has(c.id)), title: hidden.has(c.id) ? 'Показать' : 'Скрыть',
      onclick: () => { hidden.has(c.id) ? hidden.delete(c.id) : hidden.add(c.id); if (selected && hidden.has(selected.cat)) select(null); paintLegend(); gl?.refresh(); },
    }, h('i', { style: `--c:${c.color}` }), h('span', null, c.name), h('b', null, String(counts[c.id] || 0)))));
  }
  function paintStats() {
    const n = data.nodes.length, e = data.edges.length, week = data.nodes.filter((x) => Date.now() - x.created < 7 * 864e5).length;
    top.count(n ? `${n} ${plural(n, ['мысль', 'мысли', 'мыслей'])}` : '');
    const line = h('p', { class: 'br-plan' }, PLAN_LINE[plan] || PLAN_LINE.guest);
    if (plan === 'id' && ctx.upgrade) line.append(' ', h('button', { class: 'br-link', onclick: () => ctx.upgrade('brain') }, 'Подключить VIT'));
    stats.replaceChildren(h('div', { class: 'br-nums' },
      h('div', null, h('b', null, String(n)), h('span', { class: 'cap' }, plural(n, ['мысль', 'мысли', 'мыслей']))),
      h('div', null, h('b', null, String(e)), h('span', { class: 'cap' }, plural(e, ['связь', 'связи', 'связей']))),
      h('div', null, h('b', null, '+' + week), h('span', { class: 'cap' }, 'за неделю'))), line);
    empty.replaceChildren(...(n ? [] : [h('div', { class: 'br-empty-in glass' }, h('b', null, 'Мозг пока пуст'), h('p', null, 'Добавьте первую мысль — она загорится звездой в своей доле, а сеть начнёт связывать её с остальными. Внутри пока примеры.'))]));
  }
  const neighbours = (id) => data.edges.filter((e) => e.a === id || e.b === id).map((e) => data.nodes.find((n) => n.id === (e.a === id ? e.b : e.a))).filter((n) => n && !hidden.has(n.cat));
  // the card: outside — the chosen star; inside — the thought you are at, with the ways on
  function paintCard() {
    const inside = mode === 'in', n = inside ? gl?.current() : mode === 'out' ? selected : null;
    card.classList.toggle('on', !!n); card.classList.toggle('inside', inside); if (!n) { card.replaceChildren(); return; }
    const c = catOf(n.cat), way = inside ? gl.ways() : neighbours(n.id).map((m) => ({ node: m }));
    const row = (w) => h('button', { class: 'br-link-row', onclick: () => (inside ? gl.travel(w.node) : select(w.node, true)) },
      h('i', { style: `--c:${catOf(w.node.cat).color}` }), h('span', null, w.node.text), w.dir && h('kbd', null, KEYCAP[w.dir]));
    const linked = way.filter((w) => !w.near), near = way.filter((w) => w.near);
    card.replaceChildren(...[
      h('div', { class: 'br-card-top' }, h('span', { class: 'br-chip', style: `--c:${c.color}` }, h('i'), c.name), n.example && h('span', { class: 'br-ex' }, 'пример'), h('span', { class: 'cap' }, LOBE[n.cat] || ''), h('span', { style: 'flex:1' }),
        !inside && h('button', { class: 'icon-btn br-x', 'aria-label': 'Закрыть', onclick: () => select(null) }, '×')),
      h('p', { class: 'br-card-text' }, n.text),
      n.quote && n.quote !== n.text && h('p', { class: 'br-quote' }, '«' + n.quote + '»'),
      n.example ? h('p', { class: 'br-card-meta' }, 'Это пример. Ваши мысли появятся здесь, когда вы их добавите.')
        : h('div', { class: 'br-card-meta cap' }, when(n.created), n.weight > 1 && ` · вспоминалась ${Math.round(n.weight)} ${plural(Math.round(n.weight), ['раз', 'раза', 'раз'])}`),
      linked.length && h('div', { class: 'br-links' }, h('span', { class: 'cap' }, 'Связано'), linked.slice(0, 8).map(row)),
      near.length && h('div', { class: 'br-links' }, h('span', { class: 'cap' }, 'Рядом'), near.slice(0, 4).map(row)),
      !inside && h('div', { class: 'br-card-acts' }, gl && h('button', { class: 'btn sm', onclick: () => visit(n) }, 'Посетить'), h('button', { class: 'btn sm danger', onclick: forget }, 'Забыть'))].filter((x) => x && x.nodeType));
  }
  function select(n, fromCard) {
    selected = n; paintCard(); gl?.refresh(); gl?.focus(n);
    if (n && !fromCard) card.querySelector('.br-x')?.focus({ preventScroll: true });
  }
  async function forget() {
    const n = selected; if (!n) return;
    try { await api('/api/memory/' + n.id, { method: 'DELETE' }); toast('Мысль забыта'); select(null); await load(); }
    catch (e) { toast(e.message); }
  }
  async function addThought() {
    const t = text.value.trim(); if (t.length < 2) { text.focus(); return; }
    addBtn.disabled = true;
    try { const d = await api('/api/memory', { body: { cat: catSel.value, text: t } }); text.value = ''; hidden.delete(d.node.cat); await load(d.node.id); toast('Мысль в мозге'); }
    catch (e) { toast(e.message); }
    addBtn.disabled = false;
  }
  /** Go into the brain — to this thought, or to the strongest one. Inside, glide to it. */
  function visit(n) {
    closeResults();
    if (!gl) { if (n) select(n); return; }
    if (mode === 'in') { if (n) gl.travel(n); return; }
    if (mode === 'out') { selected = null; gl.focus(null); paintCard(); gl.enter(n); }
  }

  // search: highlights outside, and a list of results to fly to
  let hits = [];
  function runSearch() {
    const q = search.value.trim();
    hits = q ? new Fuse(data.nodes, { keys: ['text', 'quote'], threshold: 0.38, ignoreLocation: true }).search(q).map((r) => r.item) : [];
    matches = q ? new Set(hits.map((n) => n.id)) : null; gl?.refresh();
    results.replaceChildren(...(!q ? [] : hits.length ? hits.slice(0, 8).map((n) => h('button', { class: 'br-res', role: 'option', onclick: () => visit(n) },
      h('i', { style: `--c:${catOf(n.cat).color}` }), h('span', null, cut(n.text, 80)), h('em', null, n.cat === 'people' ? 'человек' : catOf(n.cat).name.toLowerCase())))
      : [h('div', { class: 'br-res-none' }, data.nodes.length ? 'Ничего не нашлось' : 'Память пока пуста')]));
    results.classList.toggle('on', !!q); search.setAttribute('aria-expanded', String(!!q));
  }
  const closeResults = () => { results.classList.remove('on'); search.setAttribute('aria-expanded', 'false'); };
  search.addEventListener('input', runSearch);
  search.addEventListener('focus', () => { if (search.value.trim()) runSearch(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && hits[0]) { visit(hits[0]); search.blur(); } if (e.key === 'Escape') { search.value = ''; runSearch(); closeResults(); } e.stopPropagation(); });
  const outsideClick = (e) => { if (!e.target.closest?.('.br-find')) closeResults(); };
  document.addEventListener('pointerdown', outsideClick);

  async function load(fresh) {
    try { const d = await api('/api/memory'); if (!alive) return; data = { cats: d.cats?.length ? d.cats : FALLBACK_CATS, nodes: d.nodes || [], edges: d.edges || [] }; }
    catch (e) { if (e.status !== 401) toast(e.message); }
    if (selected) selected = data.nodes.find((n) => n.id === selected.id) || null;
    paintCats(); paintLegend(); paintStats(); if (search.value) runSearch();
    gl?.setData(fresh); paintCard(); fallback?.paint();
  }
  const onVisible = () => { if (!document.hidden && mode === 'out') load(); };
  document.addEventListener('visibilitychange', onVisible);

  // ── no WebGL: a plain, readable list ──────────────────────────────────────
  function listMode() {
    stage.classList.add('br-flat'); canvas.remove(); enterBtn.remove();
    const list = h('div', { class: 'br-list scroll' }); stage.prepend(list);
    fallback = { paint() {
      list.replaceChildren(...data.cats.filter((c) => !hidden.has(c.id)).map((c) => { const items = data.nodes.filter((n) => n.cat === c.id); return items.length && h('section', { class: 'br-list-sec' },
        h('h2', null, h('i', { style: `--c:${c.color}` }), c.name, h('span', { class: 'cap' }, String(items.length))), items.map((n) => h('button', { class: 'br-list-row glass', onclick: () => select(n) }, n.text))); }).filter(Boolean));
    } };
    fallback.paint();
  }

  // ── WebGL ──────────────────────────────────────────────────────────────────
  async function start3D() {
    let THREE;
    try { THREE = await import('/vendor/three/three.module.min.js'); } catch { return listMode(); }
    if (!alive) return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch { return listMode(); }
    if (!renderer.getContext()) return listMode();
    renderer.setClearColor(0x000000, 1); renderer.autoClear = false;
    const outScene = new THREE.Scene(), inScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 40), inCam = new THREE.PerspectiveCamera(34, 1, 0.05, 400);
    const brain = new THREE.Group(); outScene.add(brain);
    const disposables = [];
    const T = { value: 0 }, PX = { value: 1 }, BURST = { value: new THREE.Vector4(0, 0, 0, -1) }, IBURST = { value: new THREE.Vector4(0, 0, 0, -1) }, SPEED = { value: 1 };
    // uniform objects are shared by reference: one fade for everything outside, one for everything inside
    const OUT = { uTime: T, uPx: PX, uFade: { value: 0 }, uFog: { value: 1e4 }, uSz: { value: 1 }, uK: { value: 1 } };
    const IN = { uTime: T, uPx: PX, uFade: { value: 0 }, uFog: { value: 30 }, uSz: { value: S16 }, uK: { value: 1 } };
    const U = (base, extra = {}) => ({ ...base, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, typeof v === 'number' ? { value: v } : v])) });
    const mat = (vertexShader, uniforms, fragmentShader = SPRITE) => { const m = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true }); disposables.push(m); return m; };
    const geo = (attrs) => { const g = new THREE.BufferGeometry(); for (const [k, [arr, n]] of Object.entries(attrs)) g.setAttribute(k, new THREE.BufferAttribute(arr, n)); return g; };
    const keep = (g) => { disposables.push(g); return g; };
    const points = (g, m, parent) => { const p = new THREE.Points(g, m); p.frustumCulled = false; parent.add(p); return p; };
    const lines = (pairs, colorOf, m, parent) => {
      const lp = new Float32Array(pairs.length * 6), lc = new Float32Array(pairs.length * 6);
      pairs.forEach(([a, b], i) => { lp.set(a, i * 6); lp.set(b, i * 6 + 3); const c = colorOf(i); lc.set(c, i * 6); lc.set(c, i * 6 + 3); });
      const s = new THREE.LineSegments(geo({ position: [lp, 3], color: [lc, 3] }), m); s.frustumCulled = false; parent.add(s); return s;
    };
    const pulseGeo = (pairs, rate, seed) => {
      const n = pairs.length, a = new Float32Array(n * 3), b = new Float32Array(n * 3), c = new Float32Array(n * 3), ph = new Float32Array(n), sp = new Float32Array(n), r = rnd(seed);
      pairs.forEach(([p, q, col], i) => { const flip = r() < 0.5; a.set(flip ? q : p, i * 3); b.set(flip ? p : q, i * 3); c.set(col, i * 3); ph[i] = r(); sp[i] = rate * (0.6 + r() * 0.8); });
      return geo({ position: [new Float32Array(n * 3), 3], aA: [a, 3], aB: [b, 3], color: [c, 3], aPh: [ph, 1], aSp: [sp, 1] });
    };
    const fixed = [];                                                              // scene parts built once (disposed at the end)

    // ── outside: cortex, galaxy, a small network; memory stars come with the data ──
    const OUTW = U(OUT, { uWave: -3 });
    const B = buildBrain(90000);
    fixed.push(points(geo({ position: [B.pos, 3], aN: [B.nor, 3], color: [B.col, 3], aB: [B.bri, 1], aSeed: [B.seed, 1] }), mat(CORTEX_V, OUTW), brain));
    const G = buildGalaxy(22000), galaxy = new THREE.Group(); galaxy.position.set(0, 0.05, -0.06); galaxy.rotation.set(0.55, 0.3, 0.42); galaxy.scale.setScalar(1.08); brain.add(galaxy);
    fixed.push(points(geo({ position: [new Float32Array(G.rad.length * 3), 3], aR: [G.rad, 1], aAng: [G.ang, 1], aH: [G.hgt, 1], color: [G.col, 3], aS: [G.size, 1] }), mat(GALAXY_V, OUT), galaxy));
    const N = buildWeb(440, 4242, 1, 0.86, 0.42, 3), nr = rnd(9);
    const ncol = new Float32Array(N.pts.length * 3), nph = new Float32Array(N.pts.length); N.pts.forEach((p, i) => { ncol.set(mix3([0.45, 0.6, 1.0], [0.85, 0.55, 1.0], nr()), i * 3); nph[i] = nr(); });
    fixed.push(points(geo({ position: [new Float32Array(N.pts.flat()), 3], color: [ncol, 3], aPh: [nph, 1] }), mat(NEURON_V, OUT), brain));
    fixed.push(lines(N.links.map(([a, b]) => [N.pts[a], N.pts[b]]), () => [0.3, 0.42, 0.95], mat(LINE_V, U(OUT, { uOp: 0.16 }), LINE_F), brain));
    fixed.push(points(pulseGeo(N.links.map(([a, b]) => [N.pts[a], N.pts[b], [0.55, 0.75, 1.0]]), 0.45, 5), mat(PULSE_V, U(OUT, { uBurst: BURST, uSpeed: SPEED, uAll: 0 })), brain));
    const starMat = mat(STAR_V, OUT, STAR_F), memLineMat = mat(LINE_V, U(OUT, { uOp: 0.55 }), LINE_F), memPulseMat = mat(PULSE_V, U(OUT, { uBurst: BURST, uSpeed: SPEED, uAll: 1 }));

    // ── inside: a huge web (the brain ×16) in fog, with dust; thoughts and their links come with the data ──
    const W = buildWeb(6200, 777, S16, 0.95, 2.3, 3), wr = rnd(31);
    const wcol = new Float32Array(W.pts.length * 3), wph = new Float32Array(W.pts.length);
    W.pts.forEach((p, i) => { wcol.set(mix3([0.32, 0.45, 1.0], [0.78, 0.5, 1.0], wr()), i * 3); wph[i] = wr(); });
    fixed.push(points(geo({ position: [new Float32Array(W.pts.flat()), 3], color: [wcol, 3], aPh: [wph, 1] }), mat(NEURON_V, U(IN, { uK: 3.2 })), inScene));
    fixed.push(lines(W.links.map(([a, b]) => [W.pts[a], W.pts[b]]), () => mix3([0.22, 0.32, 0.9], [0.5, 0.3, 0.95], wr()), mat(LINE_V, U(IN, { uOp: 0.38 }), LINE_F), inScene));
    fixed.push(points(pulseGeo(W.links.map(([a, b]) => [W.pts[a], W.pts[b], [0.5, 0.72, 1.0]]), 0.22, 6), mat(PULSE_V, U(IN, { uBurst: IBURST, uSpeed: SPEED, uAll: 0, uK: 2.2 })), inScene));
    { const dust = [], dc = [], dp = [], r = rnd(55);
      for (let g = 0; dust.length < 9000 * 3 && g < 9e5; g++) { const x = (r() * 2 - 1) * 0.85, y = -0.52 + r() * 1.16, z = r() * 2 - 1; if (insideBrain(x, y, z, 1.02)) { dust.push(x * S16, y * S16, z * S16); dc.push(...mix3([0.25, 0.3, 0.7], [0.6, 0.4, 0.9], r())); dp.push(r() * 0.3); } }
      fixed.push(points(geo({ position: [new Float32Array(dust), 3], color: [new Float32Array(dc), 3], aPh: [new Float32Array(dp), 1] }), mat(NEURON_V, U(IN, { uK: 1.4, uSz: S16 * 0.4 })), inScene)); }
    const inStarMat = mat(STAR_V, U(IN, { uK: 3.4 }), STAR_F), inLineMat = mat(LINE_V, U(IN, { uOp: 0.9 }), LINE_F), inTieMat = mat(LINE_V, U(IN, { uOp: 0.3 }), LINE_F);
    const inPulseMat = mat(PULSE_V, U(IN, { uBurst: IBURST, uSpeed: SPEED, uAll: 1, uK: 3 }));

    // ── memory: placed by lobe, the same positions outside and (×16) inside ──
    const placeOf = (n, counts) => {
      const c = REGION[n.cat] || [0.2, 0.1, 0], r = rnd((Math.abs(n.id) * 2654435761 + (n.id < 0 ? 99 : 0)) >>> 0); r(); r();
      const spread = 0.11 + 0.035 * Math.sqrt(counts[n.cat] || 1);
      for (let k = 0; k < 40; k++) {
        const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = spread * Math.cbrt(r());
        const p = [c[0] + s * Math.cos(th) * d * (n.cat === 'money' ? 2.4 : 1), c[1] + u * d * 0.8, c[2] + s * Math.sin(th) * d];
        if (insideBrain(p[0], p[1], p[2], 0.9)) return p;
      }
      return [c[0] || 0.2, c[1], c[2]];
    };
    let starPos = new Float32Array(0), starState = null, idx = new Map(), stars = null, memLines = null, memPulses = null;
    let inNodes = [], inPos = [], inIdx = new Map(), inEdges = [], inObjs = [], inState = null, inStars = null, fly = null;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), v3 = new THREE.Vector3();
    const drop = (o) => { if (o) { o.parent?.remove(o); o.geometry.dispose(); } };
    function setData(freshId) {
      [stars, memLines, memPulses, ...inObjs].forEach(drop); stars = memLines = memPulses = inStars = null; inObjs = []; idx = new Map();
      const nodes = data.nodes, counts = {}; nodes.forEach((n) => { counts[n.cat] = (counts[n.cat] || 0) + 1; });
      starPos = new Float32Array(nodes.length * 3); starState = new Float32Array(nodes.length);
      const col = new Float32Array(nodes.length * 3), size = new Float32Array(nodes.length), seed = new Float32Array(nodes.length);
      nodes.forEach((n, i) => { idx.set(n.id, i); starPos.set(placeOf(n, counts), i * 3); col.set(hexRGB(catOf(n.cat).color), i * 3); size[i] = 0.75 + Math.min(1.4, Math.log2(1 + (n.weight || 1)) * 0.45); seed[i] = (n.id * 0.6180339) % 1; });
      if (nodes.length) {
        stars = points(geo({ position: [starPos, 3], color: [col, 3], aSize: [size, 1], aSeed: [seed, 1], aState: [starState, 1] }), starMat, brain); stars.renderOrder = 3;
        if (freshId != null && idx.has(freshId) && mode === 'out') { const i = idx.get(freshId); fly = { i, id: freshId, from: brain.worldToLocal(camera.position.clone().add(new THREE.Vector3(0.6, -0.4, -0.6))).toArray(), to: Array.from(starPos.slice(i * 3, i * 3 + 3)), t0: clock }; }
      }
      // inside: real thoughts, or clearly marked examples while memory is empty
      inNodes = nodes.length ? nodes.slice() : EXAMPLES; inEdges = nodes.length ? data.edges.filter((e) => idx.has(e.a) && idx.has(e.b)) : EXAMPLE_EDGES;
      const ic = {}; inNodes.forEach((n) => { ic[n.cat] = (ic[n.cat] || 0) + 1; });
      inIdx = new Map(inNodes.map((n, i) => [n.id, i]));
      inPos = inNodes.map((n) => (idx.has(n.id) ? Array.from(starPos.slice(idx.get(n.id) * 3, idx.get(n.id) * 3 + 3)) : placeOf(n, ic)).map((v) => v * S16));
      inState = new Float32Array(inNodes.length).fill(2);
      const isz = new Float32Array(inNodes.map((n) => 0.8 + Math.min(1.3, Math.log2(1 + (n.weight || 1)) * 0.4))), isd = new Float32Array(inNodes.map((n) => (Math.abs(n.id) * 0.618) % 1));
      inStars = points(geo({ position: [new Float32Array(inPos.flat()), 3], color: [new Float32Array(inNodes.flatMap((n) => hexRGB(catOf(n.cat).color).map((v) => (n.example ? v * 0.7 : v)))), 3], aSize: [isz, 1], aSeed: [isd, 1], aState: [inState, 1] }), inStarMat, inScene);
      inObjs.push(inStars);
      const ip = inEdges.map((e) => [inPos[inIdx.get(e.a)], inPos[inIdx.get(e.b)], mix3(hexRGB(catOf(inNodes[inIdx.get(e.a)].cat).color), hexRGB(catOf(inNodes[inIdx.get(e.b)].cat).color), 0.5)]);
      if (ip.length) { inObjs.push(lines(ip, (i) => ip[i][2], inLineMat, inScene)); inObjs.push(points(pulseGeo(ip, 0.22, 12), inPulseMat, inScene)); }
      const ties = []; inPos.forEach((p) => { for (const [j] of W.nearest(p, 5)) ties.push([p, W.pts[j]]); });          // each thought sits inside the web
      if (ties.length) inObjs.push(lines(ties, () => [0.55, 0.65, 1.0], inTieMat, inScene));
      if (cur) { cur = inIdx.has(cur.id) ? inNodes[inIdx.get(cur.id)] : null; if (!cur && mode === 'in') { cur = inNodes[0]; computeWays(); } }
      refresh();
    }
    function refresh() {
      if (inState && inStars) { inNodes.forEach((n, i) => { inState[i] = cur && n.id === cur.id ? 4 : matches && !n.example ? (matches.has(n.id) ? 3 : 1.2) : 2; }); inStars.geometry.attributes.aState.needsUpdate = true; }
      paintLabels();
      if (!stars) return;
      const sel = selected?.id, near = new Set(sel != null ? neighbours(sel).map((n) => n.id) : []);
      data.nodes.forEach((n, i) => { starState[i] = hidden.has(n.cat) ? 0 : n.id === sel ? 4 : matches ? (matches.has(n.id) ? 3 : 1) : near.has(n.id) ? 2.5 : 2; });
      stars.geometry.attributes.aState.needsUpdate = true;
      drop(memLines); drop(memPulses); memLines = memPulses = null;
      const pairs = data.edges.filter((e) => idx.has(e.a) && idx.has(e.b) && starState[idx.get(e.a)] > 0 && starState[idx.get(e.b)] > 0 && !(fly && (e.a === fly.id || e.b === fly.id)));
      if (pairs.length) {
        const pp = pairs.map((e) => {
          const a = Array.from(starPos.slice(idx.get(e.a) * 3, idx.get(e.a) * 3 + 3)), b = Array.from(starPos.slice(idx.get(e.b) * 3, idx.get(e.b) * 3 + 3));
          const k = sel == null ? 0.55 : e.a === sel || e.b === sel ? 1.2 : 0.18, dim = matches ? (matches.has(e.a) && matches.has(e.b) ? 1 : 0.25) : 1;
          return [a, b, mix3(hexRGB(catOf(data.nodes[idx.get(e.a)].cat).color), hexRGB(catOf(data.nodes[idx.get(e.b)].cat).color), 0.5).map((x) => x * k * dim)];
        });
        memLines = lines(pp, (i) => pp[i][2], memLineMat, brain); memLines.renderOrder = 2;
        memPulses = points(pulseGeo(pp, 0.7, 11), memPulseMat, brain); memPulses.renderOrder = 2;
      }
    }

    // region labels outside, thought labels inside
    const labelEls = new Map();
    function paintLabels() {
      const have = new Set(data.nodes.filter((n) => !hidden.has(n.cat)).map((n) => n.cat));
      for (const [id, el] of labelEls) if (!have.has(id)) { el.remove(); labelEls.delete(id); }
      for (const id of have) if (!labelEls.has(id) && REGION[id]) { const c = catOf(id), el = h('span', { class: 'br-label', style: `--c:${c.color}` }, h('i'), c.name); labels.append(el); labelEls.set(id, el); }
    }
    function placeLabels(W2, H2) {
      for (const [id, el] of labelEls) {
        const r = REGION[id]; v3.set(r[0], r[1] + 0.2, r[2]); brain.localToWorld(v3); const depth = v3.z; v3.project(camera);
        el.style.transform = `translate(${((v3.x + 1) / 2 * W2).toFixed(1)}px, ${((1 - v3.y) / 2 * H2).toFixed(1)}px) translate(-50%, -50%)`;
        el.style.opacity = (clamp((depth + 0.25) / 0.5, 0, 1) * 0.85 * (selected && selected.cat !== id ? 0.35 : 1)).toFixed(2);
      }
    }
    const pool = Array.from({ length: 8 }, () => { const el = h('div', { class: 'br-inlabel' }, h('i'), h('span'), h('em')); inLabels.append(el); return el; });
    function placeInLabels(W2, H2, show) {
      const cand = [];
      if (show > 0.01) inNodes.forEach((n, i) => {
        if (cur && n.id === cur.id) return;
        v3.fromArray(inPos[i]); const d = v3.distanceTo(inCam.position); if (d > 30) return;
        v3.project(inCam); if (v3.z > 1 || Math.abs(v3.x) > 1.02 || Math.abs(v3.y) > 1.02) return;
        cand.push([d, n, (v3.x + 1) / 2 * W2, (1 - v3.y) / 2 * H2]);
      });
      cand.sort((a, b) => a[0] - b[0]);
      pool.forEach((el, k) => {
        const c = cand[k]; if (!c) { el.style.opacity = '0'; return; }
        const [d, n, x, y] = c;
        if (el._id !== n.id) { el._id = n.id; el.style.setProperty('--c', catOf(n.cat).color); el.children[1].textContent = cut(n.text, 46); el.children[2].textContent = n.example ? 'пример' : n.cat === 'people' ? 'человек' : catOf(n.cat).name.toLowerCase(); el.classList.toggle('ex', !!n.example); }
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(14px, -50%)`;
        el.style.opacity = (show * clamp(1 - (d - 7) / 20, 0, 1) * (k < 6 ? 1 : 0.5)).toFixed(2);
      });
    }

    // ── motion ─────────────────────────────────────────────────────────────────
    const red = reduced();
    let yaw = -1.25, pitch = 0.24, vYaw = 0, vPitch = 0, dist = 5.0, distT = 3.75;
    const look = new THREE.Vector3(0, -0.04, 0), lookT = look.clone();
    let focusYaw = null, focusPitch = null, drag = null, lastInteract = 0, clock = 0, last = performance.now(), raf = 0, nextBurst = 2.5, hover = null;
    let cur = null, trip = null, flight = null, ways = [], waysKey = '', waysAt = 0, inIdle = 0;
    const off = new THREE.Vector3(0, 0.6, 3.4), Y = new THREE.Vector3(0, 1, 0), inLook = new THREE.Vector3();
    const nodeV = (n) => tmp2.fromArray(inPos[inIdx.get(n.id)]);
    const project = (i) => { v3.set(starPos[i * 3], starPos[i * 3 + 1], starPos[i * 3 + 2]); brain.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * canvas.clientWidth, (1 - v3.y) / 2 * canvas.clientHeight, v3.z]; };
    function pick(x, y) {
      let best = null, bd = 18 * 18;
      if (mode === 'out') data.nodes.forEach((n, i) => { if (!starState || starState[i] < 1.5) return; const [px, py, pz] = project(i); if (pz > 1) return; const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = n; } });
      else if (mode === 'in') { bd = 28 * 28; inNodes.forEach((n, i) => { v3.fromArray(inPos[i]).project(inCam); if (v3.z > 1) return; const px = (v3.x + 1) / 2 * canvas.clientWidth, py = (1 - v3.y) / 2 * canvas.clientHeight, d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = n; } }); }
      return best;
    }

    // inside: the ways on from the current thought — linked ones first, then the nearest — each given a screen direction
    function computeWays() {
      if (!cur) { ways = []; return; }
      const p0 = inPos[inIdx.get(cur.id)], list = [];
      for (const e of inEdges) if (e.a === cur.id || e.b === cur.id) { const o = inNodes[inIdx.get(e.a === cur.id ? e.b : e.a)]; if (o && !list.some((w) => w.node === o)) list.push({ node: o }); }
      const d2 = (n) => { const q = inPos[inIdx.get(n.id)]; return (q[0] - p0[0]) ** 2 + (q[1] - p0[1]) ** 2 + (q[2] - p0[2]) ** 2; };
      for (const n of inNodes.filter((m) => m !== cur && !list.some((w) => w.node === m)).sort((a, b) => d2(a) - d2(b))) { if (list.length >= 4) break; list.push({ node: n, near: true }); }
      inCam.updateMatrixWorld();
      const pairs = [];
      list.forEach((w, k) => { v3.fromArray(inPos[inIdx.get(w.node.id)]).applyMatrix4(inCam.matrixWorldInverse); const l = Math.hypot(v3.x, v3.y) || 1;
        for (const [d, [dx, dy]] of Object.entries(DIRS)) pairs.push([(v3.x * dx + v3.y * dy) / l - (w.near ? 0.15 : 0), k, d]); });
      pairs.sort((a, b) => b[0] - a[0]); const used = new Set(), taken = new Set();
      for (const [score, k, d] of pairs) if (!used.has(k) && !taken.has(d) && score > -0.35) { list[k].dir = d; used.add(k); taken.add(d); }
      ways = list;
      for (const [d, el] of Object.entries(arrows)) { const w = ways.find((x) => x.dir === d); el.disabled = !w || !!trip; el.children[1].textContent = w ? cut(w.node.text, 34) : ''; el.setAttribute('aria-label', w ? 'Перейти: ' + w.node.text : 'Нет пути'); el.style.setProperty('--c', w ? catOf(w.node.cat).color : 'transparent'); }
      const key = cur.id + ':' + ways.map((w) => w.node.id + (w.dir || '')).join(',');
      if (key !== waysKey) { waysKey = key; paintCard(); }
    }
    function travel(n) {
      if (mode !== 'in' || !cur || !n || n.id === cur.id || !inIdx.has(n.id)) return;
      if (trip) return;
      const a = nodeV(cur).clone(), b = nodeV(n).clone(), dir = b.clone().sub(a), len = dir.length(); dir.normalize();
      const side = new THREE.Vector3().crossVectors(dir, Y); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      const end = b.clone().addScaledVector(dir, -3.2).addScaledVector(Y, 0.7).addScaledVector(side, 0.5);
      const ctrl = a.clone().lerp(b, 0.45).addScaledVector(Y, 0.9);
      trip = { p0: inCam.position.clone(), ctrl, p1: end, l0: inLook.clone(), l1: b, t0: clock, dur: red ? 0.01 : clamp(0.9 + len * 0.05, 1.1, 2.6), next: n };
      for (const el of Object.values(arrows)) el.disabled = true;
      IBURST.value.set(a.x, a.y, a.z, T.value);
    }
    function step(d) { const w = ways.find((x) => x.dir === d); if (w && !trip && mode === 'in') travel(w.node); }

    function enter(n) {
      if (mode !== 'out') return;
      n = n && inIdx.has(n.id) ? inNodes[inIdx.get(n.id)] : inNodes.slice().sort((a, b) => (b.weight || 1) - (a.weight || 1) || b.created - a.created)[0];
      if (!n) return;
      brain.updateMatrixWorld(); const local = tmp.fromArray(inPos[inIdx.get(n.id)]).multiplyScalar(1 / S16).clone(), target = brain.localToWorld(local.clone());
      const back = camera.position.clone().sub(target).normalize();
      flight = { kind: 'in', t0: clock, dur: red ? 0.01 : 2.6, p0: camera.position.clone(), l0: look.clone(), p1: target.clone().addScaledVector(back, 3.4 / S16).add(new THREE.Vector3(0, 0.6 / S16, 0)), l1: target, f0: camera.fov, f1: 62 };
      cur = n; ways = []; waysKey = ''; setMode('flyIn'); paintCard(); tip.classList.remove('on'); closeResults();
      BURST.value.set(local.x, local.y, local.z, T.value); refresh();
    }
    function exit() {
      if (mode !== 'in') return; trip = null;
      brain.updateMatrixWorld();
      camera.position.copy(brain.localToWorld(inCam.position.clone().multiplyScalar(1 / S16))); camera.quaternion.copy(brain.quaternion).multiply(inCam.quaternion);
      const lk = brain.localToWorld(inLook.clone().multiplyScalar(1 / S16));
      look.set(0, -0.04, 0); lookT.copy(look); dist = distT = 3.75; focusYaw = focusPitch = null;
      flight = { kind: 'out', t0: clock, dur: red ? 0.01 : 2.1, p0: camera.position.clone(), l0: lk, p1: new THREE.Vector3(look.x, look.y + 0.05, look.z + 3.75), l1: look.clone(), f0: inCam.fov, f1: canvas.clientWidth / canvas.clientHeight < 0.8 ? 46 : 34 };
      setMode('flyOut'); paintCard(); lastInteract = clock;
    }
    const syncInner = () => {                                                     // the inside camera is the outside one, ×16, in the brain's frame
      brain.updateMatrixWorld(); camera.updateMatrixWorld();
      inCam.position.copy(brain.worldToLocal(camera.position.clone())).multiplyScalar(S16);
      inCam.quaternion.copy(brain.quaternion).invert().multiply(camera.quaternion);
      inCam.fov = camera.fov; inCam.aspect = camera.aspect; inCam.updateProjectionMatrix(); inCam.updateMatrixWorld();
    };

    // input
    const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e) => { if (e.button > 0 || mode === 'flyIn' || mode === 'flyOut') return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, hist: [[performance.now(), e.clientX, e.clientY]] }; canvas.setPointerCapture?.(e.pointerId); lastInteract = inIdle = clock; };
    const move = (e) => {
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        if (!drag.moved) { drag.moved = true; focusYaw = focusPitch = null; canvas.classList.add('grab'); tip.classList.remove('on'); }
        const ph = drag.hist.at(-1), mx = e.clientX - ph[1], my = e.clientY - ph[2];
        if (mode === 'out') { yaw += mx * 0.0062; pitch = clamp(pitch + my * 0.0045, -0.9, 0.9); }
        else if (mode === 'in' && !trip) {
          off.applyAxisAngle(Y, -mx * 0.005);
          const right = tmp.crossVectors(off, Y).normalize(), el = Math.asin(clamp(off.y / off.length(), -1, 1)), dp = clamp(my * 0.004, el - 1.2, el + 1.2);
          if (right.lengthSq() > 1e-6) off.applyAxisAngle(right, dp);
        }
        drag.hist.push([performance.now(), e.clientX, e.clientY]); if (drag.hist.length > 6) drag.hist.shift(); lastInteract = inIdle = clock; return;
      }
      if (e.pointerType === 'touch' || (mode !== 'out' && mode !== 'in')) return;
      const [x, y] = at(e), n = pick(x, y);
      if (n !== hover) { hover = n; canvas.style.cursor = n ? 'pointer' : ''; }
      if (n && mode === 'out') { tip.replaceChildren(h('i', { style: `--c:${catOf(n.cat).color}` }), h('span', null, n.text)); tip.style.transform = `translate(${Math.min(x + 14, canvas.clientWidth - 280)}px, ${y + 14}px)`; tip.classList.add('on'); }
      else tip.classList.remove('on');
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; canvas.classList.remove('grab');
      if (d.moved) {
        if (mode === 'in') { computeWays(); return; }
        const now = performance.now(), rec = d.hist.filter((p) => now - p[0] < 100), a = rec[0], b = rec.at(-1), dt = a && b ? (b[0] - a[0]) / 1000 : 0;
        vYaw = dt > 0.01 && !red ? clamp((b[1] - a[1]) / dt * 0.0062, -6, 6) : 0; vPitch = dt > 0.01 && !red ? clamp((b[2] - a[2]) / dt * 0.0045, -4, 4) : 0; return;
      }
      const [x, y] = at(e), n = pick(x, y);
      if (mode === 'in') { if (n) travel(n); return; }
      select(n && n.id === selected?.id ? null : n);
    };
    const wheel = (e) => { e.preventDefault(); const k = Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)); if (mode === 'out') distT = clamp(distT * k, 2.3, 7); else if (mode === 'in' && !trip) off.setLength(clamp(off.length() * k, 1.6, 12)); lastInteract = inIdle = clock; };
    const leave = () => { tip.classList.remove('on'); hover = null; };
    const keys = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (mode === 'in' && KEYS[e.key]) { e.preventDefault(); step(KEYS[e.key]); }
      else if (e.key === 'Escape') { if (mode === 'in') exit(); else if (selected) select(null); }
    };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('pointerleave', leave); window.addEventListener('keydown', keys);

    function focus(n) {
      if (!n || !idx.has(n.id)) { focusYaw = focusPitch = null; distT = 3.75; lookT.set(0, -0.04, 0); return; }
      const i = idx.get(n.id), x = starPos[i * 3], y = starPos[i * 3 + 1], z = starPos[i * 3 + 2];
      focusYaw = yaw + wrap(Math.atan2(-x, z) - yaw); focusPitch = clamp(Math.atan2(y, Math.hypot(x, z) + 1.2) * 0.9, -0.5, 0.6);
      distT = 2.95; lookT.set(0, y * 0.35, 0); vYaw = vPitch = 0; BURST.value.set(x, y, z, T.value);
    }

    function resize() {
      const w = canvas.clientWidth, hgt = canvas.clientHeight; if (!w || !hgt) return;
      const dpr = Math.min(1.5, devicePixelRatio || 1); renderer.setPixelRatio(dpr); renderer.setSize(w, hgt, false);
      camera.aspect = inCam.aspect = w / hgt; if (mode === 'out') camera.fov = w / hgt < 0.8 ? 46 : 34; camera.updateProjectionMatrix(); inCam.updateProjectionMatrix();
      PX.value = hgt * dpr / 520;
    }
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
      T.value += dt * (red ? 0.4 : 1); OUTW.uWave.value = red ? -3 : ((clock * 0.32) % 3.2) - 1.6;
      const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
      let outFade = 1, inFade = 0, labelShow = 0;
      if (mode === 'out') {
        if (!drag) {
          if (focusYaw != null) { yaw += (focusYaw - yaw) * Math.min(1, dt * 3.2); pitch += (focusPitch - pitch) * Math.min(1, dt * 3.2); }
          else { yaw += vYaw * dt; pitch = clamp(pitch + vPitch * dt, -0.9, 0.9); const f = Math.pow(0.06, dt); vYaw *= f; vPitch *= f;
            if (!red && clock - lastInteract > 2.5 && !selected) { yaw += 0.07 * dt; pitch += (0.24 - pitch) * dt * 0.4; } }
        }
        brain.rotation.set(pitch, yaw, 0, 'XYZ');
        dist += (distT - dist) * Math.min(1, dt * 3); look.lerp(lookT, Math.min(1, dt * 3));
        camera.position.set(look.x, look.y + 0.05, look.z + dist); camera.lookAt(look);
        outFade = OUT.uFade.value = Math.min(1, OUT.uFade.value + dt * 0.7);
      } else if (flight) {
        const t = clamp((clock - flight.t0) / flight.dur, 0, 1), e = ease(t);
        camera.position.lerpVectors(flight.p0, flight.p1, e); camera.fov = flight.f0 + (flight.f1 - flight.f0) * e; camera.updateProjectionMatrix();
        tmp.lerpVectors(flight.l0, flight.l1, flight.kind === 'in' ? Math.min(1, ease(Math.min(1, t * 1.6))) : e); camera.lookAt(tmp);
        syncInner(); inLook.copy(brain.worldToLocal(tmp.clone())).multiplyScalar(S16);
        const k = flight.kind === 'in' ? e : 1 - e;
        outFade = 1 - smooth(0.55, 0.92, k); inFade = smooth(0.42, 0.88, k); labelShow = smooth(0.86, 1, k);
        if (t >= 1) {
          const kind = flight.kind; flight = null;
          if (kind === 'in') { setMode('in'); off.copy(inCam.position).sub(nodeV(cur)); inLook.copy(nodeV(cur)); inIdle = clock; refresh(); computeWays(); paintCard(); }
          else { setMode('out'); cur = null; ways = []; refresh(); paintCard(); }
        }
      } else if (mode === 'in') {
        inFade = 1; outFade = 0; labelShow = 1;
        if (trip) {
          const t = clamp((clock - trip.t0) / trip.dur, 0, 1), e = ease(t), u = 1 - e;
          inCam.position.set(0, 0, 0).addScaledVector(trip.p0, u * u).addScaledVector(trip.ctrl, 2 * u * e).addScaledVector(trip.p1, e * e);
          inLook.lerpVectors(trip.l0, trip.l1, ease(Math.min(1, t * 1.25)));
          if (t >= 1) { cur = trip.next; trip = null; off.copy(inCam.position).sub(nodeV(cur)); inIdle = clock; refresh(); computeWays(); const p = nodeV(cur); IBURST.value.set(p.x, p.y, p.z, T.value); }
        } else {
          if (!red && !drag && clock - inIdle > 3) off.applyAxisAngle(Y, 0.035 * dt);
          const p = nodeV(cur); inLook.lerp(p, Math.min(1, dt * 4)); inCam.position.copy(p).add(off);
          if (clock - waysAt > 0.5 && !drag) { waysAt = clock; computeWays(); }
        }
        inCam.lookAt(inLook); inCam.updateMatrixWorld();
      }
      // inside, the card takes the right side: shift the picture so the current thought sits in the middle of what is left
      const shift = W2 > 900 ? 190 * (mode === 'in' ? 1 : flight ? smooth(0.3, 1, flight.kind === 'in' ? ease(clamp((clock - flight.t0) / flight.dur, 0, 1)) : 1 - ease(clamp((clock - flight.t0) / flight.dur, 0, 1))) : 0) : 0;
      for (const c of [camera, inCam]) { if (shift > 0.5) c.setViewOffset(W2, H2, shift, 0, W2, H2); else if (c.view?.enabled) c.clearViewOffset(); }
      if (mode !== 'out') OUT.uFade.value = outFade;
      IN.uFade.value = inFade;
      if (!red && clock > nextBurst) { const p = N.pts[Math.floor(Math.random() * N.pts.length)]; BURST.value.set(p[0], p[1], p[2], T.value); if (mode !== 'in' || !trip) { const q = W.pts[Math.floor(Math.random() * W.pts.length)]; IBURST.value.set(q[0], q[1], q[2], T.value); } nextBurst = clock + 4 + Math.random() * 4; }
      if (fly && stars) {
        const t = clamp((clock - fly.t0) / 1.4, 0, 1), e = 1 - Math.pow(1 - t, 3), arc = Math.sin(t * Math.PI) * 0.25;
        for (let k = 0; k < 3; k++) starPos[fly.i * 3 + k] = fly.from[k] + (fly.to[k] - fly.from[k]) * e + (k === 1 ? arc : 0);
        stars.geometry.attributes.position.needsUpdate = true;
        if (t >= 1) { const i = fly.i; fly = null; BURST.value.set(starPos[i * 3], starPos[i * 3 + 1], starPos[i * 3 + 2], T.value); refresh(); }
      }
      if (mode === 'out' || flight) placeLabels(W2, H2); labels.style.opacity = String(outFade);
      placeInLabels(W2, H2, labelShow); inLabels.style.opacity = String(labelShow);
      renderer.clear();
      if (outFade > 0.003) renderer.render(outScene, camera);
      if (inFade > 0.003) renderer.render(inScene, inCam);
    }
    const vis = () => { cancelAnimationFrame(raf); raf = 0; if (!document.hidden && alive) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    raf = requestAnimationFrame(frame);

    gl = {
      setData, refresh, enter, exit, travel, step, current: () => cur, ways: () => ways,
      dbg: () => ({ cur: cur?.id, st: inState && Array.from(inState), cam: inCam.position.toArray().map((v) => +v.toFixed(2)), node: cur && inPos[inIdx.get(cur.id)].map((v) => +v.toFixed(2)), look: inLook.toArray().map((v) => +v.toFixed(2)), fade: IN.uFade.value, k: inStarMat.uniforms.uK.value, px: PX.value }),
      pose: (y, p) => { yaw = y; pitch = p; vYaw = vPitch = 0; lastInteract = clock + 1e6; },
      focus: (n) => { focus(n); if (!n) BURST.value.w = -1; },
      destroy() {
        cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('keydown', keys);
        canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('pointerleave', leave);
        [stars, memLines, memPulses, ...inObjs, ...fixed].forEach((o) => o?.geometry.dispose());
        disposables.forEach((d) => d.dispose()); renderer.dispose(); renderer.forceContextLoss?.();
      },
    };
    setData(); return true;
  }

  // ── start ──────────────────────────────────────────────────────────────────
  paintCats(); paintLegend(); paintStats();
  const hasGL = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
  styled('/worlds/brain.css').then(async () => { if (!alive) return; if (!hasGL) listMode(); else await start3D(); if (alive) load(); });

  return { root, pose: (y, p) => gl?.pose(y, p), enter: (id) => visit(data.nodes.find((n) => n.id === id) || null), step: (d) => gl?.step(d), exit: () => gl?.exit(), dbg: () => gl?.dbg(),
    destroy() { alive = false; gl?.destroy(); gl = null; document.removeEventListener('visibilitychange', onVisible); document.removeEventListener('pointerdown', outsideClick); } };
}
