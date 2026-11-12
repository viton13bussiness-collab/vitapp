// Messages: the people and direct messages of VITON ID, in a visionOS-style window — the list of conversations on the
// left, the conversation on the right, a composer with a microphone and a green «Отправить».
// The conversations are the same as on viton13.com (server/worlds/messages.mjs is the bridge); nothing here is invented.
import { styled, reduced } from '/worlds/_ui.js';
import { emojiPicker, onlyEmoji } from '/worlds/emoji.js';
import { recordCircle, circlePlayer } from '/worlds/circle.js';
const CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/></svg>';
const SMILE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.6 13.8a4.2 4.2 0 0 0 6.8 0"/><circle cx="9.4" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.6" cy="10" r=".9" fill="currentColor" stroke="none"/></svg>';

const POLL_THREAD = 3000, POLL_LIST = 8000, BEAT = 45000, TYPING_EVERY = 4000, TYPING_IDLE = 6000;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const hm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
function dayName(iso) {
  const d = new Date(iso), t = new Date(), y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== t.getFullYear() ? ' ' + d.getFullYear() : ''}`;
}
function shortWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso), t = new Date();
  if (d.toDateString() === t.toDateString()) return hm(iso);
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return 'Вчера';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function seen(p) {
  if (!p) return '';
  if (p.typing) return 'печатает…';
  if (p.online) return 'в сети';
  if (p.lastSeenAt) { const d = new Date(p.lastSeenAt); return `был(а) ${d.toDateString() === new Date().toDateString() ? 'в ' + hm(p.lastSeenAt) : shortWhen(p.lastSeenAt)}`; }
  return '';
}
const hue = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360; };
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function view(ctx) {
  const { h, icon, api, toast, css } = ctx;
  css('/worlds/messages.css'); css('/worlds/circle.css');
  const plan = ctx.plan || 'guest';
  const win = h('div', { class: 'ms-win' });
  const root = h('div', { class: 'view ms' }, win);
  let alive = true; const timers = new Set();
  const every = (fn, ms) => { const t = setInterval(() => { if (!document.hidden) fn(); }, ms); timers.add(t); return t; };
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

  function avatar(p, cls = '') {
    const box = h('span', { class: 'ms-ava ' + cls, style: `--h:${hue(p?.id || p?.name)}` }, h('b', null, initials(p?.name)));
    if (/^https:\/\//.test(p?.avatarUrl || '')) { const img = h('img', { src: p.avatarUrl, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }); img.onerror = () => img.remove(); box.append(img); }
    return box;
  }
  const round = (name, label, onclick, extra = {}) => h('button', { class: 'ms-round', title: label, 'aria-label': label, onclick, ...extra }, icon(name));
  function quiet(title, text, ...actions) {
    win.classList.add('ms-solo');
    win.replaceChildren(h('div', { class: 'ms-quiet' }, h('span', { class: 'ms-quiet-ic' }, icon('messages')), h('h2', null, title), h('p', null, text), actions.length ? h('div', { class: 'ms-quiet-acts' }, actions) : null));
  }

  // ── guest: the window is there, the people are not ──
  if (plan === 'guest') {
    quiet('Сообщения — с VITON ID', 'Переписка с людьми экосистемы VITON13 — та же, что на viton13.com. Войдите через VITON ID, чтобы открыть свои диалоги.',
      h('button', { class: 'btn', onclick: () => ctx.upgrade?.('messages') }, 'Что входит'));
    return { root, destroy() { alive = false; } };
  }

  // ── connecting to viton13.com ──
  let waitTimer = 0, site = 'https://www.viton13.com';
  async function boot() {
    quiet('Сообщения', 'Подключаюсь к VITON ID…');
    let st; try { st = await api('/api/messages/status'); } catch (e) { return quiet('Сообщения', e.message); }
    if (!alive) return; if (st.site) site = st.site;
    if (st.connected) return open(st.me);
    connectScreen(st);
  }
  function connectScreen(st) {
    if (st.mode === 'none') return quiet('Сообщения работают в окне VITON13', 'Сообщения VITON ID открываются в приложении VITON13 — там вход идёт через официальную страницу viton13.com. В обычном браузере их можно открыть на самом сайте.',
      h('button', { class: 'btn ghost', onclick: () => ctx.go('browser', { url: st.site + '/ru/cabinet' }) }, 'Открыть viton13.com'));
    if (st.mismatch) return quiet('Другой аккаунт на viton13.com', `В браузере приложения выполнен вход как ${st.siteEmail}, а вы вошли в VITON13 как ${st.email}. Чтобы переписка не перепуталась, войдите на сайте тем же аккаунтом.`,
      h('button', { class: 'btn', onclick: async () => { await api('/api/messages/disconnect', { body: {} }).catch(() => {}); start(); } }, 'Войти как ' + st.email));
    if (st.mode === 'direct') {
      const email = h('input', { class: 'field', type: 'email', placeholder: 'Почта', autocomplete: 'off', 'aria-label': 'Почта' });
      const pass = h('input', { class: 'field', type: 'password', placeholder: 'Пароль', autocomplete: 'off', 'aria-label': 'Пароль' });
      const go = h('button', { class: 'btn', type: 'submit' }, 'Подключить');
      quiet('Тестовый сайт сообщений', `Разработка: сообщения идут на ${st.site}.`,
        h('form', { class: 'ms-dev', onsubmit: async (e) => { e.preventDefault(); go.disabled = true; try { const d = await api('/api/messages/connect', { body: { email: email.value, password: pass.value } }); if (d.connected) open(d.me); } catch (err) { toast(err.message); go.disabled = false; } } }, email, pass, go));
      return;
    }
    const btn = h('button', { class: 'btn', onclick: start }, 'Войти на viton13.com');
    quiet('Сообщения VITON ID', 'Переписка с людьми экосистемы — та же, что на viton13.com. Вход — на официальной странице VITON ID в отдельном окне: пароль и код из письма вводятся там, приложение их не видит.', btn);
  }
  async function start() {
    try { await api('/api/messages/connect', { body: {} }); } catch (e) { return toast(e.message); }
    quiet('Окно входа открыто', 'Войдите в VITON ID в окне viton13.com. Как только вход случится, диалоги появятся здесь.',
      h('button', { class: 'btn ghost', onclick: start }, 'Открыть окно ещё раз'));
    clearInterval(waitTimer); const until = Date.now() + 10 * 60e3;
    waitTimer = setInterval(async () => {
      if (!alive || Date.now() > until) return clearInterval(waitTimer);
      const st = await api('/api/messages/status').catch(() => null);
      if (st?.connected) { clearInterval(waitTimer); open(st.me); } else if (st?.mismatch) { clearInterval(waitTimer); connectScreen(st); }
    }, 2000); timers.add(waitTimer);
  }

  // ── the messenger ──
  let me = null, threads = [], presence = {}, cur = null, query = '', reply = null, typingSent = 0, typingIdle = 0;
  const listEl = h('div', { class: 'ms-list', role: 'listbox', 'aria-label': 'Диалоги' });
  const find = h('input', { class: 'ms-find', type: 'search', placeholder: 'Поиск', 'aria-label': 'Поиск по диалогам и людям' });
  const people = h('div', { class: 'ms-people' });
  const side = h('aside', { class: 'ms-side' },
    h('div', { class: 'ms-side-top' }, h('h1', null, 'Сообщения'), round('plus', 'Новый диалог', () => { find.focus(); find.select(); })),
    h('label', { class: 'ms-find-box' }, icon('search'), find), people, listEl,
    h('div', { class: 'ms-side-foot' }, h('button', { class: 'ms-add', onclick: () => { find.value = ''; find.focus(); toast('Найдите человека по имени или VITON ID'); } }, 'Найти человека', icon('agents'))));
  const pane = h('section', { class: 'ms-pane' });

  function open(user) {
    me = user; win.classList.remove('ms-solo');
    win.replaceChildren(side, pane); emptyPane();
    loadThreads(); every(loadThreads, POLL_LIST); every(pollThread, POLL_THREAD);
    beat(); every(beat, BEAT); every(loadPresence, 30000);
  }
  const beat = () => api('/api/messages/presence', { body: {} }).catch(() => {});
  function emptyPane() {
    pane.replaceChildren(h('div', { class: 'ms-pane-empty' }, h('span', { class: 'ms-quiet-ic' }, icon('messages')), h('b', null, 'Выберите диалог'), h('small', null, 'или найдите человека по имени или VITON ID')));
    win.classList.remove('ms-in');
  }

  async function loadThreads() {
    let d; try { d = await api('/api/messages/threads'); } catch (e) { return signedOut(e); }
    if (!alive) return; threads = d.threads || []; paintList(); loadPresence(true);
  }
  async function loadPresence(onlyNew) {
    const ids = threads.map((t) => t.peer.id).filter((id) => id && (!onlyNew || !(id in presence))).slice(0, 24);
    if (!ids.length) return;
    try { const d = await api('/api/messages/presence?ids=' + encodeURIComponent(ids.join(','))); Object.assign(presence, d.presence || {}); paintList(); } catch { /* quiet */ }
  }
  function signedOut(e) {
    if (e?.status === 401) { stopAll(); connectScreen({ mode: 'window' }); toast('Вход на viton13.com закончился — войдите снова'); return; }
    if (e) toast(e.message);
  }

  function preview(t) {
    if (t.typing) return h('span', { class: 'ms-typing-txt' }, 'печатает…');
    if (t.unreadCount) return h('span', { class: 'ms-new' }, t.unreadCount === 1 ? 'Новое сообщение' : `Новых: ${t.unreadCount}`);
    if (!t.lastMessageAt) return 'Диалог открыт';
    const what = t.lastHasAttachments ? 'вложение' : 'сообщение';
    return t.lastSenderId === me.id ? `Вы: ${what}` : what[0].toUpperCase() + what.slice(1);
  }
  function paintList() {
    const q = query.trim().toLowerCase();
    const shown = q ? threads.filter((t) => `${t.peer.name} ${t.peer.vitonId}`.toLowerCase().includes(q)) : threads;
    if (!threads.length) return listEl.replaceChildren(h('div', { class: 'ms-list-empty' }, 'Диалогов пока нет. Найдите человека — и напишите первым.'));
    listEl.replaceChildren(...shown.map((t) => h('button', { class: 'ms-row' + (cur?.id === t.id ? ' on' : '') + (t.unreadCount ? ' unread' : ''), role: 'option', 'aria-selected': String(cur?.id === t.id), onclick: () => openThread(t.id, t.peer) },
      h('span', { class: 'ms-ava-wrap' }, avatar(t.peer), presence[t.peer.id]?.online && h('i', { class: 'ms-dot', 'aria-label': 'в сети' })),
      h('span', { class: 'ms-row-mid' }, h('b', null, t.peer.name || 'Без имени'), h('small', null, preview(t))),
      h('span', { class: 'ms-row-end' }, h('time', null, shortWhen(t.lastMessageAt || t.updatedAt)), t.unreadCount ? h('span', { class: 'ms-badge' }, String(Math.min(t.unreadCount, 99))) : icon('chev')))));
    if (q && !shown.length) listEl.append(h('div', { class: 'ms-list-empty ms-looking' }, 'В диалогах нет — ищу среди людей…'));
  }

  // people search: the same field finds conversations and, from two letters, people of VITON ID
  let findT = 0, findSeq = 0;
  find.addEventListener('input', () => {
    query = find.value; paintList(); clearTimeout(findT);
    const q = query.trim(); if (q.length < 2) return people.replaceChildren();
    findT = setTimeout(async () => {
      const seq = ++findSeq; let d; try { d = await api('/api/messages/people?q=' + encodeURIComponent(q)); } catch (e) { return signedOut(e); }
      if (seq !== findSeq || !alive) return;
      const known = new Set(threads.map((t) => t.peer.id)), fresh = (d.people || []).filter((p) => !known.has(p.id));
      listEl.querySelector('.ms-list-empty.ms-looking')?.replaceWith(...(fresh.length ? [] : [h('div', { class: 'ms-list-empty' }, 'Никого не нашлось. Попробуйте имя или 13 цифр VITON ID.')]));
      people.replaceChildren(...(fresh.length ? [h('span', { class: 'cap ms-cap' }, 'Люди VITON ID'), ...fresh.map((p) => h('button', { class: 'ms-row ms-person', onclick: () => startWith(p) },
        avatar(p), h('span', { class: 'ms-row-mid' }, h('b', null, p.name || 'Без имени'), h('small', null, [p.vitonId && `ID ${p.vitonId}`, p.city].filter(Boolean).join(' · ') || 'VITON ID')), icon('plus')))] : []));
    }, 320);
  });
  find.addEventListener('keydown', (e) => { if (e.key === 'Escape') { find.value = ''; query = ''; people.replaceChildren(); paintList(); } });
  async function startWith(p) {
    try { const d = await api('/api/messages/open', { body: { peerId: p.id } }); find.value = ''; query = ''; people.replaceChildren(); await loadThreads(); openThread(d.threadId, d.peer || p); }
    catch (e) { signedOut(e); }
  }

  // ── one conversation ──
  function openThread(id, peer) {
    if (cur?.id === id) { win.classList.add('ms-in'); return; }
    stopTyping(); reply = null; recorder?.close(); recorder = null;
    for (const pl of players.values()) pl.querySelector('video')?.pause(); players.clear();
    cur = { id, peer, msgs: [], hasMore: false, peerState: {}, peerReadAt: '', loading: true };
    win.classList.add('ms-in'); paintList(); paintPane(); loadThread();
  }
  async function loadThread(before) {
    const c = cur; let d;
    try { d = await api(`/api/messages/thread/${c.id}${before ? '?before=' + encodeURIComponent(before) : ''}`); } catch (e) { return signedOut(e); }
    if (c !== cur || !alive) return;
    c.loading = false;
    const add = (d.messages || []).filter((m) => !c.msgs.some((x) => x.id === m.id));
    c.msgs = before ? [...add, ...c.msgs] : [...c.msgs, ...add];
    if (!before) c.hasMore = !!d.hasMore; else c.hasMore = !!d.hasMore;
    applyLive(c, d);
    const keep = before ? scroller.scrollHeight - scroller.scrollTop : null;
    paintMsgs(); if (before) scroller.scrollTop = scroller.scrollHeight - keep; else toBottom(true);
    markRead();
  }
  function applyLive(c, d) {
    if (d.peer) { c.peerState = d.peer; presence[c.peer.id] = { online: d.peer.online, lastSeenAt: d.peer.lastSeenAt }; }
    if (d.peerReadAt) c.peerReadAt = d.peerReadAt;
    const gone = new Set(d.removedIds || []); if (gone.size) c.msgs = c.msgs.filter((m) => !gone.has(m.id));
    sub.textContent = seen(c.peerState) || (c.peer.vitonId ? 'VITON ID ' + c.peer.vitonId : '');
    typingEl.classList.toggle('hide', !c.peerState.typing);
  }
  async function pollThread() {
    const c = cur; if (!c || c.loading) return;
    const last = c.msgs.at(-1)?.createdAt; let d;
    try { d = await api(`/api/messages/thread/${c.id}${last ? '?after=' + encodeURIComponent(last) : ''}`); } catch { return; }
    if (c !== cur || !alive) return;
    const add = (d.messages || []).filter((m) => !c.msgs.some((x) => x.id === m.id));
    const near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    c.msgs.push(...add); applyLive(c, d);
    if (add.length || d.removedIds?.length) { paintMsgs(); if (near || add.some((m) => m.senderId === me.id)) toBottom(); if (add.some((m) => m.senderId !== me.id)) markRead(); }
  }
  let readT = 0;
  function markRead() { const c = cur; clearTimeout(readT); readT = setTimeout(() => { if (c === cur && !document.hidden) api(`/api/messages/thread/${c.id}/read`, { body: {} }).then(() => { const t = threads.find((x) => x.id === c.id); if (t?.unreadCount) { t.unreadCount = 0; paintList(); } }).catch(() => {}); }, 600); }

  const scroller = h('div', { class: 'ms-scroll', role: 'log', 'aria-live': 'polite' });
  const msgsEl = h('div', { class: 'ms-msgs' });
  const typingEl = h('div', { class: 'ms-bubble them ms-typing hide', 'aria-label': 'печатает' }, h('i'), h('i'), h('i'));
  const sub = h('small', { class: 'ms-sub' });
  const input = h('textarea', { class: 'ms-input', rows: 1, placeholder: 'Сообщение', maxlength: 2000, 'aria-label': 'Сообщение' });
  const sendBtn = h('button', { class: 'ms-send', onclick: () => send() }, 'Отправить');
  const mic = round('mic', 'Надиктовать', () => dictate(), { class: 'ms-round ms-mic' });
  const emo = emojiPicker({ h, onPick: (e) => { input.setRangeText(e, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end'); input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); } });
  const emoBtn = h('button', { class: 'ms-round ms-emoji', type: 'button', title: 'Эмодзи', 'aria-label': 'Эмодзи', html: SMILE, onclick: () => emo.toggle() });
  const camBtn = h('button', { class: 'ms-round ms-cam', type: 'button', title: 'Кружок', 'aria-label': 'Записать кружок', html: CAM, onclick: () => circle() });
  const players = new Map();                                       // circle players survive repaints, so a playing one is not restarted
  let recorder = null;                                             // the open recorder: closing it turns the camera off
  function circle() {
    if (!cur) return; emo.close();
    const c = cur;
    recorder?.close(); recorder = recordCircle({ h, host: pane, onSend: (rec) => sendCircle(c, rec) });
  }
  async function sendCircle(c, rec) {
    const p = new URLSearchParams({ type: rec.type, duration: String(rec.duration), width: String(rec.width), height: String(rec.height) });
    const r = await fetch(`/api/messages/thread/${c.id}/attach?${p}`, { method: 'POST', headers: { 'content-type': rec.type }, body: rec.blob }).catch(() => null);
    const up = await r?.json().catch(() => null);
    if (!r?.ok || !up?.ok) { if (r?.status === 401) signedOut(Object.assign(new Error(up?.message || ''), { status: 401 })); throw new Error(up?.message || 'Нет связи с viton13.com'); }
    const d = await api(`/api/messages/thread/${c.id}`, { body: { attachmentIds: [up.attachment.id] } }).catch((e) => { throw e; });
    // the bubble shows the local recording at once; the file from the site takes over on the next visit
    const local = URL.createObjectURL(rec.blob), msg = { ...d.message, attachments: (d.message.attachments?.length ? d.message.attachments : [up.attachment]).map((a) => ({ ...a, local })) };
    if (!c.msgs.some((x) => x.id === msg.id)) c.msgs.push(msg); else c.msgs = c.msgs.map((x) => (x.id === msg.id ? msg : x));
    const t = threads.find((x) => x.id === c.id); if (t) { t.lastSenderId = me.id; t.lastMessageAt = msg.createdAt; t.lastHasAttachments = true; t.updatedAt = msg.createdAt; threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); paintList(); }
    if (c === cur) { paintMsgs(); toBottom(); }
  }
  const replyBox = h('div', { class: 'ms-reply hide' });
  scroller.append(msgsEl, typingEl);
  scroller.addEventListener('scroll', () => { if (cur?.hasMore && !cur.loadingOld && scroller.scrollTop < 60 && cur.msgs.length) { cur.loadingOld = true; loadThread(cur.msgs[0].createdAt).finally(() => { if (cur) cur.loadingOld = false; }); } }, { passive: true });

  function paintPane() {
    const c = cur, p = c.peer;
    pane.replaceChildren(
      h('header', { class: 'ms-head' }, h('button', { class: 'ms-round ms-back', 'aria-label': 'К диалогам', onclick: () => { win.classList.remove('ms-in'); } }, icon('back')),
        avatar(p, 'sm'), h('div', { class: 'ms-who' }, h('b', null, p.name || 'Без имени'), sub),
        h('div', { class: 'ms-head-acts' }, round('meet', 'Видеовстреча', async () => {          // a meeting with this person: the code goes into the chat, the meeting opens
          try { const d = await api('/api/meet/rooms', { body: { title: '' } }); input.value = `Видеовстреча VITON13: код ${d.room.code}`; await send(); ctx.go('meet', { code: d.room.code }); } catch (e) { toast(e.message); } }),
          round('help', 'О человеке', () => personSheet(p)),
          h('button', { class: 'ms-round', onclick: () => ctx.go('browser', { url: `${site}/ru/cabinet` }), title: 'Открыть на viton13.com в Meridian', 'aria-label': 'Открыть на viton13.com' }, icon('out')))),
      scroller,
      h('div', { class: 'ms-compose' }, emo.el, replyBox, h('div', { class: 'ms-compose-row' }, h('div', { class: 'ms-field' }, input, emoBtn, mic, camBtn), sendBtn)));
    msgsEl.replaceChildren(h('div', { class: 'ms-loading' }, h('i'), h('i'), h('i')));
    sub.textContent = p.vitonId ? 'VITON ID ' + p.vitonId : ''; typingEl.classList.add('hide');
    paintReply(); grow(); if (matchMedia('(min-width: 761px)').matches) input.focus();
  }
  function paintMsgs() {
    const c = cur, out = []; let lastDay = '', lastSender = '';
    if (c.hasMore) out.push(h('div', { class: 'ms-older' }, 'Прокрутите вверх — более ранние сообщения'));
    if (!c.msgs.length) out.push(h('div', { class: 'ms-first' }, avatar(c.peer, 'lg'), h('b', null, c.peer.name || 'Без имени'), h('small', null, 'Напишите первым — это начало вашей переписки.')));
    const lastMine = [...c.msgs].reverse().find((m) => m.senderId === me.id && !m.deleted);
    for (const m of c.msgs) {
      const day = dayKey(m.createdAt); if (day !== lastDay) { out.push(h('div', { class: 'ms-day' }, dayName(m.createdAt))); lastDay = day; lastSender = ''; }
      const mine = m.senderId === me.id, grouped = lastSender === m.senderId; lastSender = m.senderId;
      out.push(bubble(m, mine, grouped, m === lastMine && c.peerReadAt && c.peerReadAt >= m.createdAt));
    }
    msgsEl.replaceChildren(...out);
  }
  function bubble(m, mine, grouped, read) {
    const isCircle = !m.deleted && !m.text && (m.attachments || []).length === 1 && m.attachments[0].kind === 'video';
    const cls = `ms-bubble ${mine ? 'me' : 'them'}${grouped ? ' grouped' : ''}${!m.deleted && !m.replyTo && !m.attachments?.length && onlyEmoji(m.text) ? ' jumbo' : ''}${isCircle ? ' circle' : ''}`;
    if (m.deleted) return h('div', { class: cls + ' gone' }, 'Сообщение удалено');
    const body = [];
    if (m.forwardedFrom) body.push(h('div', { class: 'ms-fwd' }, 'Переслано от ' + m.forwardedFrom));
    if (m.replyTo) body.push(h('div', { class: 'ms-quote' }, h('b', null, m.replyTo.senderId === me.id ? 'Вы' : cur.peer.name || 'Собеседник'), h('span', null, m.replyTo.preview || (m.replyTo.kind === 'video' ? 'кружок' : 'вложение'))));
    if (m.text) body.push(h('div', { class: 'ms-text' }, m.text));
    else if (m.legacy) body.push(h('div', { class: 'ms-text ms-legacy' }, 'Защищённое сообщение старого формата. Его можно прочитать на сайте, на устройстве, где оно было открыто.'));
    for (const a of m.attachments || []) if (a.kind === 'video') {
      const key = `${cur.id}:${a.id}`; let pl = players.get(key);
      if (!pl) { pl = circlePlayer({ h, src: a.local || `/api/messages/thread/${cur.id}/file/${encodeURIComponent(a.id)}`, duration: a.duration }); players.set(key, pl); }
      body.push(pl);
    } else body.push(h('div', { class: 'ms-file' }, icon(a.kind === 'image' ? 'frames' : a.kind === 'voice' ? 'mic' : 'works'), h('span', null, a.kind === 'voice' ? 'Голосовое сообщение' : a.name || 'Файл'), h('small', null, 'на сайте')));
    body.push(h('time', { class: 'ms-time' }, hm(m.createdAt), mine && read ? h('span', { class: 'ms-read', title: 'Прочитано' }, ' · прочитано') : null));
    const acts = h('div', { class: 'ms-acts' },
      h('button', { onclick: () => { reply = m; paintReply(); input.focus(); } }, 'Ответить'),
      plan === 'vit' && m.text && !mine ? h('button', { onclick: () => ctx.askVit?.(`Помоги ответить на сообщение от ${cur.peer.name || 'собеседника'}: «${m.text.slice(0, 600)}»`) }, 'Спросить VIT') : null,
      h('button', { class: 'danger', onclick: () => remove(m, mine) }, mine ? 'Удалить' : 'Скрыть'));
    return h('div', { class: cls, 'data-id': m.id }, body, acts);
  }
  function paintReply() {
    replyBox.classList.toggle('hide', !reply);
    if (reply) replyBox.replaceChildren(h('div', null, h('b', null, 'Ответ ' + (reply.senderId === me.id ? 'себе' : cur.peer.name || '')), h('span', null, (reply.text || (reply.attachments?.[0]?.kind === 'video' ? 'кружок' : 'вложение')).slice(0, 120))), h('button', { class: 'ms-x', 'aria-label': 'Не отвечать', onclick: () => { reply = null; paintReply(); } }, '×'));
  }
  async function remove(m, mine) {
    if (!confirm(mine ? 'Удалить сообщение у обоих?' : 'Скрыть сообщение у себя?')) return;
    try { await api(`/api/messages/thread/${cur.id}?message=${encodeURIComponent(m.id)}`, { method: 'DELETE' }); cur.msgs = cur.msgs.filter((x) => x.id !== m.id); paintMsgs(); }
    catch (e) { signedOut(e); }
  }
  function toBottom(now) { requestAnimationFrame(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: now || reduced() ? 'auto' : 'smooth' })); }

  async function send() {
    const c = cur, text = input.value.trim(); if (!c || !text || sendBtn.disabled) return;
    sendBtn.disabled = true; stopTyping(); emo.close();
    const temp = { id: 'tmp' + Date.now(), senderId: me.id, text, createdAt: new Date().toISOString(), attachments: [], replyTo: reply ? { senderId: reply.senderId, preview: (reply.text || '').slice(0, 140) } : null, pending: true };
    const replyToId = reply?.id; reply = null; paintReply(); input.value = ''; grow();
    c.msgs.push(temp); paintMsgs(); toBottom(); msgsEl.querySelector(`[data-id="${temp.id}"]`)?.classList.add('pending');
    try {
      const d = await api(`/api/messages/thread/${c.id}`, { body: { text, ...(replyToId ? { replyToId } : {}) } });
      const i = c.msgs.indexOf(temp); if (i >= 0) c.msgs[i] = d.message; else if (!c.msgs.some((x) => x.id === d.message.id)) c.msgs.push(d.message);
      const t = threads.find((x) => x.id === c.id); if (t) { t.lastSenderId = me.id; t.lastMessageAt = d.message.createdAt; t.updatedAt = d.message.createdAt; threads.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); paintList(); }
    } catch (e) { c.msgs = c.msgs.filter((x) => x !== temp); input.value = text; grow(); signedOut(e); }
    if (c === cur) paintMsgs(); sendBtn.disabled = false;
  }

  // typing: a ping at most every few seconds while keys move, a stop on send or silence
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; sendBtn.classList.toggle('ready', !!input.value.trim()); }
  input.addEventListener('input', () => {
    grow(); if (!cur || !input.value.trim()) return stopTyping();
    if (Date.now() - typingSent > TYPING_EVERY) { typingSent = Date.now(); api('/api/messages/presence', { body: { threadId: cur.id, typing: true } }).catch(() => {}); }
    clearTimeout(typingIdle); typingIdle = setTimeout(stopTyping, TYPING_IDLE);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } if (e.key === 'Escape' && reply) { reply = null; paintReply(); } });
  function stopTyping() { clearTimeout(typingIdle); if (typingSent && cur) api('/api/messages/presence', { body: { threadId: cur.id, typing: false } }).catch(() => {}); typingSent = 0; }

  // dictation through VIT's own speech recognition (/api/stt): speech becomes text in the field, nothing is sent by itself
  let rec = null;
  async function dictate() {
    if (rec) return rec.stop();
    let media; try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('Нет доступа к микрофону'); }
    const chunks = []; rec = new MediaRecorder(media); mic.classList.add('live');
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      media.getTracks().forEach((t) => t.stop()); mic.classList.remove('live'); rec = null;
      try { const r = await fetch('/api/stt', { method: 'POST', body: new Blob(chunks, { type: 'audio/webm' }) }), d = await r.json();
        if (d.text) { input.value = (input.value ? input.value + ' ' : '') + d.text; grow(); input.focus(); } else toast(d.message || 'Не расслышал'); }
      catch { toast('Не получилось распознать речь'); }
    };
    rec.start(); later(() => rec?.stop(), 60000);
  }

  // a person's card
  async function personSheet(p) {
    const box = h('div', { class: 'ms-card' }, avatar(p, 'lg'), h('b', null, p.name || 'Без имени'), h('small', null, p.vitonId ? 'VITON ID ' + p.vitonId : ''));
    const sheet = h('div', { class: 'ms-sheet', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === sheet) sheet.remove(); } }, h('div', { class: 'ms-sheet-in' }, h('button', { class: 'ms-x', 'aria-label': 'Закрыть', onclick: () => sheet.remove() }, '×'), box));
    win.append(sheet);
    try { const d = await api('/api/messages/person/' + encodeURIComponent(p.id)), x = d.person || d.profile || d;
      const rows = [x.city && ['Город', x.city], x.bio && ['О себе', x.bio], x.createdAt && ['В VITON ID с', new Date(x.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })]].filter(Boolean);
      if (rows.length) box.append(h('dl', null, rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
      const s = seen(presence[p.id]); if (s) box.append(h('span', { class: 'ms-pill' }, s)); }
    catch { /* the card stays with what is known */ }
  }

  const onKey = (e) => { if (e.key === 'Escape') win.querySelector('.ms-sheet')?.remove(); };
  window.addEventListener('keydown', onKey);
  function stopAll() { for (const t of timers) { clearInterval(t); clearTimeout(t); } timers.clear(); }
  styled('/worlds/messages.css').then(() => { if (alive) boot(); });
  return { root, destroy() { alive = false; stopTyping(); stopAll(); clearTimeout(findT); clearTimeout(readT); rec?.stop(); recorder?.close(); for (const pl of players.values()) pl.querySelector('video')?.pause(); window.removeEventListener('keydown', onKey); } };
}
