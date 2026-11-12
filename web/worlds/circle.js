// Кружки: round video messages. The recorder crops the camera to a square, draws it into a 384×384 canvas and
// records that canvas with the microphone — about 250 kbit/s of video and 32 of sound, so a minute is ≈ 2 MB and an
// ordinary 15–20 second circle well under a megabyte. The player shows a received circle as a silent loop and plays
// it with sound from the start on a tap, a thin ring running round it.
const SIZE = 384, MAX_SECONDS = 60, MAX_BYTES = 3_800_000, V_BPS = 250_000, A_BPS = 32_000;
const TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
const R = 48, C = 2 * Math.PI * R;                                // the progress ring, in a 100×100 box
const ring = (cls) => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" class="cr-track"/><circle cx="50" cy="50" r="${R}" class="cr-run" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>`;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The recording type this engine can make, best first (Electron 45 / Chromium: WebM VP9 + Opus). */
export function circleType() { return TYPES.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || ''; }

// a stand-in camera for machines without one (tests): a moving gradient and a soft tone — only behind ?fakecam=1
function fakeCamera() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d'); let t = 0;
  const draw = () => { t += 1; const grd = g.createLinearGradient(0, 0, 640, 480); grd.addColorStop(0, `hsl(${(t * 2) % 360} 70% 45%)`); grd.addColorStop(1, `hsl(${(t * 2 + 120) % 360} 70% 30%)`);
    g.fillStyle = grd; g.fillRect(0, 0, 640, 480); g.fillStyle = '#fff'; g.beginPath(); g.arc(320 + Math.sin(t / 20) * 120, 240, 60, 0, 7); g.fill();
    g.font = '600 40px -apple-system'; g.fillText('VITON13 · тест', 190, 420); };
  const id = setInterval(draw, 33); draw();
  const stream = cv.captureStream(30);
  try { const ac = new AudioContext(), osc = ac.createOscillator(), gain = ac.createGain(), dst = ac.createMediaStreamDestination(); gain.gain.value = 0.04; osc.frequency.value = 330; osc.connect(gain).connect(dst); osc.start(); stream.addTrack(dst.stream.getAudioTracks()[0]); stream._ac = ac; } catch { /* silent is fine */ }
  stream._stop = () => { clearInterval(id); stream._ac?.close?.(); };
  return stream;
}

/**
 * recordCircle({ h, host, onSend }) — opens the recorder over `host` (the conversation pane).
 * onSend({ blob, type, duration, width, height }) → Promise; while it runs the recorder waits, an error is shown in place.
 */
export function recordCircle({ h, host, onSend }) {
  host.querySelector('.cr')?.remove();
  const type = circleType();
  const canvas = h('canvas', { class: 'cr-view', width: SIZE, height: SIZE, 'aria-hidden': 'true' });
  const replay = h('video', { class: 'cr-view hide', playsinline: '', muted: '', loop: '', 'aria-label': 'Записанный кружок' });
  const stage = h('div', { class: 'cr-stage' }, canvas, replay, h('span', { class: 'cr-ring', html: ring('cr-svg') }));
  const time = h('div', { class: 'cr-time' }, '0:00'), note = h('div', { class: 'cr-note', role: 'status' });
  const acts = h('div', { class: 'cr-acts' });
  const el = h('div', { class: 'cr', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Запись кружка' }, h('div', { class: 'cr-in' }, stage, time, note, acts));
  host.append(el); requestAnimationFrame(() => el.classList.add('in'));
  const runEl = el.querySelector('.cr-run');
  let stream = null, cam = null, rec = null, chunks = [], raf = 0, t0 = 0, seconds = 0, blob = null, url = '', closed = false, tick = 0;

  const key = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', key);
  function close() {
    if (closed) return; closed = true; window.removeEventListener('keydown', key);
    cancelAnimationFrame(raf); clearInterval(tick); try { rec?.state === 'recording' && rec.stop(); } catch { /* already */ }
    stream?.getTracks().forEach((t) => t.stop()); stream?._stop?.(); if (url) URL.revokeObjectURL(url);
    el.classList.remove('in'); setTimeout(() => el.remove(), 260);
  }
  const btn = (cls, label, onclick, inner) => h('button', { class: 'cr-btn ' + cls, type: 'button', title: label, 'aria-label': label, onclick, html: inner });
  const X = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>', STOP = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" stroke="none"/></svg>';
  const UP = '<svg viewBox="0 0 24 24"><path d="M12 18.5V6M6.5 11.5L12 6l5.5 5.5"/></svg>', AGAIN = '<svg viewBox="0 0 24 24"><path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5.5 5v3.3h3.3"/></svg>';

  async function start() {
    if (!type) { note.textContent = 'Это окно не умеет записывать видео'; acts.replaceChildren(btn('ghost', 'Закрыть', close, X)); return; }
    note.textContent = 'Включаю камеру…'; acts.replaceChildren(btn('ghost', 'Отмена', close, X));
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) {
      if (/[?&]fakecam=1/.test(location.search) || window.__vitFakeCam) stream = fakeCamera();
      else { note.textContent = e?.name === 'NotAllowedError' ? 'Нет доступа к камере — разрешите его в настройках macOS' : 'Камера не найдена'; return; }
    }
    if (closed) { stream.getTracks().forEach((t) => t.stop()); stream._stop?.(); return; }
    cam = h('video', { playsinline: '', muted: '' }); cam.muted = true; cam.srcObject = stream; await cam.play().catch(() => {});
    const g = canvas.getContext('2d');
    const draw = () => {                                            // a centred square, mirrored like a front camera
      const vw = cam.videoWidth, vh = cam.videoHeight;
      if (vw && vh) { const s = Math.min(vw, vh); g.save(); g.translate(SIZE, 0); g.scale(-1, 1); g.drawImage(cam, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, SIZE, SIZE); g.restore(); }
      raf = requestAnimationFrame(draw);
    };
    draw();
    const out = canvas.captureStream(30); stream.getAudioTracks().forEach((t) => out.addTrack(t));
    rec = new MediaRecorder(out, { mimeType: type, videoBitsPerSecond: V_BPS, audioBitsPerSecond: A_BPS }); chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = finish;
    rec.start(250); t0 = performance.now(); el.classList.add('live');
    note.textContent = '';
    acts.replaceChildren(btn('ghost', 'Отмена', close, X), btn('stop', 'Остановить', () => rec.state === 'recording' && rec.stop(), STOP));
    tick = setInterval(() => {
      seconds = (performance.now() - t0) / 1000; time.textContent = clock(seconds);
      runEl.style.strokeDashoffset = String(C * (1 - Math.min(1, seconds / MAX_SECONDS)));
      if (seconds >= MAX_SECONDS && rec.state === 'recording') rec.stop();
    }, 100);
  }

  function finish() {
    clearInterval(tick); cancelAnimationFrame(raf); el.classList.remove('live');
    stream?.getTracks().forEach((t) => t.stop()); stream?._stop?.();
    if (closed) return;
    seconds = Math.max(0.5, (performance.now() - t0) / 1000);
    blob = new Blob(chunks, { type: type.split(';')[0] });
    if (seconds < 1) { note.textContent = 'Слишком коротко — запишите ещё раз'; return again(); }
    if (blob.size > MAX_BYTES) { note.textContent = 'Кружок вышел тяжелее 4 МБ — запишите короче'; return again(); }
    url = URL.createObjectURL(blob); replay.src = url; replay.muted = true; canvas.classList.add('hide'); replay.classList.remove('hide'); replay.play().catch(() => {});
    time.textContent = `${clock(seconds)} · ${(blob.size / 1e6).toFixed(blob.size < 1e6 ? 2 : 1)} МБ`;
    runEl.style.strokeDashoffset = '0';
    acts.replaceChildren(btn('ghost', 'Удалить', close, X), btn('ghost', 'Переснять', again, AGAIN), btn('send', 'Отправить', send, UP));
  }
  function again() {
    if (url) { URL.revokeObjectURL(url); url = ''; } replay.pause(); replay.removeAttribute('src'); replay.classList.add('hide'); canvas.classList.remove('hide');
    runEl.style.strokeDashoffset = String(C); time.textContent = '0:00'; blob = null; start();
  }
  async function send() {
    if (!blob) return; const b = acts.querySelector('.send'); b.disabled = true; el.classList.add('busy'); note.textContent = 'Отправляю…';
    try { await onSend({ blob, type: blob.type, duration: Math.round(seconds * 10) / 10, width: SIZE, height: SIZE }); close(); }
    catch (e) { el.classList.remove('busy'); b.disabled = false; note.textContent = e?.message || 'Не получилось отправить'; }
  }
  start();
  return { close };
}

// ── the player ──────────────────────────────────────────────────────────────
let speaking = null;                                               // only one circle talks at a time
const watcher = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) { const p = e.target._cp; if (!p || p.loud) continue; if (e.isIntersecting && !reduced()) p.video.play().catch(() => {}); else p.video.pause(); }
}, { threshold: 0.5 }) : null;

/** circlePlayer({ h, src, duration }) → a round video element: silent loop on screen, a tap plays it with sound. */
export function circlePlayer({ h, src, duration = 0 }) {
  const video = h('video', { class: 'cp-video', src, playsinline: '', muted: '', loop: '', preload: 'metadata', 'aria-hidden': 'true' });
  video.muted = true;
  const badge = h('span', { class: 'cp-badge' }, clock(duration || 0));
  const el = h('button', { class: 'cp', type: 'button', 'aria-label': `Кружок, ${clock(duration || 0)}. Нажмите, чтобы послушать` }, video, h('span', { class: 'cp-ring', html: ring('cr-svg') }), badge,
    h('span', { class: 'cp-sound', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M5 9.5h3l4-3.5v12l-4-3.5H5zM16 9a4.2 4.2 0 0 1 0 6"/></svg>' }));
  const run = el.querySelector('.cr-run'), p = { video, loud: false };
  el._cp = p;
  const total = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : duration || 1);
  function quiet() {
    p.loud = false; el.classList.remove('loud'); video.muted = true; video.loop = true; run.style.strokeDashoffset = String(C); badge.textContent = clock(duration || 0);
    if (speaking === p) speaking = null;
  }
  p.quiet = quiet;
  video.addEventListener('timeupdate', () => { if (!p.loud) return; const f = Math.min(1, video.currentTime / total()); run.style.strokeDashoffset = String(C * (1 - f)); badge.textContent = clock(Math.max(0, total() - video.currentTime)); });
  video.addEventListener('ended', () => { if (p.loud) { quiet(); video.currentTime = 0; video.play().catch(() => {}); } });
  el.addEventListener('click', () => {
    if (p.loud) { if (video.paused) video.play().catch(() => {}); else video.pause(); el.classList.toggle('paused', video.paused); return; }
    if (speaking && speaking !== p) speaking.quiet();
    speaking = p; p.loud = true; el.classList.add('loud'); el.classList.remove('paused');
    video.loop = false; video.muted = false; video.currentTime = 0; video.play().catch(() => {});
  });
  // the silent loop starts only while the circle is on screen
  if (watcher) requestAnimationFrame(() => { if (el.isConnected) watcher.observe(el); });
  else if (!reduced()) video.play().catch(() => {});
  return el;
}
