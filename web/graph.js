// The memory graph: eight kinds of memory around VIT's core, every remembered thought a glowing node, every link a line.
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
const sprites = new Map();
function glow(rgb) { if (sprites.has(rgb)) return sprites.get(rgb); const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, `rgba(${rgb},0.95)`); gr.addColorStop(0.5, `rgba(${rgb},0.22)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); sprites.set(rgb, c); return c; }

export function createGraph(canvas, { cats, onSelect }) {
  const ctx = canvas.getContext('2d'), col = Object.fromEntries(cats.map((c) => [c.id, hexRGB(c.color)]));
  let W = 0, H = 0, dpr = 1, nodes = [], edges = [], hidden = new Set(), hover = null, picked = null, raf = 0, t = 0, dust = [];
  const hubs = cats.map((c, i) => ({ ...c, a: -Math.PI / 2 + (i / cats.length) * Math.PI * 2, x: 0, y: 0 }));
  const hubOf = Object.fromEntries(hubs.map((h) => [h.id, h]));

  function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const rx = Math.min(W * 0.36, 380), ry = Math.min(H * 0.34, 260); for (const h of hubs) { h.x = W / 2 + Math.cos(h.a) * rx; h.y = H / 2 + Math.sin(h.a) * ry; }
    let s = 7; const r01 = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); dust = Array.from({ length: 140 }, () => ({ x: r01() * W, y: r01() * H, a: 0.15 + r01() * 0.5, p: r01() * 6.283 })); }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function step() {
    for (const n of nodes) { const h = hubOf[n.cat]; if (!h) continue;                                   // each thought settles on the outer side of its hub
      const k = n.slot - 1, ring = Math.floor(k / 5), ang = h.a + ((k % 5) - 2) * 0.62 * (ring % 2 ? 0.8 : 1), rest = 58 + ring * 34;
      n.vx += (h.x + Math.cos(ang) * rest - n.x) * 0.03; n.vy += (h.y + Math.sin(ang) * rest - n.y) * 0.03; }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01;
      if (d2 > 9000) continue; const f = 26 / d2, d = Math.sqrt(d2); a.vx += (dx / d) * f * 6; a.vy += (dy / d) * f * 6; b.vx -= (dx / d) * f * 6; b.vy -= (dy / d) * f * 6; }
    for (const n of nodes) { n.vx *= 0.86; n.vy *= 0.86; n.x = Math.max(16, Math.min(W - 16, n.x + n.vx)); n.y = Math.max(16, Math.min(H - 16, n.y + n.vy)); n.born = Math.min(1, n.born + 0.03); }
  }
  const line = (x1, y1, x2, y2, style, w = 1) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const spot = (x, y, r, rgb, a = 1) => { ctx.globalAlpha = a; ctx.drawImage(glow(rgb), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; };

  function draw() {
    raf = requestAnimationFrame(draw); t += 0.016; step();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    for (const d of dust) { ctx.fillStyle = `rgba(230,235,255,${(d.a * (0.6 + 0.4 * Math.sin(t * 1.5 + d.p))).toFixed(3)})`; ctx.fillRect(d.x, d.y, 1.2, 1.2); }
    const cx = W / 2, cy = H / 2, byId = new Map(nodes.map((n) => [n.id, n])), vis = (n) => !hidden.has(n.cat);
    ctx.globalCompositeOperation = 'lighter';
    for (const h of hubs) { const off = hidden.has(h.id); line(cx, cy, h.x, h.y, `rgba(${col[h.id]},${off ? 0.05 : 0.22})`);
      const q = (t * 0.25 + h.a) % 1; if (!off) spot(cx + (h.x - cx) * q, cy + (h.y - cy) * q, 5, col[h.id], Math.sin(q * Math.PI) * 0.9); }
    for (const n of nodes) if (vis(n)) { const h = hubOf[n.cat]; line(h.x, h.y, n.x, n.y, `rgba(${col[n.cat]},${0.3 * n.born})`); }
    for (const e of edges) { const a = byId.get(e.a), b = byId.get(e.b); if (!a || !b || !vis(a) || !vis(b)) continue; const hot = picked && (picked.id === a.id || picked.id === b.id); line(a.x, a.y, b.x, b.y, `rgba(255,255,255,${hot ? 0.6 : 0.16})`, hot ? 1.4 : 1); }
    spot(cx, cy, 46 + 3 * Math.sin(t * 2), '255,140,40'); spot(cx, cy, 16, '255,240,210');
    for (const h of hubs) spot(h.x, h.y, hidden.has(h.id) ? 8 : 15, col[h.id], hidden.has(h.id) ? 0.3 : 1);
    for (const n of nodes) if (vis(n)) { const r = (9 + Math.min(8, n.weight * 2)) * (n === hover || n === picked ? 1.5 : 1) * (0.4 + 0.6 * n.born); spot(n.x, n.y, r, col[n.cat], 0.5 + 0.5 * n.born); }
    ctx.globalCompositeOperation = 'source-over'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 12px -apple-system, "SF Pro Text", sans-serif';
    for (const h of hubs) { ctx.fillStyle = `rgba(255,255,255,${hidden.has(h.id) ? 0.25 : 0.82})`; const up = h.y < cy - 10; ctx.fillText(h.name, h.x, h.y + (up ? -22 : 24)); }
    ctx.font = '700 11px -apple-system, "SF Pro Text", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('V I T', cx, cy + 38);
    const tip = hover && hover !== picked ? hover : null;
    if (tip) { ctx.font = '500 13px -apple-system, "SF Pro Text", sans-serif'; const text = tip.text.length > 56 ? tip.text.slice(0, 54) + '…' : tip.text, w = ctx.measureText(text).width + 22, x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, tip.x)), y = tip.y - 28 < 20 ? tip.y + 30 : tip.y - 28;
      ctx.fillStyle = 'rgba(30,30,36,0.92)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 14, w, 28, 14); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + 0.5); }
  }
  const at = (e) => { const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 18 * 18; for (const n of nodes) { if (hidden.has(n.cat)) continue; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = n; } } return best; };
  canvas.addEventListener('pointermove', (e) => { hover = at(e); canvas.style.cursor = hover ? 'pointer' : 'default'; });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  canvas.addEventListener('click', (e) => { picked = at(e); onSelect?.(picked); });
  raf = requestAnimationFrame(draw);

  return {
    /** Keeps positions of nodes that are already on screen; new ones fly out of the core. */
    set(list, links) { const old = new Map(nodes.map((n) => [n.id, n])), count = {};
      nodes = list.map((n) => { const o = old.get(n.id), slot = (count[n.cat] = (count[n.cat] || 0) + 1); return o ? Object.assign(o, n, { slot }) : { ...n, slot, x: W / 2 + (Math.random() - 0.5) * 30, y: H / 2 + (Math.random() - 0.5) * 30, vx: 0, vy: 0, born: 0 }; });
      edges = links; if (picked && !nodes.includes(picked)) picked = null; },
    filter(set) { hidden = set; },
    clear() { picked = null; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
