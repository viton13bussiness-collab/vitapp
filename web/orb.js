// VIT's cosmos. A hundred thousand points of dust on the GPU, turning as a four-armed pinwheel in the colours of memory.
// You can take it in your hand: drag to turn it (it keeps your speed, then settles back), move the pointer through it and
// the dust parts and swirls, tap and a wave runs out. It can also gather into the VITON13 globe mark, or drift apart.
// No WebGL, or a small canvas → the plain 2D dust from orb2d.js, behind the same handle.
import { createOrb2D, MEM_COLORS } from '/orb2d.js';
export { MEM_COLORS };

const FOV = 15, TAN = Math.tan((FOV * Math.PI) / 360);
const SHAPES = { pinwheel: 0, globe: 1, scatter: 2 };
const ARMS = 4, WIND = 2.05, armTh = (arm, rad) => arm * (6.283185 / ARMS) + Math.log(rad * 7 + 1) * WIND;
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const CAT = MEM_COLORS.map(hexRGB);
const rnd = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));       // soft boundary: follows less the further you pull
const ZLO = Math.log(0.8), ZHI = Math.log(1.75);

let three = null, glOK = null;
const loadThree = () => (three ||= import('/vendor/three/three.module.min.js'));
function webglAvailable() {
  if (glOK !== null) return glOK;
  try { const g = document.createElement('canvas').getContext('webgl2'); glOK = !!g; g?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { glOK = false; }
  return glOK;
}

/**
 * createOrb(canvas, { size, points, interactive, wheel, fit, shape }) → handle
 *   state('idle' | 'listen' | 'think' | 'speak') · amp(0..1) · burst(colourIndex) · shape('pinwheel' | 'globe' | 'scatter', ms)
 *   pause() · resume() · stop() · kind ('webgl' | '2d') · ready (Promise of kind)
 * interactive: drag / hover / tap; on by default while the canvas is at least 260 CSS px. wheel: plain wheel zooms (pinch always does).
 * fit: radius of the pinwheel as a share of the canvas's smaller side. The canvas is sized by CSS.
 */
export function createOrb(canvas, opts = {}) {
  const { size = 560 } = opts;
  if (size < 200 || opts.webgl === false || !webglAvailable()) { const o = createOrb2D(canvas, opts); o.ready = Promise.resolve('2d'); return o; }
  canvas.width = canvas.height = size;                                   // intrinsic size until CSS and the GPU take over
  const want = { state: 'idle', amp: null, shape: null, paused: false, stopped: false, bursts: [] }; let impl = null;
  const handle = {
    kind: 'webgl',
    state(s) { want.state = s; impl?.state(s); }, amp(a) { want.amp = a; impl?.amp(a); },
    burst(ci) { impl ? impl.burst(ci) : want.bursts.push(ci); },
    shape(name, ms) { want.shape = [name, ms]; impl?.shape(name, ms); },
    pause() { want.paused = true; impl?.pause(); }, resume() { want.paused = false; impl?.resume(); },
    stop() { want.stopped = true; impl?.stop(); impl = null; },
  };
  const fallback = () => { handle.kind = '2d'; impl = createOrb2D(canvas, opts); };
  handle.ready = loadThree().then((THREE) => { if (want.stopped) return handle.kind;
    try { impl = glOrb(THREE, canvas, opts); } catch (e) { console.warn('[orb] WebGL did not start, drawing in 2D:', e.message); try { fallback(); } catch { return 'none'; } }
    impl.state(want.state); if (want.amp != null) impl.amp(want.amp); if (want.shape) impl.shape(want.shape[0], 0); want.bursts.forEach((b) => impl.burst(b)); if (want.paused) impl.pause();
    return handle.kind;
  }).catch(() => { if (!want.stopped) try { fallback(); } catch { /* nothing to draw on */ } return handle.kind; });
  return handle;
}

// ── geometry: every point knows where it sits in the pinwheel, in the globe mark and in open space ──
function build(N) {
  const r = rnd(1313), gauss = () => (r() + r() + r() + r() - 2) * 0.5;
  const pin = new Float32Array(N * 3), meta = new Float32Array(N * 4), look = new Float32Array(N * 2), globe = new Float32Array(N * 4), scat = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const PHI = Math.PI / 3, V = [[-0.3, 0.35], [0, -0.35], [0.3, 0.35]];
  for (let i = 0; i < N; i++) {
    // pinwheel: a blade per arm, a dense core, loose dust between the arms
    const u = r(); let rad, th, h, cl, kind = 0;
    if (u < 0.74) { rad = 0.05 + Math.pow(r(), 0.72) * 0.95; const arm = Math.floor(r() * ARMS), taper = Math.pow(1 - rad * 0.86, 1.35);
      th = armTh(arm, rad) + (r() + r() + r() - 1.5) * 0.52 * taper; h = (r() + r() - 1) * 0.045 * taper; cl = (arm * 2 + (rad > 0.5 ? 1 : 0)) % 8; }
    else if (u < 0.9) { kind = 1; rad = Math.pow(r(), 2) * 0.2; th = r() * 6.283; h = (r() + r() - 1) * 0.08 * (1 - rad * 4); cl = -1; }
    else { kind = 2; rad = 0.15 + r() * 0.95; th = r() * 6.283; h = (r() + r() - 1) * 0.1; cl = Math.floor(r() * 8); }
    pin.set([rad, th, h], i * 3);
    const bright = r() < 0.006 ? 1 : 0, white = r() < 0.42;
    meta.set([kind, r() * 6.283, bright ? 1.1 + r() * 0.9 : 0.55 + r() * 0.95, r()], i * 4);          // kind, phase, size, morph delay
    look.set([bright, kind === 2 ? 0.25 + r() * 0.35 : 0.5 + r() * 0.5], i * 2);                    // bright star?, alpha
    col.set(kind === 1 ? [1, 0.65 + 0.27 * (1 - rad / 0.2), 0.41] : white || cl < 0 ? [0.925, 0.933, 1] : CAT[cl], i * 3);
    // globe: the VITON13 mark as a wire sphere — outline, three meridians, two parallels, the V at its heart
    const g = r(), a = r() * 6.283; let x, y, z, ga = 1, j = 0.011;
    if (g < 0.2) { x = Math.cos(a); y = Math.sin(a); z = 0; j = 0.013; }
    else if (g < 0.29) { x = 0; y = Math.sin(a); z = Math.cos(a); }
    else if (g < 0.55) { const s = g < 0.42 ? 1 : -1; x = Math.sin(a) * Math.cos(PHI); y = Math.cos(a); z = Math.sin(a) * Math.sin(PHI) * s; }
    else if (g < 0.75) { const yy = g < 0.65 ? 0.36 : -0.36, rho = Math.sqrt(1 - yy * yy); x = rho * Math.cos(a); y = yy; z = rho * Math.sin(a); }
    else if (g < 0.93) { const left = r() < 0.5, A = left ? V[0] : V[2], B = V[1], tt = r(), w = (r() - 0.5) * 0.085, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
      x = A[0] + dx * tt - (dy / L) * w; y = A[1] + dy * tt + (dx / L) * w; z = (r() - 0.5) * 0.02; j = 0.004; ga = 1.15; }
    else { const d = [gauss(), gauss(), gauss()], L = Math.hypot(...d) || 1, rr = Math.cbrt(r()) * 0.97; x = (d[0] / L) * rr; y = (d[1] / L) * rr; z = (d[2] / L) * rr; ga = 0.22; j = 0; }
    globe.set([x + gauss() * j, y + gauss() * j, z + gauss() * j, ga], i * 4);
    scat.set([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], i * 3);
  }
  return { pin, meta, look, globe, scat, col };
}

const VERT = /* glsl */ `
attribute vec4 aMeta; attribute vec2 aLook; attribute vec4 aGlobe; attribute vec3 aScat; attribute vec3 aCol;
uniform float uTime, uRot, uAmp, uProg, uUnit, uDist, uLight, uSwirl;
uniform int uFrom, uTo;
uniform vec2 uSpread, uTan;
uniform vec3 uMouse;
uniform vec3 uWave[3];
uniform vec4 uBurst[3];
uniform vec3 uBurstCol[3];
varying vec3 vCol; varying float vA; varying float vHot;
const float PI = 3.14159265;

void shapeOf(int s, out vec3 p, out float a, out float sz, out float white) {
  if (s == 1) { p = aGlobe.xyz * 0.86 * (1.0 + sin(uTime * 1.3 + aMeta.y) * 0.005 + uAmp * 0.03); a = aGlobe.w; sz = 1.0; white = 0.74; }
  else if (s == 2) { p = vec3(aScat.xy * uSpread, aScat.z * 1.4 - 0.4);
    p.x += sin(uTime * 0.11 + aMeta.y) * 0.14; p.y += cos(uTime * 0.09 + aMeta.y * 1.7) * 0.11; p.z += sin(uTime * 0.07 + aMeta.y * 2.3) * 0.2;
    vec2 e = smoothstep(vec2(1.0), vec2(0.72), abs(aScat.xy)); a = 0.85 * aLook.y * e.x * e.y; sz = 1.7; white = 0.3; }
  else { float loose = step(1.5, aMeta.x), rad = position.x * (1.0 + uAmp * 0.06);
    float th = position.y + uRot * mix(1.0, 0.7, loose) + (fract(aMeta.y * 7.13) - 0.5) * 0.05 * uTime + sin(uTime * 0.23 + position.x * 5.0) * 0.045;   // the arms flex, they never wind up
    p = vec3(rad * cos(th), position.z, rad * sin(th)); a = aLook.y * (1.0 - clamp((position.x - 0.82) / 0.3, 0.0, 1.0)); sz = 1.0; white = 0.0; }
}

void main() {
  vec3 p0, p1; float a0, a1, s0, s1, w0, w1;
  shapeOf(uFrom, p0, a0, s0, w0); shapeOf(uTo, p1, a1, s1, w1);
  float D = 0.55, k = clamp(uProg * (1.0 + D) - aMeta.w * D, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);            // each point leaves at its own moment
  vec3 p = mix(p0, p1, k), dir = p1 - p0; float len = length(dir);
  if (len > 0.001) p += normalize(cross(dir, vec3(0.3, 0.2, 1.0))) * sin(PI * k) * min(0.34, len * 0.22);          // and travels on an arc, not a ruler line
  float a = mix(a0, a1, k), sz = mix(s0, s1, k), white = mix(w0, w1, k), boost = 0.0;
  vec3 col = aCol;
  for (int i = 0; i < 3; i++) { float age = uTime - uBurst[i].w;                                                  // a supernova: a shell of colour through the dust
    if (age > 0.0 && age < 2.2) { vec3 d = p - uBurst[i].xyz; float L = length(d), band = exp(-pow((L - age * 0.46) / 0.075, 2.0)) * exp(-age * 1.9);
      p += (d / (L + 1e-4)) * band * 0.07; col = mix(col, uBurstCol[i], clamp(band * 1.5, 0.0, 1.0)); boost += band; } }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec2 d = mv.xy - uMouse.xy * uTan * (-mv.z); float f = uMouse.z * exp(-dot(d, d) / 0.07);                        // the pointer: dust parts and swirls around it
  mv.xy += normalize(d + 1e-5) * f * 0.1 + vec2(-d.y, d.x) * f * uSwirl;
  for (int i = 0; i < 3; i++) { float age = uTime - uWave[i].z;                                                   // a tap: a ring runs out from the finger
    if (age > 0.0 && age < 2.6) { vec2 wd = mv.xy - uWave[i].xy * uTan * (-mv.z); float wl = length(wd), band = exp(-pow((wl - age * 1.15) / 0.1, 2.0)) * exp(-age * 1.5);
      mv.xy += (wd / (wl + 1e-4)) * band * 0.11; boost += band * 0.8; } }
  gl_Position = projectionMatrix * mv;
  float front = clamp(0.5 + (mv.z + uDist) * 0.5, 0.0, 1.0);
  float tw = mix(0.7 + 0.3 * sin(uTime * 2.2 + aMeta.y), 0.6 + 0.4 * sin(uTime * 4.0 + aMeta.y), aLook.x);
  vA = a * tw * (0.3 + 0.7 * front) * (1.0 + boost * 1.7);
  vHot = aLook.x * (1.0 - uLight);
  gl_PointSize = uUnit * aMeta.z * sz * (0.8 + 0.5 * front) * (1.0 + aLook.x * 2.6) * (1.0 + boost * 0.9) * (uDist / -mv.z);
  vec3 neutral = mix(vec3(1.0, 0.96, 0.9), vec3(0.1, 0.1, 0.15), uLight);
  float isWhite = step(0.85, min(aCol.r, min(aCol.g, aCol.b)));
  vCol = mix(mix(col, col * 0.72, uLight), neutral, max(white, isWhite * uLight));
}`;
const FRAG = /* glsl */ `
uniform float uAlphaK, uGain;
varying vec3 vCol; varying float vA; varying float vHot;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
  float a = 1.0 - r; a = a * a * (3.0 - 2.0 * a);
  vec3 col = mix(vCol, vec3(1.0), smoothstep(0.42, 0.0, r) * vHot * 0.85);
  float al = clamp(a * vA * uGain * (1.0 + vHot * 0.6), 0.0, 1.0);
  gl_FragColor = vec4(col * al, al * uAlphaK);                       // premultiplied; a low alpha makes it add light over whatever lies behind
}`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CORE_FRAG = /* glsl */ `
uniform float uOp, uCore, uAlphaK, uLight; varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0, c = r / max(uCore, 0.001);
  float a = exp(-c * c * 2.6) + exp(-c * c * 0.55) * 0.34 * (1.0 - uLight * 0.8) + (1.0 - smoothstep(0.0, 1.0, r)) * 0.085 * (1.0 - uLight);
  vec3 col = mix(vec3(1.0, 0.42, 0.07), mix(vec3(1.0, 0.97, 0.9), vec3(1.0, 0.6, 0.16), uLight), exp(-c * c * 5.0));
  col = mix(col, vec3(0.5, 0.36, 1.0), smoothstep(0.35, 1.0, r) * 0.55 * (1.0 - uLight));
  a = clamp(a * uOp * mix(1.0, 0.8, uLight), 0.0, 1.0); gl_FragColor = vec4(col * a, a * mix(uAlphaK, 1.0, 0.25));
}`;
const FLASH_FRAG = /* glsl */ `
uniform float uAge, uAlphaK; uniform vec3 uCol; varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0, q = clamp(uAge / 1.8, 0.0, 1.0), e = 1.0 - pow(1.0 - q, 3.0);
  float a = exp(-q * 6.5) * (exp(-r * r * 22.0) * 1.3 + exp(-r * r * 4.0) * 0.5) + exp(-pow((r - e * 0.8) / 0.16, 2.0)) * (1.0 - q) * (1.0 - q) * 0.1;
  vec3 col = mix(uCol, vec3(1.0), exp(-r * r * 30.0) * exp(-q * 5.0));
  a = clamp(a, 0.0, 1.0) * step(uAge, 1.8) * step(0.0, uAge); gl_FragColor = vec4(col * a, a * uAlphaK);
}`;

function glOrb(THREE, canvas, { points = 14000, interactive, wheel = false, fit = 0.47, shape: shape0 = 'pinwheel' } = {}) {
  const N = Math.round(clamp(points * 8, 80000, 150000)), root = document.documentElement, reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100), group = new THREE.Group(); scene.add(group);
  const blend = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

  const data = build(N), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.pin, 3)); geo.setAttribute('aMeta', new THREE.BufferAttribute(data.meta, 4)); geo.setAttribute('aLook', new THREE.BufferAttribute(data.look, 2));
  geo.setAttribute('aGlobe', new THREE.BufferAttribute(data.globe, 4)); geo.setAttribute('aScat', new THREE.BufferAttribute(data.scat, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(data.col, 3));
  const s0 = SHAPES[shape0] ?? 0;
  const U = { uTime: { value: 0 }, uRot: { value: 0 }, uAmp: { value: 0 }, uProg: { value: 1 }, uUnit: { value: 2 }, uDist: { value: 5 }, uLight: { value: 0 }, uSwirl: { value: 0.75 },
    uFrom: { value: s0 }, uTo: { value: s0 }, uSpread: { value: new THREE.Vector2(2, 2) }, uTan: { value: new THREE.Vector2(TAN, TAN) }, uMouse: { value: new THREE.Vector3(0, 0, 0) },
    uWave: { value: [0, 1, 2].map(() => new THREE.Vector3(0, 0, -99)) }, uBurst: { value: [0, 1, 2].map(() => new THREE.Vector4(0, 0, 0, -99)) }, uBurstCol: { value: [0, 1, 2].map(() => new THREE.Vector3(1, 1, 1)) },
    uAlphaK: { value: 0.22 }, uGain: { value: 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, ...blend }), dust = new THREE.Points(geo, mat); dust.frustumCulled = false; group.add(dust);
  const quad = new THREE.PlaneGeometry(1, 1);
  const coreMat = new THREE.ShaderMaterial({ uniforms: { uOp: { value: 1 }, uCore: { value: 0.2 }, uAlphaK: U.uAlphaK, uLight: U.uLight }, vertexShader: QUAD_VERT, fragmentShader: CORE_FRAG, ...blend }), core = new THREE.Mesh(quad, coreMat);
  core.scale.setScalar(1.7); core.frustumCulled = false; scene.add(core);
  const flashes = [0, 1, 2].map(() => { const m = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: { uAge: { value: -1 }, uAlphaK: U.uAlphaK, uCol: { value: new THREE.Vector3(1, 1, 1) } }, vertexShader: QUAD_VERT, fragmentShader: FLASH_FRAG, ...blend }));
    m.scale.setScalar(0.95); m.frustumCulled = false; m.visible = false; m.userData = { at: new THREE.Vector3(), t0: -99 }; scene.add(m); return m; });

  // ── orientation: where the shape rests, and where the hand has turned it ──
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), rest = new THREE.Quaternion(), rA = new THREE.Quaternion(), rB = new THREE.Quaternion(), t1 = new THREE.Quaternion(), t2 = new THREE.Quaternion();
  const restOf = (s, t, out) => (s === 0 ? out.setFromAxisAngle(AX, Math.PI).multiply(t1.setFromAxisAngle(AY, 0.3 + 0.16 * Math.sin(t * 0.13))).multiply(t2.setFromAxisAngle(AX, 0.92 + 0.07 * Math.sin(t * 0.21)))
    : s === 1 ? out.setFromAxisAngle(AY, 0.24 * Math.sin(t * 0.45)).multiply(t1.setFromAxisAngle(AX, 0.05 + 0.03 * Math.sin(t * 0.33))) : out.identity());
  let st = 'idle', amp = 0, ampT = 0, speed = 1, t = 0, rot = 0, last = 0, raf = 0, paused = false, dead = false;
  let prog = 1, morphMs = 1400, from = s0, to = s0;
  let W = 0, H = 0, inter = false, dragging = false, moved = 0, downAt = 0, wx = 0, wy = 0, ret = 3, hoverT = 0, hover = 0, zr = 0, wheelAt = 0, waveI = 0, burstI = 0, suppressClick = false;
  const hist = [], grab = { x: 0, y: 0 }, mouse = { x: 0, y: 0 };
  restOf(from, 0, q);

  function layout() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight; if (!cw || !ch) return;                  // hidden: keep the last size
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), bw = Math.round(cw * dpr), bh = Math.round(ch * dpr);                  // glow points: 1.5x is indistinguishable from 2x and a third cheaper
    if (bw !== canvas.width || bh !== canvas.height) renderer.setSize(bw, bh, false);
    W = cw; H = ch; camera.aspect = cw / ch; camera.updateProjectionMatrix();
    const now = interactive !== false && Math.min(cw, ch) >= 260;
    if (now !== inter) { inter = now; canvas.style.pointerEvents = now ? 'auto' : ''; canvas.style.touchAction = now ? 'none' : ''; canvas.style.cursor = now ? 'grab' : ''; if (!now) { dragging = false; hoverT = 0; } }
  }
  const ro = new ResizeObserver(layout); ro.observe(canvas); layout();

  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; };
  const turnK = () => (Math.PI / Math.max(120, Math.min(W, H))) * 1.05;
  const turn = (dx, dy) => { const k = turnK(); q.premultiply(t1.setFromAxisAngle(AY, dx * k)).premultiply(t2.setFromAxisAngle(AX, dy * k)).normalize(); };
  const on = (type, fn, o) => { canvas.addEventListener(type, fn, o); return () => canvas.removeEventListener(type, fn, o); };
  const off = [
    on('pointerdown', (e) => { if (!inter || (e.pointerType === 'mouse' && e.button !== 0)) return; try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      dragging = true; moved = 0; downAt = performance.now(); wx = wy = 0; ret = 0; grab.x = e.clientX; grab.y = e.clientY; hist.length = 0; hist.push([downAt, e.clientX, e.clientY]);
      [mouse.x, mouse.y] = ndc(e); hoverT = 1.5; canvas.style.cursor = 'grabbing'; }),                 // it answers the press itself, not the release
    on('pointermove', (e) => { if (!inter) return; [mouse.x, mouse.y] = ndc(e); if (!dragging) { hoverT = 1; return; }
      const dx = e.clientX - grab.x, dy = e.clientY - grab.y; grab.x = e.clientX; grab.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy); turn(dx, dy);
      const now = performance.now(); hist.push([now, e.clientX, e.clientY]); while (hist.length > 2 && now - hist[0][0] > 90) hist.shift(); }),
    on('pointerup', (e) => { if (!dragging) return; dragging = false; canvas.style.cursor = 'grab'; hoverT = e.pointerType === 'mouse' ? 1 : 0;
      const now = performance.now(), a = hist[0], b = hist[hist.length - 1], dt = (b[0] - a[0]) / 1000;
      if (moved < 7 && now - downAt < 500) { const w = U.uWave.value[waveI++ % 3]; [w.x, w.y] = ndc(e); w.z = t; }                    // a tap: a wave from that point
      else { suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
        if (!reduce.matches && dt > 0.012 && now - b[0] < 60) { const k = turnK(); wy = clamp(((b[1] - a[1]) / dt) * k, -14, 14); wx = clamp(((b[2] - a[2]) / dt) * k, -14, 14); } } }),   // the throw keeps the hand's speed
    on('pointercancel', () => { dragging = false; hoverT = 0; canvas.style.cursor = inter ? 'grab' : ''; }),
    on('pointerleave', () => { if (!dragging) hoverT = 0; }),
    on('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true),                                        // a drag is not a click on whatever lies under the canvas
    on('wheel', (e) => { if (!inter || !(wheel || e.ctrlKey || e.metaKey)) return; e.preventDefault(); zr = clamp(zr - e.deltaY * (e.ctrlKey ? 0.012 : 0.0016), ZLO - 0.9, ZHI + 0.9); wheelAt = performance.now(); }, { passive: false }),
    on('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; }),
    on('webglcontextrestored', () => visible()),
  ];

  function frame(ms) {
    raf = requestAnimationFrame(frame);
    if (!document.hasFocus() && ms - last < 32) return;                                              // window in the background: half the frame rate, half the battery
    const dt = Math.min(0.05, (ms - last) / 1000 || 0.016); last = ms;
    if (!W) { layout(); if (!W) return; }
    const calm = reduce.matches, light = root.dataset.theme === 'aurora';
    speed += ((st === 'think' ? 3.4 : st === 'listen' ? 1.7 : st === 'speak' ? 1.5 : 1) - speed) * dt * 3; amp += (ampT - amp) * dt * 10;
    if (st === 'speak') ampT = 0.35 + 0.3 * Math.sin(ms / 90) * Math.sin(ms / 230); else if (st === 'think') ampT = 0.25 + 0.15 * Math.sin(ms / 300); else if (st !== 'listen') ampT = 0;
    t += dt; rot -= dt * 0.2 * speed * (calm ? 0.4 : 1);
    if (prog < 1) prog = morphMs > 0 ? Math.min(1, prog + (dt * 1000) / morphMs) : 1;
    const e = prog * prog * (3 - 2 * prog);
    // orientation: the hand, then its momentum, then a soft return to rest — any of them can be interrupted by a new grab
    restOf(from, t, rA); restOf(to, t, rB); rest.slerpQuaternions(rA, rB, e);
    if (!dragging) { const w = Math.hypot(wx, wy);
      if (w > 0.02) { q.premultiply(t1.setFromAxisAngle(AY, wy * dt)).premultiply(t2.setFromAxisAngle(AX, wx * dt)).normalize(); const d = Math.exp(-dt * 2.4); wx *= d; wy *= d; }
      ret = Math.min(2.6, ret + dt * (w > 0.6 ? 0 : 2.2));                       // the pull home grows gently, so there is no jolt where the throw ends
      q.slerp(rest, 1 - Math.exp(-dt * ret)); }
    group.quaternion.copy(q);
    // zoom: follows the wheel, resists past the limits, comes back when the wheel rests
    if (performance.now() - wheelAt > 140) zr += (clamp(zr, ZLO, ZHI) - zr) * (1 - Math.exp(-dt * 10));
    const zv = Math.exp(zr < ZLO ? ZLO + rubber(zr - ZLO, 0.5) : zr > ZHI ? ZHI + rubber(zr - ZHI, 0.5) : zr);
    const minPx = Math.min(canvas.width, canvas.height), aspect = W / H || 1, halfMin = 1 / (2 * fit), halfH = (aspect >= 1 ? halfMin : halfMin / aspect) / zv, dist = halfH / TAN;
    camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
    hover += (hoverT - hover) * (1 - Math.exp(-dt * 7));
    U.uTime.value = t; U.uRot.value = rot; U.uAmp.value = amp; U.uProg.value = prog; U.uFrom.value = from; U.uTo.value = to; U.uDist.value = dist;
    U.uUnit.value = fit * minPx * zv * (light ? 0.004 : 0.0034); U.uTan.value.set(TAN * aspect, TAN); U.uSpread.value.set(halfH * aspect * zv * 1.15, halfH * zv * 1.15);
    U.uMouse.value.set(mouse.x, mouse.y, hover * (calm ? 0.4 : 1)); U.uSwirl.value = calm ? 0 : 0.75;
    U.uLight.value = light ? 1 : 0; U.uAlphaK.value = light ? 1 : 0.22; U.uGain.value = (light ? 2.6 : 1.3) * Math.sqrt(110000 / N);
    const pinW = (from === 0 ? 1 - e : 0) + (to === 0 ? e : 0);
    core.quaternion.copy(camera.quaternion); coreMat.uniforms.uOp.value = pinW * (0.85 + amp * 0.5); coreMat.uniforms.uCore.value = ((0.085 + 0.012 * Math.sin(t * 2.3) + 0.06 * amp) * 2.6) / 0.85;
    for (const f of flashes) { const age = t - f.userData.t0; f.visible = age >= 0 && age < 1.8; if (f.visible) { f.material.uniforms.uAge.value = age; f.position.copy(f.userData.at).applyQuaternion(q); f.quaternion.copy(camera.quaternion); } }
    renderer.render(scene, camera);
  }
  const visible = () => { cancelAnimationFrame(raf); raf = 0; if (!document.hidden && !paused && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', visible); visible();

  return {
    state(s) { st = s; if (s !== 'listen') ampT = 0; },
    amp(a) { ampT = clamp(a); },
    burst(ci = Math.floor(Math.random() * 8)) { const c = CAT[((ci % 8) + 8) % 8], i = burstI++ % 3, f = flashes[i]; let x, y, z;
      if (to === 1) { const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1); x = Math.sin(b) * Math.cos(a) * 0.86; y = Math.cos(b) * 0.86; z = Math.sin(b) * Math.sin(a) * 0.86; }
      else { const rad = 0.25 + Math.random() * 0.55, th = armTh(Math.floor(Math.random() * ARMS), rad) + rot; x = rad * Math.cos(th); y = 0; z = rad * Math.sin(th); }
      U.uBurst.value[i].set(x, y, z, t); U.uBurstCol.value[i].set(c[0], c[1], c[2]); f.userData.at.set(x, y, z); f.userData.t0 = t; f.material.uniforms.uCol.value.set(c[0], c[1], c[2]); },
    shape(name, ms = 1400) { const s = SHAPES[name]; if (s === undefined || (s === to && prog >= 1)) return;
      if (ms <= 0) { from = to = s; prog = 1; restOf(s, t, q); return; }
      from = prog >= 0.5 ? to : from; to = s; prog = 0; morphMs = ms; },
    pause() { paused = true; cancelAnimationFrame(raf); raf = 0; }, resume() { paused = false; layout(); visible(); },
    stop() { if (dead) return; dead = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', visible); ro.disconnect(); off.forEach((f) => f());
      canvas.style.pointerEvents = canvas.style.touchAction = canvas.style.cursor = '';
      geo.dispose(); quad.dispose(); mat.dispose(); coreMat.dispose(); flashes.forEach((f) => f.material.dispose()); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
