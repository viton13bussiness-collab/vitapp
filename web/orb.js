// VIT's orb: a universe of knowledge inside a sphere. A spiral galaxy of stars, nebulae in the colours of memory,
// colour pouring into the orange core, and a supernova each time VIT remembers something new.
export const MEM_COLORS = ['#ff375f', '#bf5af2', '#0a84ff', '#30d158', '#ffd60a', '#ff9f0a', '#66d4cf', '#64d2ff'];
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const CAT = MEM_COLORS.map(hexRGB);
const rnd = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp = (x) => Math.max(0, Math.min(1, x)), eo = (x) => 1 - Math.pow(1 - clamp(x), 3), mix = (a, b, k) => a + (b - a) * k;
const ARMS = 4, WIND = 1.75, armTh = (arm, rad) => arm * (6.283 / ARMS) + Math.log(rad * 6 + 1) * WIND;

function sprite(stops) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); for (const [o, col] of stops) gr.addColorStop(o, col); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; }
const cache = new Map();
const glow = (rgb) => cache.get('g' + rgb) || (cache.set('g' + rgb, sprite([[0, 'rgba(255,255,255,1)'], [0.15, `rgba(${rgb},0.9)`], [0.45, `rgba(${rgb},0.2)`], [1, `rgba(${rgb},0)`]])), cache.get('g' + rgb));
const soft = (rgb) => cache.get('s' + rgb) || (cache.set('s' + rgb, sprite([[0, `rgba(${rgb},0.55)`], [0.5, `rgba(${rgb},0.16)`], [1, `rgba(${rgb},0)`]])), cache.get('s' + rgb));
function nebula(rgb, seed) { const key = 'n' + rgb + ':' + seed; if (cache.has(key)) return cache.get(key); const c = document.createElement('canvas'); c.width = c.height = 192; const g = c.getContext('2d'), r = rnd(seed);
  for (let i = 0; i < 30; i++) { const x = 96 + (r() - 0.5) * 120, y = 96 + (r() - 0.5) * 90, rad = 18 + r() * 52, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${rgb},${0.14 + r() * 0.16})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 192, 192); }
  cache.set(key, c); return c; }

function build() { const r = rnd(9090), stars = [], gas = [], neb = [], clOf = (arm, rad) => (arm * 2 + (rad > 0.52 ? 1 : 0)) % 8;
  for (let i = 0; i < 2600; i++) { const u = r(); let rad, th, h, cl, kind;
    if (u < 0.6) { kind = 0; rad = Math.pow(r(), 0.8) * 0.9 + 0.06; const arm = Math.floor(r() * ARMS); th = armTh(arm, rad) + (r() + r() + r() - 1.5) * 0.42 * (1 - rad * 0.35); h = (r() + r() - 1) * 0.05 * (1 - rad * 0.5); cl = clOf(arm, rad); }
    else if (u < 0.76) { kind = 1; rad = Math.pow(r(), 1.8) * 0.24; th = r() * 6.283; h = (r() + r() - 1) * 0.12 * (1 - rad * 3); cl = -1; }
    else { kind = 2; const d = [r() - 0.5, r() - 0.5, r() - 0.5], l = Math.hypot(...d), rr = 0.2 + Math.cbrt(r()) * 0.78; rad = Math.hypot(d[0], d[2]) / l * rr; th = Math.atan2(d[2], d[0]); h = d[1] / l * rr; cl = Math.floor(r() * 8); }
    const bright = r() < 0.03; stars.push({ rad, th, h, cl, kind, s: bright ? 1.4 + r() * 1.6 : 0.5 + r(), bright, ph: r() * 6.283, white: r() < 0.3, dr: (r() - 0.5) * 0.04 }); }
  for (let i = 0; i < 420; i++) { const arm = Math.floor(r() * ARMS), rad = 0.12 + Math.pow(r(), 0.9) * 0.8; gas.push({ rad, th: armTh(arm, rad) + (r() - 0.5) * 0.35, h: (r() - 0.5) * 0.04, cl: clOf(arm, rad), s: 0.05 + r() * 0.08, ph: r() * 6.283 }); }
  for (let i = 0; i < 18; i++) { const arm = i % ARMS, rad = 0.2 + r() * 0.68; neb.push({ rad, th: armTh(arm, rad) + (r() - 0.5) * 0.25, h: 0, cl: clOf(arm, rad), sz: 0.26 + r() * 0.3, rot: r() * 6.283, seed: i * 31 + 7 }); }
  const hubs = CAT.map((_, k) => { const arm = Math.floor(k / 2), rad = k % 2 ? 0.74 : 0.4; return { rad, th: armTh(arm, rad), h: 0, cl: k }; });
  return { stars, gas, neb, hubs }; }
let GAL;

/** createOrb(canvas) → { state(name), amp(0..1), burst(colourIndex), stop() }. States: idle · listen · think · speak. */
export function createOrb(canvas, { size = 520 } = {}) {
  GAL ||= build();
  const ui = canvas.getContext('2d'); canvas.width = canvas.height = size;
  const X = size / 2, Y = size / 2, R = size * 0.4;
  let st = 'idle', amp = 0, ampT = 0, speed = 1, speedT = 1, t = 0, last = 0, raf = 0, rot = 0; const bursts = [];
  const rotate = (x, y, z, tilt, spin) => { const ct = Math.cos(tilt), stt = Math.sin(tilt); [y, z] = [y * ct - z * stt, y * stt + z * ct]; const cs = Math.cos(spin), ss = Math.sin(spin); return [x * cs + z * ss, y, -x * ss + z * cs]; };

  function frame(ms) {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (ms - last) / 1000 || 0.016); last = ms;
    speedT = st === 'think' ? 3.2 : st === 'listen' ? 1.6 : st === 'speak' ? 1.4 : 1; speed += (speedT - speed) * dt * 3; amp += (ampT - amp) * dt * 10;
    if (st === 'speak') ampT = 0.35 + 0.3 * Math.sin(ms / 90) * Math.sin(ms / 230); else if (st === 'think') ampT = 0.25 + 0.15 * Math.sin(ms / 300); else if (st !== 'listen') ampT = 0;
    t += dt; rot -= dt * 0.16 * speed;
    const tilt = 1.02 + 0.06 * Math.sin(t * 0.21), spin = 0.35 + 0.18 * Math.sin(t * 0.13);
    const P = (o) => { const th = o.th + rot + (o.dr || 0) * t, [x, y, z] = rotate(o.rad * Math.cos(th), o.h, o.rad * Math.sin(th), tilt, spin); return [X + x * R, Y + y * R, z]; };
    ui.clearRect(0, 0, size, size); ui.save();
    const og = ui.createRadialGradient(X, Y, R * 0.9, X, Y, R * 1.24); og.addColorStop(0, `rgba(255,120,40,${0.16 + amp * 0.2})`); og.addColorStop(0.5, `rgba(120,80,255,${0.07 + amp * 0.08})`); og.addColorStop(1, 'rgba(120,80,255,0)'); ui.fillStyle = og; ui.beginPath(); ui.arc(X, Y, R * 1.24, 0, 6.283); ui.fill();
    const base = ui.createRadialGradient(X - R * 0.2, Y - R * 0.25, R * 0.1, X, Y, R); base.addColorStop(0, '#100c22'); base.addColorStop(0.7, '#06050f'); base.addColorStop(1, '#010103'); ui.fillStyle = base; ui.beginPath(); ui.arc(X, Y, R, 0, 6.283); ui.fill();
    ui.beginPath(); ui.arc(X, Y, R * 0.995, 0, 6.283); ui.clip(); ui.globalCompositeOperation = 'lighter';
    for (const b of bursts) { ui.globalAlpha = 0.35 * Math.exp(-((t - b.t0) / 1.9) * 5); ui.drawImage(soft(b.rgb), X - R, Y - R, R * 2, R * 2); }
    for (const nb of GAL.neb) { const [px, py, z] = P(nb), c0 = CAT[nb.cl], c1 = CAT[(nb.cl + 3) % 8], f = 0.5 + 0.5 * Math.sin(t * 0.3 + nb.rot), rgb = c0.map((v, i) => Math.round(mix(v, c1[i], f * 0.45) / 16) * 16), sz = R * nb.sz;
      ui.save(); ui.globalAlpha = Math.min(1, (0.22 + 0.2 * (1 - (z + 1) / 2)) * (0.85 + amp * 0.7)); ui.translate(px, py); ui.rotate(nb.rot + t * 0.04); ui.scale(1, 0.6); ui.drawImage(nebula(rgb, nb.seed), -sz, -sz, sz * 2, sz * 2); ui.restore(); }
    for (const g of GAL.gas) { const [px, py, z] = P(g), sz = R * g.s; ui.globalAlpha = (0.08 + 0.1 * (1 - (z + 1) / 2)) * (1 - 0.6 * clamp(1 - g.rad * 3)) * (0.8 + 0.2 * Math.sin(t * 1.3 + g.ph)); ui.drawImage(soft(CAT[g.cl]), px - sz, py - sz * 0.7, sz * 2, sz * 1.4); }
    // colour pours into the core: faster while VIT thinks
    const HP = GAL.hubs.map((h) => { const [x, y] = P(h); return { x, y, cl: h.cl, rad: h.rad, th: h.th }; });
    for (const h of HP) for (let j = 0; j < 14; j++) { const q = (t * 0.32 * (0.6 + speed * 0.4) + j / 14 + h.cl * 0.11) % 1, rad = h.rad * (1 - q) + 0.02, th = h.th + q * 2.4 + rot, [x, y] = rotate(rad * Math.cos(th), 0, rad * Math.sin(th), tilt, spin), sz = Math.max(2, R * 0.018) * (0.5 + q);
      ui.globalAlpha = Math.sin(q * Math.PI) * (1 - q * 0.7) * 0.6; ui.drawImage(glow(CAT[h.cl]), X + x * R - sz, Y + y * R - sz, sz * 2, sz * 2); }
    ui.globalAlpha = 1; ui.lineWidth = Math.max(1, R / 200);
    const pairs = [[0, 3], [1, 5], [2, 6], [4, 7], [0, 5], [2, 7], [3, 6], [1, 4]];
    pairs.forEach(([a, b], k) => { const A = HP[a], B = HP[b], col = CAT[A.cl].map((v, i) => Math.round((v + CAT[B.cl][i]) / 2)), mx = (A.x + B.x) / 2 + (A.y - B.y) * 0.16, my = (A.y + B.y) / 2 + (B.x - A.x) * 0.16;
      ui.strokeStyle = `rgba(${col},0.34)`; ui.beginPath(); ui.moveTo(A.x, A.y); ui.quadraticCurveTo(mx, my, B.x, B.y); ui.stroke();
      const q = (t * 0.5 * speed + k * 0.17) % 1, px = (1 - q) ** 2 * A.x + 2 * (1 - q) * q * mx + q * q * B.x, py = (1 - q) ** 2 * A.y + 2 * (1 - q) * q * my + q * q * B.y, sp = Math.max(4, R * 0.035); ui.drawImage(glow('255,255,255'), px - sp, py - sp, sp * 2, sp * 2); });
    for (const h of HP) { const sz = R * 0.055 * (1 + 0.15 * Math.sin(t * 2.2 + h.cl)); ui.drawImage(glow(CAT[h.cl]), h.x - sz, h.y - sz, sz * 2, sz * 2); }
    const sc = Math.max(0.6, R / 300);
    for (const s of GAL.stars) { const [px, py, z] = P(s), front = 1 - (z + 1) / 2, tw = s.bright ? 0.65 + 0.35 * Math.sin(t * 4 + s.ph) : 0.75 + 0.25 * Math.sin(t * 2.4 + s.ph);
      const rgb = s.kind === 1 ? [255, Math.round(160 + 70 * (1 - s.rad / 0.24)), 100] : s.white || s.cl < 0 ? [232, 236, 255] : CAT[s.cl], a = (0.3 + 0.7 * front) * tw;
      if (s.bright) { const sz = (s.s * 4 + 3) * sc; ui.globalAlpha = Math.min(1, a); ui.drawImage(glow(rgb), px - sz, py - sz, sz * 2, sz * 2); }
      else { const sz = Math.max(0.8, s.s * sc * (0.75 + 0.5 * front)); ui.globalAlpha = 1; ui.fillStyle = `rgba(${rgb},${Math.min(1, a).toFixed(3)})`; ui.fillRect(px - sz / 2, py - sz / 2, sz, sz); } }
    ui.globalAlpha = 1;
    const cr = R * (0.15 + 0.02 * Math.sin(t * 2.3) + 0.09 * amp);
    ui.save(); ui.translate(X, Y); ui.scale(1, 0.82); const bg = ui.createRadialGradient(0, 0, 0, 0, 0, cr * 3.2); bg.addColorStop(0, 'rgba(255,140,40,0.7)'); bg.addColorStop(0.4, 'rgba(255,80,10,0.28)'); bg.addColorStop(1, 'rgba(255,60,0,0)'); ui.fillStyle = bg; ui.beginPath(); ui.arc(0, 0, cr * 3.2, 0, 6.283); ui.fill(); ui.restore();
    const cg = ui.createRadialGradient(X, Y, 0, X, Y, cr * 1.6); cg.addColorStop(0, 'rgba(255,248,230,1)'); cg.addColorStop(0.12, 'rgba(255,190,90,0.95)'); cg.addColorStop(0.4, 'rgba(255,110,20,0.6)'); cg.addColorStop(1, 'rgba(255,70,0,0)'); ui.fillStyle = cg; ui.beginPath(); ui.arc(X, Y, cr * 1.6, 0, 6.283); ui.fill();
    ui.globalCompositeOperation = 'source-over'; const ed = ui.createRadialGradient(X, Y, R * 0.72, X, Y, R); ed.addColorStop(0, 'rgba(2,2,6,0)'); ed.addColorStop(1, 'rgba(2,2,6,0.92)'); ui.fillStyle = ed; ui.fillRect(X - R, Y - R, R * 2, R * 2); ui.globalCompositeOperation = 'lighter';
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i], q = (t - b.t0) / 1.9; if (q > 1) { bursts.splice(i, 1); continue; }
      const [px, py] = P(b.star), fl = Math.exp(-q * 7) * 1.3, fs = R * (0.06 + 0.24 * eo(q * 4)); ui.globalAlpha = Math.min(1, fl); ui.drawImage(glow('255,255,255'), px - fs, py - fs, fs * 2, fs * 2); ui.drawImage(glow(b.rgb), px - fs * 2, py - fs * 2, fs * 4, fs * 4);
      ui.globalAlpha = 1; ui.save(); ui.translate(px, py); ui.scale(1, 0.6); ui.strokeStyle = `rgba(255,255,255,${(0.6 * (1 - q)).toFixed(3)})`; ui.lineWidth = Math.max(1, R / 160); ui.beginPath(); ui.arc(0, 0, R * 0.42 * eo(q), 0, 6.283); ui.stroke(); ui.restore();
      const rr = rnd(b.seed); for (let j = 0; j < 30; j++) { const a2 = rr() * 6.283, v = (0.12 + rr() * 0.4) * R * eo(q), sz = Math.max(2.5, R * 0.016) * (1 - q * 0.7); ui.globalAlpha = (1 - q) * 0.9; ui.drawImage(glow(j % 3 ? b.rgb : '255,230,200'), px + Math.cos(a2) * v - sz, py + Math.sin(a2) * v * 0.6 - sz, sz * 2, sz * 2); } }
    ui.restore();
    const hl = ui.createRadialGradient(X - R * 0.42, Y - R * 0.52, 0, X - R * 0.42, Y - R * 0.52, R * 0.5); hl.addColorStop(0, 'rgba(255,255,255,0.13)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ui.fillStyle = hl; ui.beginPath(); ui.arc(X, Y, R, 0, 6.283); ui.fill();
  }
  const visible = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', visible); visible();
  return {
    state(s) { st = s; if (s !== 'listen') ampT = 0; },
    amp(a) { ampT = clamp(a); },
    burst(ci = Math.floor(Math.random() * 8)) { bursts.push({ t0: t, rgb: CAT[((ci % 8) + 8) % 8].join(','), star: GAL.stars[Math.floor(Math.random() * 1500)], seed: Math.floor(Math.random() * 1e6) }); },
    stop() { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visible); },
  };
}
