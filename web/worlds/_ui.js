// What the four worlds share: one header, springs that can be grabbed mid-flight, drags that hand their velocity on,
// momentum projection, skeletons. Motion here follows one rule — it starts from where things are and carries the hand's speed.
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Wait until a stylesheet has been applied (sizes that live in CSS read as zero before that). */
export function styled(href) {
  const link = document.querySelector(`link[href="${href}"]`);
  return !link || link.sheet ? Promise.resolve() : new Promise((r) => { link.addEventListener('load', r, { once: true }); link.addEventListener('error', r, { once: true }); });
}

/** The header every world wears: name on the left, a small count beside it, controls on the right. */
export function head(h, { title, cls = '', count, controls = [] }) {
  const cap = h('span', { class: 'cap w-count' }, count || '');
  const el = h('header', { class: 'w-head ' + cls }, h('div', { class: 'w-title' }, h('h1', null, title), cap), h('div', { class: 'w-tools' }, controls));
  return { el, count: (t) => { cap.textContent = t; } };
}

/** Where a flick comes to rest (exponential decay, the way scrolling decelerates). v in units per second. */
export const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);
/** Soft boundary: the further past the edge, the less it follows. */
export const rubber = (over, dim, k = 0.55) => (over * dim * k) / (dim + k * Math.abs(over));

/**
 * A spring on one number. It always moves from its live value with its live velocity, so a new target (or a grab)
 * never jumps. damping 1 = no overshoot; response ≈ seconds to get there.
 */
export function spring(value, { damping = 1, response = 0.4, onUpdate, onRest } = {}) {
  let x = value, v = 0, target = value, raf = 0, last = 0, held = false;
  const step = (now) => {
    raf = 0; if (held) return; let dt = Math.min(0.034, (now - last) / 1000 || 0.016); last = now;
    const w = (2 * Math.PI) / response, k = w * w, c = 2 * damping * w;
    for (let n = Math.ceil(dt / 0.004), h = dt / n; n > 0; n--) { v += (-k * (x - target) - c * v) * h; x += v * h; }      // small sub-steps keep stiff springs stable
    if (Math.abs(x - target) < 0.0005 && Math.abs(v) < 0.005) { x = target; v = 0; onUpdate?.(x, v); onRest?.(x); return; }
    onUpdate?.(x, v); raf = requestAnimationFrame(step);
  };
  const run = () => { if (!raf && !held) { last = performance.now(); raf = requestAnimationFrame(step); } };
  return {
    get value() { return x; }, get velocity() { return v; }, get target() { return target; }, get moving() { return !!raf; },
    to(t, velocity) { target = t; if (velocity !== undefined) v = velocity; held = false; if (reduced()) { x = t; v = 0; onUpdate?.(x, 0); onRest?.(x); return; } run(); },
    /** Take the value in hand: the spring stops, the caller moves it, `to()` releases with a velocity. */
    hold(nx) { held = true; cancelAnimationFrame(raf); raf = 0; if (nx !== undefined) { x = nx; onUpdate?.(x, 0); } },
    jump(nx) { x = target = nx; v = 0; onUpdate?.(x, 0); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}

/**
 * 1:1 dragging with pointer capture. onMove gets the total offset since the press; onEnd gets the release velocity (px/s)
 * measured over the last ~80 ms, so the animation that follows can continue at the hand's speed.
 */
export function drag(el, { onStart, onMove, onEnd, threshold = 6, axis }) {
  let st = null;
  const down = (e) => { if (e.button > 0) return; st = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, hist: [[performance.now(), e.clientX, e.clientY]], target: e.target }; };
  const move = (e) => { if (!st || e.pointerId !== st.id) return; const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.on) { if (Math.hypot(dx, dy) < threshold) return; if (axis === 'x' && Math.abs(dy) > Math.abs(dx) * 1.2) { st = null; return; } if (axis === 'y' && Math.abs(dx) > Math.abs(dy) * 1.2) { st = null; return; }
      st.on = true; try { el.setPointerCapture(st.id); } catch { /* pointer already gone */ } if (onStart?.(e, st) === false) { st = null; return; } }
    st.hist.push([performance.now(), e.clientX, e.clientY]); if (st.hist.length > 8) st.hist.shift(); onMove?.(dx, dy, e); e.preventDefault(); };
  const up = (e) => { if (!st || e.pointerId !== st.id) return; const s = st; st = null; if (!s.on) return;
    const now = performance.now(), recent = s.hist.filter((p) => now - p[0] < 90), a = recent[0], b = recent[recent.length - 1], dt = a && b ? (b[0] - a[0]) / 1000 : 0;
    const vx = dt > 0.008 ? (b[1] - a[1]) / dt : 0, vy = dt > 0.008 ? (b[2] - a[2]) / dt : 0;
    const eat = (c) => { c.stopPropagation(); c.preventDefault(); }; el.addEventListener('click', eat, true); setTimeout(() => el.removeEventListener('click', eat, true), 0);       // a drag is not a click
    onEnd?.(vx, vy, e); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
}

/** Grow an element out of a rectangle (the thing that was pressed) and back into it — the same path both ways. */
export function growFrom(el, fromRect, { duration = 520, radius = 14 } = {}) {
  if (reduced() || !fromRect || !el.animate) return { back: () => Promise.resolve() };
  const to = el.getBoundingClientRect(); if (!to.width || !to.height) return { back: () => Promise.resolve() };
  const inset = (r) => `inset(${Math.max(0, r.top - to.top)}px ${Math.max(0, to.right - r.right)}px ${Math.max(0, to.bottom - r.bottom)}px ${Math.max(0, r.left - to.left)}px round ${radius}px)`;
  const frames = [{ clipPath: inset(fromRect), opacity: 0.6 }, { clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 }];
  const a = el.animate(frames, { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' });
  a.finished.then(() => a.cancel()).catch(() => {});
  return { back(rect = fromRect) { const now = el.getBoundingClientRect(); if (!rect || !now.width) return Promise.resolve();
    const b = el.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)', opacity: 1 }, { clipPath: inset(rect), opacity: 0 }], { duration: duration * 0.78, easing: 'cubic-bezier(0.64, 0, 0.78, 0)', fill: 'forwards' }); return b.finished.catch(() => {}); } };
}

/** Grey placeholders that breathe while real content is on its way. */
export const skeleton = (h, n, cls) => Array.from({ length: n }, (_, i) => h('span', { class: 'w-skel ' + cls, style: `--i:${i}`, 'aria-hidden': 'true' }));
