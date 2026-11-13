// Встречи — video meetings for up to six people and films watched together.
// Video and sound go straight between the participants (WebRTC mesh); viton13.com only introduces the devices
// (a room and a small inbox for connection offers, server/worlds/meet.mjs → site /api/rtc/*). Once two devices are
// connected they talk over their own data channel: renegotiation, chat, reactions and the shared film clock.
import { emojiPicker } from '/worlds/emoji.js';

const SVG = (d) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  mic: SVG('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>'),
  micOff: SVG('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M4 4l16 16"/>'),
  cam: SVG('<rect x="3.5" y="6.5" width="12.5" height="11" rx="3"/><path d="M16 10.5l4.5-2.6v8.2L16 13.5"/>'),
  camOff: SVG('<rect x="3.5" y="6.5" width="12.5" height="11" rx="3"/><path d="M16 10.5l4.5-2.6v8.2L16 13.5M3 4l17 16"/>'),
  screen: SVG('<rect x="3.5" y="4.5" width="17" height="12" rx="2.5"/><path d="M9 20h6M12 16.5V20M12 13V8M9.5 10.5L12 8l2.5 2.5"/>'),
  film: SVG('<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10 9.5v5l4.3-2.5z" fill="currentColor"/>'),
  chat: SVG('<path d="M4.5 6.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-6.2L6.5 19.5V16a2.5 2.5 0 0 1-2-2.5z"/>'),
  react: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M8.6 13.8a4.2 4.2 0 0 0 6.8 0"/><circle cx="9.4" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10" r=".9" fill="currentColor" stroke="none"/>'),
  leave: SVG('<path d="M4 14.5c4.5-4.6 11.5-4.6 16 0l-2.2 2.4-3.1-1.6.2-2.6a9 9 0 0 0-5.8 0l.2 2.6-3.1 1.6z" fill="currentColor"/>'),
  copy: SVG('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  sync: SVG('<path d="M19.5 12a7.5 7.5 0 0 1-13.4 4.6M4.5 12a7.5 7.5 0 0 1 13.4-4.6M18 3.8v3.8h-3.8M6 20.2v-3.8h3.8"/>'),
  close: SVG('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  meet: SVG('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3"/>'),
};
const REACTIONS = ['👍', '❤️', '😂', '👏', '🔥', '🎉', '😮', '🙏'];
const YT = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const hue = (s) => { let x = 0; for (const c of String(s || '')) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export default function view(ctx, arg) {
  const { h, api, toast, css } = ctx;
  css('/worlds/meet.css');
  const plan = ctx.plan || 'guest';
  const fake = new URLSearchParams(location.search).get('fake') === '1' || store.get('vit.meet.fake') === '1';   // dev: drawn camera and a tone instead of real devices
  const win = h('div', { class: 'mt-win' }), root = h('div', { class: 'view mt' }, win);
  const ic = (name) => h('span', { class: 'mt-i', html: I[name] });
  let alive = true, room = null, lobbyStream = null;

  function quiet(title, text, ...actions) {
    win.className = 'mt-win mt-solo';
    win.replaceChildren(h('div', { class: 'mt-quiet' }, h('span', { class: 'mt-quiet-ic', html: I.meet }), h('h2', null, title), h('p', null, text), actions.length ? h('div', { class: 'mt-acts' }, actions) : null));
  }

  if (plan === 'guest') {
    quiet('Встречи — с VITON ID', 'Видеовстречи до шести человек и кино вместе. Видео идёт напрямую между вами, не через сервер. Войдите через VITON ID, чтобы начать.',
      h('button', { class: 'btn', onclick: () => ctx.upgrade?.('meet') }, 'Что входит'));
    return { root, destroy() { alive = false; } };
  }

  let ST = null;
  boot();
  async function boot() {
    win.className = 'mt-win mt-solo'; win.replaceChildren(h('div', { class: 'mt-loading' }, h('i'), h('i'), h('i')));
    try { ST = await api('/api/meet/status'); }
    catch (e) { return quiet('Встречи недоступны', e.message || 'Попробуйте ещё раз.', h('button', { class: 'btn', onclick: boot }, 'Повторить')); }
    if (!alive) return;
    if (ST.mode === 'none') return quiet('Встречи — в окне VITON13', 'Встречи проходят через ваш VITON ID на viton13.com — это работает в приложении VITON13, а не в обычном браузере.');
    if (ST.mismatch) return quiet('Другой аккаунт на viton13.com', `На сайте выполнен вход как ${ST.siteEmail}, а в приложении — ${ST.email}. Войдите на сайте тем же VITON ID в Сообщениях.`, h('button', { class: 'btn', onclick: () => ctx.go('messages') }, 'Открыть Сообщения'));
    if (!ST.connected) return quiet('Подключите viton13.com', 'Встречи идут через ваш VITON ID на viton13.com — тот же вход, что в Сообщениях. Подключите его один раз.', h('button', { class: 'btn', onclick: () => ctx.go('messages') }, 'Подключить в Сообщениях'), h('button', { class: 'btn ghost', onclick: boot }, 'Я подключил'));
    home(arg?.code);
  }

  // ── start or join ────────────────────────────────────────────────────────
  function home(code) {
    win.className = 'mt-win mt-solo';
    const title = h('input', { class: 'mt-input', placeholder: 'Название — необязательно', maxlength: 80, 'aria-label': 'Название встречи' });
    const codeIn = h('input', { class: 'mt-input mt-code-in', placeholder: 'Код встречи', maxlength: 7, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Код встречи', value: code || '' });
    codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    const startBtn = h('button', { class: 'btn', onclick: async () => {
      startBtn.disabled = true;
      try { const d = await api('/api/meet/rooms', { body: { title: title.value } }); lobby(d.room.code, d.room); }
      catch (e) { noRooms(e) || toast(e.message); startBtn.disabled = false; } } }, 'Начать встречу');
    const joinBtn = h('button', { class: 'btn ghost', onclick: () => openLobby(codeIn.value) }, 'Войти');
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') openLobby(codeIn.value); });
    win.replaceChildren(h('div', { class: 'mt-home' },
      h('div', { class: 'mt-hero' }, h('span', { class: 'mt-quiet-ic', html: I.meet }), h('h1', null, 'Встречи'), h('p', null, 'Видео до шести человек и кино вместе. Картинка и звук идут напрямую между вами — не через сервер.')),
      h('div', { class: 'mt-cards' },
        h('div', { class: 'mt-card' }, h('b', null, 'Новая встреча'), h('small', null, 'Код и приглашение появятся сразу'), title, startBtn),
        h('div', { class: 'mt-card' }, h('b', null, 'По коду'), h('small', null, 'Шесть знаков из приглашения'), codeIn, joinBtn))));
    if (code) openLobby(code);
  }
  function noRooms(e) {
    if (e.code !== 'no_rooms') return false;
    quiet('Встреч на viton13.com ещё нет', 'Приложение готово, а сайту нужно обновление: комнаты, через которые устройства находят друг друга. После выкладки обновления встречи заработают сами.', h('button', { class: 'btn ghost', onclick: boot }, 'Проверить снова'));
    return true;
  }
  async function openLobby(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return toast('Код — шесть знаков');
    try { const d = await api('/api/meet/rooms/' + code); lobby(code, d.room); }
    catch (e) { noRooms(e) || toast(e.message); }
  }

  // ── lobby: camera preview, devices, the invite ───────────────────────────
  async function lobby(code, info) {
    win.className = 'mt-win mt-solo';
    const pref = { mic: store.get('vit.meet.mic') !== '0', cam: store.get('vit.meet.cam') !== '0', micId: store.get('vit.meet.micId') || '', camId: store.get('vit.meet.camId') || '' };
    const video = h('video', { class: 'mt-preview', autoplay: true, muted: true, playsinline: true });
    const camSel = h('select', { class: 'mt-select', 'aria-label': 'Камера' }), micSel = h('select', { class: 'mt-select', 'aria-label': 'Микрофон' });
    const micBtn = h('button', { class: 'mt-ctl', onclick: () => { pref.mic = !pref.mic; paintToggles(); applyPref(); } });
    const camBtn = h('button', { class: 'mt-ctl', onclick: () => { pref.cam = !pref.cam; paintToggles(); applyPref(); } });
    const note = h('small', { class: 'mt-note' });
    function paintToggles() { micBtn.replaceChildren(ic(pref.mic ? 'mic' : 'micOff')); micBtn.classList.toggle('off', !pref.mic); camBtn.replaceChildren(ic(pref.cam ? 'cam' : 'camOff')); camBtn.classList.toggle('off', !pref.cam); store.set('vit.meet.mic', pref.mic ? '1' : '0'); store.set('vit.meet.cam', pref.cam ? '1' : '0'); }
    function applyPref() { for (const t of lobbyStream?.getAudioTracks() || []) t.enabled = pref.mic; for (const t of lobbyStream?.getVideoTracks() || []) t.enabled = pref.cam; video.classList.toggle('dark', !pref.cam); }
    async function open() {
      lobbyStream?.getTracks().forEach((t) => t.stop());
      lobbyStream = await localMedia(pref.camId, pref.micId, ST.me?.name || 'Вы');
      if (!alive) return lobbyStream.getTracks().forEach((t) => t.stop());
      video.srcObject = lobbyStream; applyPref();
      note.textContent = lobbyStream.getVideoTracks().length ? '' : 'Камера недоступна — вас услышат, но не увидят.';
      if (!fake) await listDevices();
    }
    async function listDevices() {
      const ds = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const fill = (sel, kind, cur) => sel.replaceChildren(...ds.filter((d) => d.kind === kind).map((d, i) => h('option', { value: d.deviceId, selected: d.deviceId === cur }, d.label || `${kind === 'videoinput' ? 'Камера' : 'Микрофон'} ${i + 1}`)));
      fill(camSel, 'videoinput', pref.camId); fill(micSel, 'audioinput', pref.micId);
    }
    camSel.onchange = () => { pref.camId = camSel.value; store.set('vit.meet.camId', pref.camId); open(); };
    micSel.onchange = () => { pref.micId = micSel.value; store.set('vit.meet.micId', pref.micId); open(); };
    const invite = `Встреча VITON13${info?.title ? ` «${info.title}»` : ''}: код ${code}. Откройте «Встречи» в приложении VITON13 и введите код.`;
    const copy = (text, what) => navigator.clipboard?.writeText(text).then(() => toast(what + ' скопирован')).catch(() => toast(text));
    const inside = (info?.members || []).filter((m) => m.id !== ST.me?.id);
    const goBtn = h('button', { class: 'btn lg mt-go', onclick: async () => { goBtn.disabled = true; try { await enter(code, info, pref); } catch (e) { goBtn.disabled = false; noRooms(e) || toast(e.message); } } }, 'Войти во встречу');
    win.replaceChildren(h('div', { class: 'mt-lobby' },
      h('div', { class: 'mt-pv' }, video, h('div', { class: 'mt-pv-bar' }, micBtn, camBtn), h('span', { class: 'mt-pv-name' }, ST.me?.name || 'Вы')),
      h('div', { class: 'mt-side' },
        h('button', { class: 'mt-back', onclick: () => { lobbyStream?.getTracks().forEach((t) => t.stop()); lobbyStream = null; home(); } }, '‹ Встречи'),
        h('h2', null, info?.title || 'Встреча'),
        h('div', { class: 'mt-code' }, h('span', null, code.slice(0, 3)), h('span', null, code.slice(3)), h('button', { class: 'mt-ctl sm', title: 'Скопировать код', 'aria-label': 'Скопировать код', onclick: () => copy(code, 'Код') }, ic('copy'))),
        h('button', { class: 'mt-link', onclick: () => copy(invite, 'Приглашение') }, 'Скопировать приглашение'),
        inside.length ? h('div', { class: 'mt-inside' }, h('div', { class: 'mt-avas' }, inside.slice(0, 5).map((m) => ava(m))), h('small', null, inside.length === 1 ? `${inside[0].name || 'Человек'} уже здесь` : `Уже здесь: ${inside.length}`)) : h('small', { class: 'mt-note' }, 'Пока никого — вы первый.'),
        fake ? null : h('label', { class: 'mt-dev' }, h('span', null, 'Камера'), camSel), fake ? null : h('label', { class: 'mt-dev' }, h('span', null, 'Микрофон'), micSel),
        note, goBtn)));
    paintToggles();
    try { await open(); } catch { note.textContent = 'Нет доступа к камере и микрофону. Разрешите их в настройках системы.'; }
  }
  function ava(m, cls = '') {
    const box = h('span', { class: 'mt-ava ' + cls, style: `--h:${hue(m?.id || m?.name)}` }, h('b', null, initials(m?.name)));
    if (/^https:\/\//.test(m?.avatarUrl || '')) { const img = h('img', { src: m.avatarUrl, alt: '', referrerpolicy: 'no-referrer' }); img.onerror = () => img.remove(); box.append(img); }
    return box;
  }

  // ── devices ──────────────────────────────────────────────────────────────
  let fakeStop = null;
  async function localMedia(camId, micId, label) {
    if (fake) return fakeMedia(label);
    const v = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, ...(camId ? { deviceId: { exact: camId } } : {}) };
    const a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(micId ? { deviceId: { exact: micId } } : {}) };
    try { return await navigator.mediaDevices.getUserMedia({ video: v, audio: a }); } catch { /* try one at a time */ }
    const out = new MediaStream();
    try { (await navigator.mediaDevices.getUserMedia({ audio: a })).getTracks().forEach((t) => out.addTrack(t)); } catch { /* no mic */ }
    try { (await navigator.mediaDevices.getUserMedia({ video: v })).getTracks().forEach((t) => out.addTrack(t)); } catch { /* no camera */ }
    return out;
  }
  function fakeMedia(label) {
    fakeStop?.();
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d'), hu = hue(label), t0 = performance.now();
    const draw = () => { const t = (performance.now() - t0) / 1000, gr = g.createLinearGradient(0, 0, 640, 360);
      gr.addColorStop(0, `hsl(${hu},55%,28%)`); gr.addColorStop(1, `hsl(${(hu + 60) % 360},60%,14%)`); g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(320 + Math.sin(t * 1.3) * 160, 180 + Math.cos(t * 0.9) * 70, 26, 0, 7); g.fill();
      g.font = '600 30px -apple-system, sans-serif'; g.textAlign = 'center'; g.fillText(label, 320, 330); g.font = '500 16px ui-monospace, monospace'; g.fillText(t.toFixed(1) + ' c', 320, 40); };
    draw(); const iv = setInterval(draw, 1000 / 24);
    const track = c.captureStream(24).getVideoTracks()[0];
    const ac = new AudioContext(), o = ac.createOscillator(), gn = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(), dest = ac.createMediaStreamDestination();
    o.frequency.value = 180 + (hu % 160); gn.gain.value = 0.015; lfo.frequency.value = 0.7; lg.gain.value = 0.015; lfo.connect(lg).connect(gn.gain); o.connect(gn).connect(dest); o.start(); lfo.start();
    fakeStop = () => { clearInterval(iv); try { o.stop(); lfo.stop(); ac.close(); } catch { /* closed */ } fakeStop = null; };
    return new MediaStream([track, dest.stream.getAudioTracks()[0]]);
  }

  // ── the room ─────────────────────────────────────────────────────────────
  async function enter(code, info, pref) {
    const joined = await api(`/api/meet/rooms/${code}/presence`, { body: { action: 'join' } });
    const me = { id: joined.me.id, name: joined.me.name || ST.me?.name || 'Вы' };
    const myJoin = joined.members.find((m) => m.id === me.id)?.joinedAt || new Date().toISOString();
    const local = lobbyStream || await localMedia(pref.camId, pref.micId, me.name); lobbyStream = null;
    room = createRoom({ code, title: info?.title || '', me, local, pref, ice: ST.ice });
    for (const m of joined.members) if (m.id !== me.id && (String(m.joinedAt) < String(myJoin) || (m.joinedAt === myJoin && m.id < me.id))) room.call(m);       // the newcomer calls everyone already inside
    room.members(joined.members);
  }

  function createRoom({ code, title, me, local, pref, ice }) {
    const peers = new Map(), timers = new Set();
    let cursor = '', left = false, lastMembers = 0, busyUntil = Date.now() + 20000, pollT = 0, polling = false, rejoining = null, screen = null, unread = 0, chatOpen = false;
    const listed = new Set(), waiting = new Map();                                    // members now inside · those listed without a connection yet (since when)
    const state = { mic: pref.mic, cam: pref.cam };
    let stageMode = 'none', stageOwner = null, film = null, player = null, applying = 0, beatT = null, lastWatch = null;
    for (const t of local.getAudioTracks()) t.enabled = state.mic;
    for (const t of local.getVideoTracks()) t.enabled = state.cam;

    // layout
    const stage = h('div', { class: 'mt-stage' }), grid = h('div', { class: 'mt-grid' }), floaters = h('div', { class: 'mt-float', 'aria-hidden': 'true' });
    const chatList = h('div', { class: 'mt-chat-list' }), chatIn = h('input', { class: 'mt-input', placeholder: 'Сообщение всем', maxlength: 500, 'aria-label': 'Сообщение всем' });
    const emo = emojiPicker({ h, onPick: (e) => { chatIn.setRangeText(e, chatIn.selectionStart ?? chatIn.value.length, chatIn.selectionEnd ?? chatIn.value.length, 'end'); chatIn.focus(); } });
    const chat = h('aside', { class: 'mt-chat hide' }, h('div', { class: 'mt-chat-top' }, h('b', null, 'Чат встречи'), h('button', { class: 'mt-ctl sm', 'aria-label': 'Закрыть чат', onclick: () => toggleChat(false) }, ic('close'))), chatList,
      h('form', { class: 'mt-chat-form', onsubmit: (e) => { e.preventDefault(); sendChat(); } }, emo.el, chatIn, h('button', { class: 'mt-ctl sm', type: 'button', 'aria-label': 'Эмодзи', onclick: () => emo.toggle() }, ic('react'))));
    const head = h('div', { class: 'mt-head' }, h('b', null, title || 'Встреча'), h('span', { class: 'mt-head-code', title: 'Скопировать код', onclick: () => navigator.clipboard?.writeText(code).then(() => toast('Код скопирован')) }, code), h('span', { class: 'mt-head-n' }));
    const ctl = (name, label, fn, cls = '') => h('button', { class: 'mt-ctl ' + cls, title: label, 'aria-label': label, onclick: fn }, ic(name));
    const micB = ctl('mic', 'Микрофон', () => setMic(!state.mic)), camB = ctl('cam', 'Камера', () => setCam(!state.cam));
    const shareB = ctl('screen', 'Показать экран', () => (screen ? stopShare() : share())), filmB = ctl('film', 'Смотреть вместе', () => watchSheet());
    const reactRow = h('div', { class: 'mt-reacts hide' }, REACTIONS.map((e) => h('button', { onclick: () => { react(e); reactRow.classList.add('hide'); } }, e)));
    const reactB = ctl('react', 'Реакция', () => reactRow.classList.toggle('hide'));
    const chatB = ctl('chat', 'Чат', () => toggleChat(!chatOpen)), leaveB = ctl('leave', 'Выйти', () => leave(), 'red');
    const bar = h('div', { class: 'mt-bar' }, micB, camB, shareB, filmB, h('span', { class: 'mt-react-wrap' }, reactRow, reactB), chatB, leaveB);
    win.className = 'mt-win mt-room'; win.replaceChildren(h('div', { class: 'mt-main' }, head, stage, grid, floaters, bar), chat);

    // my tile
    const selfTile = tile({ id: me.id, name: me.name }, true); selfTile.video.srcObject = local; grid.append(selfTile.el); watchLevel(selfTile, local);
    paintCtl(); relayout();

    // ── signalling through the site ──
    const send = async (to, type, data) => {
      const body = { to, type, data: typeof data === 'string' ? data : JSON.stringify(data) }, go = () => api(`/api/meet/rooms/${code}/signal`, { body });
      try { await go(); } catch (e) { if (e.code !== 'RTC_REJOIN') return toast(e.message); await rejoin(); await go().catch((er) => toast(er.message)); }   // the site restarted: join again, then send
    };
    const gathered = (pc, ms = 2500) => new Promise((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
    // Fast (1 s) while anyone is still connecting and for the first 20 s; once everyone is connected with the data
    // channel open, a look for newcomers every 20 s (alone: every 5 s). A drop, a newcomer, a renegotiation or the window coming back wakes it.
    function settled() {
      const now = Date.now();
      if (now < busyUntil) return false;
      for (const p of peers.values()) {
        const st = p.pc.connectionState; if (st === 'failed' || st === 'closed') continue;
        if (st !== 'connected' || p.dc?.readyState !== 'open' || p.making || p.pc.signalingState !== 'stable') return false;
      }
      for (const since of waiting.values()) if (now - since < 30000) return false;
      return true;
    }
    function schedule(ms) { clearTimeout(pollT); timers.delete(pollT); pollT = setTimeout(() => { timers.delete(pollT); pollT = 0; poll(); }, ms); timers.add(pollT); }
    function wake(ms = 5000) { if (left) return; busyUntil = Math.max(busyUntil, Date.now() + ms); if (!polling) schedule(150); }
    async function poll() {
      if (left || !alive) return;
      polling = true;
      const calm = settled(), wantMembers = calm || Date.now() - lastMembers > 5000;
      try {
        const d = await api(`/api/meet/rooms/${code}/signal?since=${encodeURIComponent(cursor)}${wantMembers ? '&members=1' : ''}`);
        for (const s of d.signals || []) { cursor = s.createdAt; busyUntil = Math.max(busyUntil, Date.now() + 5000); await onSignal(s).catch((e) => console.warn('[meet] signal', e)); }
        if (d.members) { lastMembers = Date.now(); members(d.members); }
      } catch (e) {
        if (e.code === 'RTC_REJOIN' || e.status === 403) await rejoin();               // the site forgot us (a restart): join again, the call goes on
        else if (e.status === 404) { polling = false; toast('Встреча закончилась'); return leave(true); }
      }
      polling = false;
      if (!left) schedule(!settled() ? 1000 : peers.size ? 20000 : 5000);
    }
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    function rejoin() { return (rejoining ||= api(`/api/meet/rooms/${code}/presence`, { body: { action: 'join' } }).then(() => wake()).catch(() => { /* the next poll will tell */ }).finally(() => { rejoining = null; })); }
    const beat = setInterval(() => { if (!left) api(`/api/meet/rooms/${code}/presence`, { body: { action: 'heartbeat' } }).catch((e) => { if (e.status === 403 || e.code === 'RTC_REJOIN') rejoin(); }); }, 120000);
    const onVisible = () => { if (!document.hidden) wake(); };
    document.addEventListener('visibilitychange', onVisible);
    const names = new Map();
    function members(list) {
      const now = Date.now(); let fresh = false;
      for (const m of list) {
        names.set(m.id, m); const p = peers.get(m.id); if (p && m.name && p.name !== m.name) { p.name = m.name; p.tile.setName(m.name); }
        if (m.id !== me.id && !listed.has(m.id)) { listed.add(m.id); fresh = true; }
        if (m.id !== me.id && !p && !waiting.has(m.id)) waiting.set(m.id, now);
      }
      for (const id of [...listed]) if (!list.some((m) => m.id === id)) listed.delete(id);
      for (const id of [...waiting.keys()]) if (peers.has(id) || !listed.has(id)) waiting.delete(id);
      for (const [id, p] of peers) if (!list.some((m) => m.id === id) && p.pc.connectionState !== 'connected') dropPeer(id);
      if (fresh) wake(20000);
      head.querySelector('.mt-head-n').textContent = `${peers.size + 1} из 6`;
    }
    async function onSignal(s) {
      const data = (() => { try { return JSON.parse(s.data); } catch { return null; } })();
      if (s.type === 'offer' && data) {
        if (peers.has(s.from)) dropPeer(s.from, true);                              // they came back: start clean
        const p = peer({ id: s.from, name: names.get(s.from)?.name || '' });
        await p.pc.setRemoteDescription(data); await p.pc.setLocalDescription(await p.pc.createAnswer()); await gathered(p.pc);
        await send(s.from, 'answer', p.pc.localDescription);
      } else if (s.type === 'answer' && data) {
        const p = peers.get(s.from); if (p && p.pc.signalingState === 'have-local-offer') await p.pc.setRemoteDescription(data);
      } else if (s.type === 'candidate' && Array.isArray(data)) {
        const p = peers.get(s.from); for (const c of data) await p?.pc.addIceCandidate(c).catch(() => {});
      } else if (s.type === 'bye') dropPeer(s.from);
    }
    async function call(m) {
      names.set(m.id, m); const p = peer(m);
      wire(p, p.pc.createDataChannel('meet', { ordered: true }));
      await p.pc.setLocalDescription(await p.pc.createOffer()); await gathered(p.pc);
      await send(m.id, 'offer', p.pc.localDescription);
    }

    // ── one connection per person ──
    function peer(m) {
      const pc = new RTCPeerConnection({ iceServers: ice });
      const p = { id: m.id, name: m.name || '', pc, dc: null, ready: false, polite: me.id > m.id, making: false, ignore: false, streams: new Map(), screenId: null, shareSenders: [], state: { mic: true, cam: true }, offset: 0, rtts: [] };
      p.tile = tile(p); grid.append(p.tile.el); peers.set(p.id, p);
      for (const t of local.getTracks()) pc.addTrack(t, local);
      if (screen) for (const t of screen.getTracks()) p.shareSenders.push(pc.addTrack(t, screen));
      pc.ontrack = (e) => { const s = e.streams[0] || new MediaStream([e.track]); p.streams.set(s.id, s); placeStreams(p); };
      pc.ondatachannel = (e) => wire(p, e.channel);
      pc.onnegotiationneeded = async () => {
        if (!p.ready) return;                                                          // the first offer goes through the site
        wake();                                                                        // a shared screen joins the call: keep an ear on the site meanwhile
        try { p.making = true; await pc.setLocalDescription(); dcSend(p, { k: 'sdp', d: pc.localDescription }); } catch (e) { console.warn('[meet] renegotiate', e); } finally { p.making = false; }
      };
      pc.onicecandidate = (e) => { if (p.ready && e.candidate) dcSend(p, { k: 'ice', c: e.candidate }); };
      pc.onconnectionstatechange = () => {
        p.tile.el.dataset.conn = pc.connectionState; if (pc.connectionState !== 'connected') wake(); else waiting.delete(p.id);
        if (pc.connectionState === 'failed') { p.tile.setNote('Нет связи — возможно, мешает сеть'); later(() => { if (pc.connectionState === 'failed') dropPeer(p.id); }, 12000); }
        if (pc.connectionState === 'connected') p.tile.setNote('');
      };
      p.tile.setNote('Подключаемся…'); relayout(); bitrate(); head.querySelector('.mt-head-n').textContent = `${peers.size + 1} из 6`;
      return p;
    }
    function wire(p, dc) {
      p.dc = dc;
      dc.onopen = () => { p.ready = true; dcSend(p, { k: 'hello', name: me.name, mic: state.mic, cam: state.cam, screen: screen?.id || null }); for (let i = 0; i < 3; i++) setTimeout(() => dcSend(p, { k: 'ping', a: Date.now() }), 300 * i);
        if (film && film.leader === me.id) setTimeout(() => dcSend(p, filmState(false)), 1200); };
      dc.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onPeerMessage(p, m).catch((err) => console.warn('[meet] dc', err)); };
      dc.onclose = () => { p.ready = false; if (!left) later(() => { if (p.pc.connectionState !== 'connected') dropPeer(p.id); }, 4000); };
    }
    const dcSend = (p, m) => { if (p.dc?.readyState === 'open') p.dc.send(JSON.stringify(m)); };
    const broadcast = (m) => { for (const p of peers.values()) dcSend(p, m); };
    async function onPeerMessage(p, m) {
      if (m.k === 'sdp') {                                                            // perfect negotiation over our own channel
        const collision = m.d.type === 'offer' && (p.making || p.pc.signalingState !== 'stable');
        p.ignore = !p.polite && collision; if (p.ignore) return;
        await p.pc.setRemoteDescription(m.d);
        if (m.d.type === 'offer') { await p.pc.setLocalDescription(); dcSend(p, { k: 'sdp', d: p.pc.localDescription }); }
      } else if (m.k === 'ice') { try { await p.pc.addIceCandidate(m.c); } catch (e) { if (!p.ignore) console.warn('[meet] ice', e); } }
      else if (m.k === 'hello' || m.k === 'state') {
        if (m.name) { p.name = m.name; p.tile.setName(m.name); }
        if ('mic' in m) p.state.mic = !!m.mic; if ('cam' in m) p.state.cam = !!m.cam;
        if ('screen' in m) { p.screenId = m.screen; placeStreams(p); }
        p.tile.paintState(p.state);
      }
      else if (m.k === 'ping') dcSend(p, { k: 'pong', a: m.a, b: Date.now() });
      else if (m.k === 'pong') { const now = Date.now(), rtt = now - m.a; p.rtts.push([rtt, m.b - (m.a + rtt / 2)]); p.rtts.sort((x, y) => x[0] - y[0]); p.offset = p.rtts[0][1]; }
      else if (m.k === 'chat') addChat(p.name || 'Участник', m.text, false);
      else if (m.k === 'react') floatUp(m.e, p.name);
      else if (m.k === 'watch') onWatch(p, m);
      else if (m.k === 'watch-req') { if (film && film.leader === me.id) dcSend(p, filmState(false)); }
      else if (m.k === 'bye') dropPeer(p.id);
    }
    function dropPeer(id, quietly) {
      const p = peers.get(id); if (!p) return;
      peers.delete(id); try { p.pc.close(); } catch { /* closed */ } p.tile.destroy(); p.tile.el.remove(); waiting.delete(id); wake();
      if (p.screenId && stageOwner === id) clearStage();
      if (film?.leader === id) { const next = [me.id, ...peers.keys()].sort()[0]; film.leader = next; if (next === me.id) startBeat(); }
      relayout(); bitrate(); head.querySelector('.mt-head-n').textContent = `${peers.size + 1} из 6`;
      if (!quietly && !left) toast(`${p.name || 'Участник'} вышел`);
    }
    function placeStreams(p) {
      let main = null;
      for (const [sid, s] of p.streams) { if (s.getTracks().every((t) => t.readyState === 'ended')) { p.streams.delete(sid); continue; } if (sid === p.screenId) showScreen(s, p); else if (!main) main = s; }
      if (main && p.tile.video.srcObject !== main) { p.tile.video.srcObject = main; watchLevel(p.tile, main); }
      if (!p.screenId && stageOwner === p.id) clearStage();
    }
    function bitrate() {                                                               // a mesh shares the uplink: lighter video as the room fills
      const max = peers.size >= 3 ? 450_000 : peers.size === 2 ? 800_000 : 1_500_000;
      for (const p of peers.values()) for (const s of p.pc.getSenders()) {
        if (s.track?.kind !== 'video' || p.shareSenders.includes(s)) continue;
        const prm = s.getParameters(); if (!prm.encodings?.length) continue; prm.encodings[0].maxBitrate = max; s.setParameters(prm).catch(() => {});
      }
    }

    // ── tiles, levels, layout ──
    function tile(p, self = false) {
      const video = h('video', { autoplay: true, playsinline: true, ...(self ? { muted: true } : {}) });
      const name = h('span', { class: 'mt-tname' }, self ? `${p.name} · вы` : p.name || 'Участник'), note = h('span', { class: 'mt-tnote' }), micOff = h('span', { class: 'mt-tmic hide', html: I.micOff });
      const el = h('div', { class: 'mt-tile' + (self ? ' self' : ''), style: `--h:${hue(p.id)}` }, h('div', { class: 'mt-tava' }, ava(p, 'lg')), video, note, h('div', { class: 'mt-tfoot' }, micOff, name));
      const t = { el, video, setName: (n) => { name.textContent = self ? `${n} · вы` : n; el.querySelector('.mt-tava b').textContent = initials(n); }, setNote: (s) => { note.textContent = s; },
        paintState: (s) => { el.classList.toggle('nocam', !s.cam); micOff.classList.toggle('hide', !!s.mic); }, stopLevel: null, destroy() { t.stopLevel?.(); } };
      return t;
    }
    let actx = null;
    function watchLevel(t, stream) {
      t.stopLevel?.(); const tr = stream.getAudioTracks()[0]; if (!tr) return;
      try {
        actx ||= new AudioContext(); actx.resume?.();
        const src = actx.createMediaStreamSource(new MediaStream([tr])), an = actx.createAnalyser(); an.fftSize = 512; src.connect(an);
        const buf = new Uint8Array(an.fftSize); let lvl = 0;
        const iv = setInterval(() => { an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) sum += (v - 128) ** 2; const rms = Math.sqrt(sum / buf.length) / 128;
          lvl = Math.max(rms * 4, lvl * 0.82); t.el.style.setProperty('--lvl', Math.min(1, lvl).toFixed(2)); t.el.classList.toggle('talk', lvl > 0.12); }, 90);
        t.stopLevel = () => { clearInterval(iv); try { src.disconnect(); } catch { /* gone */ } };
      } catch { /* no audio graph */ }
    }
    function relayout() {
      const n = peers.size + 1; grid.dataset.n = String(Math.min(n, 6));
      win.classList.toggle('mt-staged', stageMode !== 'none');
    }

    // ── controls ──
    function paintCtl() {
      micB.replaceChildren(ic(state.mic ? 'mic' : 'micOff')); micB.classList.toggle('off', !state.mic);
      camB.replaceChildren(ic(state.cam ? 'cam' : 'camOff')); camB.classList.toggle('off', !state.cam);
      shareB.classList.toggle('on', !!screen); filmB.classList.toggle('on', !!film); selfTile.paintState(state);
      chatB.dataset.badge = unread ? String(unread) : '';
    }
    function setMic(on) { state.mic = on; for (const t of local.getAudioTracks()) t.enabled = on; broadcast({ k: 'state', mic: on }); paintCtl(); }
    function setCam(on) { state.cam = on; for (const t of local.getVideoTracks()) t.enabled = on; broadcast({ k: 'state', cam: on }); paintCtl(); }
    async function share() {
      if (!navigator.mediaDevices?.getDisplayMedia) return toast('Показ экрана здесь недоступен');
      try { screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true }); }
      catch { screen = null; return; }
      if (film) stopFilm(true);
      broadcast({ k: 'state', screen: screen.id });                                   // they learn which stream is the screen before it arrives
      for (const p of peers.values()) for (const t of screen.getTracks()) p.shareSenders.push(p.pc.addTrack(t, screen));
      screen.getVideoTracks()[0]?.addEventListener('ended', stopShare);
      showScreen(screen, { id: me.id, name: me.name }, true); paintCtl();
    }
    function stopShare() {
      if (!screen) return; screen.getTracks().forEach((t) => t.stop());
      for (const p of peers.values()) { for (const s of p.shareSenders) { try { p.pc.removeTrack(s); } catch { /* closed */ } } p.shareSenders = []; }
      broadcast({ k: 'state', screen: null }); screen = null; if (stageOwner === me.id) clearStage(); paintCtl();
    }
    function toggleChat(on) { chatOpen = on; chat.classList.toggle('hide', !on); win.classList.toggle('mt-chatting', on); if (on) { unread = 0; paintCtl(); chatIn.focus(); chatList.scrollTop = chatList.scrollHeight; } }
    function sendChat() { const text = chatIn.value.trim(); if (!text) return; chatIn.value = ''; emo.close(); broadcast({ k: 'chat', text }); addChat(me.name, text, true); }
    function addChat(who, text, mine) {
      chatList.append(h('div', { class: 'mt-msg' + (mine ? ' me' : '') }, mine ? null : h('b', null, who), h('span', null, text)));
      chatList.scrollTop = chatList.scrollHeight;
      if (!chatOpen && !mine) { unread++; paintCtl(); toast(`${who}: ${text.slice(0, 60)}`); }
    }
    function react(e) { broadcast({ k: 'react', e }); floatUp(e, me.name); }
    function floatUp(e, who) {
      const x = 8 + Math.random() * 74, el = h('span', { class: 'mt-up', style: `left:${x}%` }, h('i', null, e), h('small', null, who || ''));
      floaters.append(el); setTimeout(() => el.remove(), 3200);
    }

    // ── the stage: someone's screen, or a film watched together ──
    function showScreen(stream, who, mine = false) {
      if (film) stopFilm(true);
      stageMode = 'screen'; stageOwner = who.id;
      const v = h('video', { autoplay: true, playsinline: true, muted: mine }); v.srcObject = stream;
      stage.replaceChildren(v, h('div', { class: 'mt-stage-cap' }, mine ? 'Вы показываете экран' : `${who.name || 'Участник'} показывает экран`, mine ? h('button', { class: 'btn sm ghost', onclick: stopShare }, 'Остановить') : null));
      relayout();
    }
    function clearStage() { stageMode = 'none'; stageOwner = null; player?.destroy(); player = null; stage.replaceChildren(); relayout(); }

    function watchSheet() {
      if (film) return stopFilm();
      const input = h('input', { class: 'mt-input', placeholder: 'Ссылка на YouTube или на видеофайл .mp4 / .webm', 'aria-label': 'Ссылка на видео' });
      const close = () => sheet.remove();
      const start = () => { const src = input.value.trim(), kind = YT.test(src) ? 'yt' : /^https?:\/\//.test(src) ? 'video' : ''; if (!kind) return toast('Нужна ссылка на YouTube или на видеофайл'); close(); startFilm({ src, kind }); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); if (e.key === 'Escape') close(); });
      const sheet = h('div', { class: 'mt-sheet' }, h('div', { class: 'mt-sheet-in' }, h('b', null, 'Смотреть вместе'), h('small', null, 'Видео идёт у каждого со своего устройства, а пауза, перемотка и скорость — общие.'), input,
        h('div', { class: 'mt-acts' }, h('button', { class: 'btn', onclick: start }, 'Смотреть'), h('button', { class: 'btn ghost', onclick: () => { close(); share(); } }, 'Показать экран со звуком'), h('button', { class: 'btn ghost', onclick: close }, 'Отмена'))));
      win.append(sheet); setTimeout(() => input.focus(), 50);
    }
    async function startFilm({ src, kind }, from = null) {
      if (screen) stopShare();
      film = { src, kind, leader: from ? from.id : me.id }; lastWatch = null;
      stageMode = 'film'; stageOwner = film.leader; relayout(); paintCtl();
      const box = h('div', { class: 'mt-film' }), syncB = h('button', { class: 'btn sm ghost', onclick: () => resync() }, h('span', { html: I.sync }), 'Синхронизировать');
      stage.replaceChildren(box, h('div', { class: 'mt-stage-cap' }, h('span', null, from ? `Смотрим вместе · включил ${from.name || 'участник'}` : 'Смотрим вместе'), syncB, h('button', { class: 'btn sm ghost', onclick: () => stopFilm() }, 'Закончить')));
      player?.destroy(); player = kind === 'yt' ? await ytPlayer(box, src) : filePlayer(box, src);
      player.onLocal(() => { if (Date.now() < applying) return; film.leader = me.id; const st = filmState(false); lastWatch = { ...st, local: st.at }; broadcast(st); startBeat(); });
      if (!from) { broadcast(filmState(false)); startBeat(); } else dcSend(peers.get(from.id) || {}, { k: 'watch-req' });
    }
    function stopFilm(silent) {
      if (!film) return; const was = film; film = null; clearInterval(beatT); beatT = null;
      if (!silent) broadcast({ k: 'watch', stop: true, src: was.src });
      clearStage(); paintCtl();
    }
    const filmState = (beat) => ({ k: 'watch', src: film.src, kind: film.kind, t: player?.time() || 0, playing: !!player?.playing(), rate: player?.rate() || 1, at: Date.now(), beat });
    function startBeat() { clearInterval(beatT); beatT = setInterval(() => { if (film && player && film.leader === me.id) broadcast(filmState(true)); }, 3000); }
    async function onWatch(p, m) {
      if (m.stop) { if (film && film.src === m.src) { film = null; clearInterval(beatT); clearStage(); paintCtl(); toast(`${p.name || 'Участник'} закончил показ`); } return; }
      if (!film || film.src !== m.src) await startFilm({ src: m.src, kind: m.kind }, { id: p.id, name: p.name });
      const local = m.at - p.offset;
      if (m.beat && film.leader !== p.id) return;                                    // a beat from someone who no longer leads
      if (lastWatch && local < lastWatch.local) return;                              // older than what we already follow
      if (!m.beat) { film.leader = p.id; clearInterval(beatT); }
      lastWatch = { ...m, local }; apply(lastWatch, !m.beat);
    }
    function apply(m, hard) {
      if (!player) return;
      const target = m.t + (m.playing ? ((Date.now() - m.local) / 1000) * (m.rate || 1) : 0), drift = Math.abs(player.time() - target);
      applying = Date.now() + 700;
      if (Math.abs(player.rate() - (m.rate || 1)) > 0.01) player.setRate(m.rate || 1);
      if (drift > (hard ? 0.25 : 0.5)) player.seek(target);
      if (m.playing && !player.playing()) player.play(); else if (!m.playing && player.playing()) player.pause();
    }
    function resync() { if (film?.leader === me.id) broadcast(filmState(false)); else { if (lastWatch) apply(lastWatch, true); const p = peers.get(film?.leader); if (p) dcSend(p, { k: 'watch-req' }); } }

    function filePlayer(box, src) {
      const v = h('video', { src, controls: true, playsinline: true, preload: 'auto', crossorigin: 'anonymous' }); box.append(v);
      v.addEventListener('error', () => toast('Видео не открывается по этой ссылке'));
      const subs = []; for (const ev of ['play', 'pause', 'seeked', 'ratechange']) v.addEventListener(ev, () => subs.forEach((f) => f()));
      return { time: () => v.currentTime || 0, playing: () => !v.paused && !v.ended, rate: () => v.playbackRate || 1, play: () => v.play().catch(() => toast('Нажмите ▶, чтобы включить звук')), pause: () => v.pause(),
        seek: (t) => { v.currentTime = Math.max(0, t); }, setRate: (r) => { v.playbackRate = r; }, onLocal: (f) => subs.push(f), destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); }, el: v };
    }
    async function ytPlayer(box, src) {
      const id = YT.exec(src)[1], holder = h('div'); box.append(holder);
      await loadYT();
      return new Promise((resolve) => {
        const subs = []; let last = 0, lastAt = Date.now(), ready = false;
        const yt = new window.YT.Player(holder, { videoId: id, width: '100%', height: '100%', playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: { onReady: () => { ready = true; resolve(api); }, onStateChange: (e) => { if (e.data === 1 || e.data === 2) subs.forEach((f) => f()); }, onPlaybackRateChange: () => subs.forEach((f) => f()) } });
        const seekWatch = setInterval(() => {                                      // YouTube has no «seeked»: a jump in time is a seek
          if (!ready) return; const t = yt.getCurrentTime?.() || 0, now = Date.now(), expect = last + (yt.getPlayerState?.() === 1 ? ((now - lastAt) / 1000) * (yt.getPlaybackRate?.() || 1) : 0);
          if (Math.abs(t - expect) > 1.5) subs.forEach((f) => f()); last = t; lastAt = now; }, 500);
        const api = { time: () => yt.getCurrentTime?.() || 0, playing: () => yt.getPlayerState?.() === 1, rate: () => yt.getPlaybackRate?.() || 1, play: () => yt.playVideo?.(), pause: () => yt.pauseVideo?.(),
          seek: (t) => { yt.seekTo?.(Math.max(0, t), true); last = t; lastAt = Date.now(); }, setRate: (r) => yt.setPlaybackRate?.(r), onLocal: (f) => subs.push(f), destroy: () => { clearInterval(seekWatch); try { yt.destroy(); } catch { /* gone */ } } };
        setTimeout(() => { if (!ready) { toast('YouTube не загрузился'); resolve(api); } }, 12000);
      });
    }

    // ── leaving ──
    async function leave(ended) {
      if (left) return; left = true;
      broadcast({ k: 'bye' }); clearInterval(beat); clearInterval(beatT); timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVisible);
      for (const id of [...peers.keys()]) dropPeer(id, true);
      local.getTracks().forEach((t) => t.stop()); screen?.getTracks().forEach((t) => t.stop()); fakeStop?.(); selfTile.destroy(); player?.destroy(); actx?.close().catch(() => {});
      if (!ended) fetch(`/api/meet/rooms/${code}/presence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'leave' }), keepalive: true }).catch(() => {});
      room = null; if (alive) home();
    }
    const onUnload = () => leave(); window.addEventListener('pagehide', onUnload);
    poll();
    return { call: (m) => call(m).catch((e) => toast(e.message)), members, leave: () => { window.removeEventListener('pagehide', onUnload); return leave(); }, peers, debug: () => ({ me, pace: { settled: settled(), busyFor: Math.max(0, busyUntil - Date.now()), waiting: [...waiting.keys()] }, peers: [...peers.values()].map((p) => ({ id: p.id, conn: p.pc.connectionState, dc: p.dc?.readyState, offset: p.offset })), film: film && { ...film, t: player?.time(), playing: player?.playing() } }) };
  }

  function loadYT() {
    if (window.YT?.Player) return Promise.resolve();
    return (window.__vitYT ||= new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { window.__vitYT = null; reject(new Error('YouTube не загрузился')); }; document.head.append(s);
    }));
  }

  window.__vitMeet = { get room() { return room; } };                               // for checks from the console
  return { root, destroy() { alive = false; room?.leave(); lobbyStream?.getTracks().forEach((t) => t.stop()); fakeStop?.(); } };
}
