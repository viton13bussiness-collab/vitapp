// VIT's sign in plain 2D canvas (see orb.js for the WebGL cosmos): stardust turning as a four-armed pinwheel. No sphere, no frame — thousands of points in the colours of memory
// around a warm core. It speeds up while VIT thinks, breathes with the voice, and flares when VIT remembers something new.
export const MEM_COLORS = ['#ff375f', '#bf5af2', '#0a84ff', '#30d158', '#ffd60a', '#ff9f0a', '#66d4cf', '#64d2ff'];
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const CAT = MEM_COLORS.map(hexRGB);
const rnd = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp = (x) => Math.max(0, Math.min(1, x)), eo = (x) => 1 - Math.pow(1 - clamp(x), 3);
const ARMS = 4, WIND = 2.05, armTh = (arm, rad) => arm * (6.283 / ARMS) + Math.log(rad * 7 + 1) * WIND;

const sprites = new Map();
function glow(rgb) { const k = String(rgb); if (sprites.has(k)) return sprites.get(k); const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.14, `rgba(${k},0.9)`); gr.addColorStop(0.45, `rgba(${k},0.18)`); gr.addColorStop(1, `rgba(${k},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); sprites.set(k, c); return c; }

function build(N) { const r = rnd(1313), P = new Array(N);
  for (let i = 0; i < N; i++) { const u = r(); let rad, th, h, cl, kind = 0;
    if (u < 0.74) { rad = 0.05 + Math.pow(r(), 0.72) * 0.95; const arm = Math.floor(r() * ARMS), taper = Math.pow(1 - rad * 0.86, 1.35);              // an arm: thick at the core, a blade at the tip
      th = armTh(arm, rad) + (r() + r() + r() - 1.5) * 0.52 * taper; h = (r() + r() - 1) * 0.045 * taper; cl = (arm * 2 + (rad > 0.5 ? 1 : 0)) % 8; }
    else if (u < 0.9) { kind = 1; rad = Math.pow(r(), 2) * 0.2; th = r() * 6.283; h = (r() + r() - 1) * 0.08 * (1 - rad * 4); cl = -1; }                    // the core
    else { kind = 2; rad = 0.15 + r() * 0.95; th = r() * 6.283; h = (r() + r() - 1) * 0.1; cl = Math.floor(r() * 8); }                                      // loose dust between the arms
    const bright = r() < 0.011;
    P[i] = { rad, th, h, cl, kind, s: bright ? 1.2 + r() * 1.5 : 0.45 + r() * 0.85, bright, ph: r() * 6.283, white: r() < 0.42, dr: (r() - 0.5) * 0.05, a: kind === 2 ? 0.25 + r() * 0.35 : 0.5 + r() * 0.5 }; }
  return P; }
let DUST;

/** The 2D-canvas dust: the fallback when WebGL is missing and the renderer for small canvases. Same handle as the WebGL orb. */
export function createOrb2D(canvas, { size = 560, points = 14000 } = {}) {
  if (!DUST || DUST.length < points) DUST = build(points);
  const ui = canvas.getContext('2d'); canvas.width = canvas.height = size;
  const X = size / 2, Y = size / 2, R = size * 0.47, root = document.documentElement;
  let st = 'idle', amp = 0, ampT = 0, speed = 1, t = 0, last = 0, raf = 0, rot = 0; const bursts = [];
  const rotate = (x, y, z, tilt, spin) => { const ct = Math.cos(tilt), stt = Math.sin(tilt); [y, z] = [y * ct - z * stt, y * stt + z * ct]; const cs = Math.cos(spin), ss = Math.sin(spin); return [x * cs + z * ss, y, -x * ss + z * cs]; };

  function frame(ms) {
    raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (ms - last) / 1000 || 0.016); last = ms;
    const light = root.dataset.theme === 'aurora';
    speed += ((st === 'think' ? 3.4 : st === 'listen' ? 1.7 : st === 'speak' ? 1.5 : 1) - speed) * dt * 3; amp += (ampT - amp) * dt * 10;
    if (st === 'speak') ampT = 0.35 + 0.3 * Math.sin(ms / 90) * Math.sin(ms / 230); else if (st === 'think') ampT = 0.25 + 0.15 * Math.sin(ms / 300); else if (st !== 'listen') ampT = 0;
    t += dt; rot -= dt * 0.2 * speed;
    const tilt = 0.92 + 0.07 * Math.sin(t * 0.21), spin = 0.3 + 0.16 * Math.sin(t * 0.13), swell = 1 + amp * 0.06, sc = Math.max(0.62, size / 560);
    ui.clearRect(0, 0, size, size); ui.globalCompositeOperation = light ? 'source-over' : 'lighter';
    // a breath of light under the dust (none on a light background)
    if (!light) { const cg = ui.createRadialGradient(X, Y, 0, X, Y, R * 0.75); cg.addColorStop(0, `rgba(255,140,50,${0.16 + amp * 0.2})`); cg.addColorStop(0.4, 'rgba(120,80,255,0.045)'); cg.addColorStop(1, 'rgba(120,80,255,0)'); ui.fillStyle = cg; ui.fillRect(0, 0, size, size); }
    for (let i = 0; i < points; i++) { const p = DUST[i], th = p.th + rot * (p.kind === 2 ? 0.7 : 1) + p.dr * t, rad = p.rad * swell;
      const [x, y, z] = rotate(rad * Math.cos(th), p.h, rad * Math.sin(th), tilt, spin), px = X + x * R, py = Y + y * R, front = 1 - (z + 1) / 2;
      const tw = p.bright ? 0.6 + 0.4 * Math.sin(t * 4 + p.ph) : 0.7 + 0.3 * Math.sin(t * 2.2 + p.ph), edge = 1 - clamp((p.rad - 0.82) / 0.3);
      let rgb = p.kind === 1 ? [255, Math.round(165 + 70 * (1 - p.rad / 0.2)), 105] : p.white || p.cl < 0 ? (light ? [40, 40, 52] : [236, 238, 255]) : CAT[p.cl];
      const a = Math.min(1, (0.3 + 0.7 * front) * tw * p.a * edge * (light ? 1.15 : 1)); if (a < 0.03) continue;
      if (p.bright && !light) { const sz = (p.s * 3 + 2.2) * sc; ui.globalAlpha = a; ui.drawImage(glow(rgb), px - sz, py - sz, sz * 2, sz * 2); ui.globalAlpha = 1; }
      else { const sz = Math.max(0.8, p.s * sc * (0.8 + 0.5 * front) * (light ? 1.25 : 1)); ui.fillStyle = `rgba(${rgb},${a.toFixed(3)})`; ui.fillRect(px - sz / 2, py - sz / 2, sz, sz); } }
    // the warm core
    const cr = R * (0.085 + 0.012 * Math.sin(t * 2.3) + 0.06 * amp), core = ui.createRadialGradient(X, Y, 0, X, Y, cr * 2.6);
    core.addColorStop(0, light ? 'rgba(255,150,40,0.95)' : 'rgba(255,248,230,1)'); core.addColorStop(0.16, 'rgba(255,180,80,0.85)'); core.addColorStop(0.45, 'rgba(255,110,20,0.32)'); core.addColorStop(1, 'rgba(255,70,0,0)'); ui.fillStyle = core; ui.beginPath(); ui.arc(X, Y, cr * 2.6, 0, 6.283); ui.fill();
    // a flare where a new memory lands
    for (let i = bursts.length - 1; i >= 0; i--) { const b = bursts[i], q = (t - b.t0) / 1.8; if (q > 1) { bursts.splice(i, 1); continue; }
      const p = b.p, th = p.th + rot + p.dr * t, [x, y] = rotate(p.rad * Math.cos(th), p.h, p.rad * Math.sin(th), tilt, spin), px = X + x * R, py = Y + y * R, fs = R * (0.05 + 0.2 * eo(q * 4));
      ui.globalAlpha = Math.min(1, Math.exp(-q * 6) * 1.3); ui.drawImage(glow(b.rgb), px - fs * 1.6, py - fs * 1.6, fs * 3.2, fs * 3.2); ui.globalAlpha = 1;
      ui.save(); ui.translate(px, py); ui.scale(1, 0.62); ui.strokeStyle = `rgba(${light ? b.rgb : '255,255,255'},${(0.6 * (1 - q)).toFixed(3)})`; ui.lineWidth = Math.max(1, R / 170); ui.beginPath(); ui.arc(0, 0, R * 0.36 * eo(q), 0, 6.283); ui.stroke(); ui.restore();
      const rr = rnd(b.seed); for (let j = 0; j < 28; j++) { const a2 = rr() * 6.283, v = (0.1 + rr() * 0.34) * R * eo(q), sz = Math.max(2, R * 0.014) * (1 - q * 0.7); ui.globalAlpha = (1 - q) * 0.9; ui.drawImage(glow(b.rgb), px + Math.cos(a2) * v - sz, py + Math.sin(a2) * v * 0.62 - sz, sz * 2, sz * 2); } ui.globalAlpha = 1; }
    ui.globalCompositeOperation = 'source-over';
  }
  let paused = false;
  const visible = () => { cancelAnimationFrame(raf); if (!document.hidden && !paused) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', visible); visible();
  return {
    kind: '2d', shape() {},
    state(s) { st = s; if (s !== 'listen') ampT = 0; },
    amp(a) { ampT = clamp(a); },
    burst(ci = Math.floor(Math.random() * 8)) { bursts.push({ t0: t, rgb: CAT[((ci % 8) + 8) % 8].join(','), p: DUST[Math.floor(Math.random() * 3000)], seed: Math.floor(Math.random() * 1e6) }); },
    pause() { paused = true; cancelAnimationFrame(raf); }, resume() { paused = false; visible(); },
    stop() { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visible); },
  };
}
