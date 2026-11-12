// Messages: the people and direct messages of VITON ID (viton13.com), in the app.
//
// The site is the source of truth: threads, people, presence and the at-rest encryption of every message all live
// there. This file is a narrow bridge that calls the site's own API on the person's behalf.
//
// How it talks to the site, honestly:
//   • In the VITON13 window (this server runs inside Electron's main process) the person signs in on the official
//     viton13.com page, in a window of its own; the site sets its session cookie in the browser session the app's
//     browser Meridian uses (persist:meridian). Every call then runs as a fetch inside a hidden page of
//     www.viton13.com in that same session — a real same-origin request, so the site's origin checks hold exactly as
//     for its own pages. The app never sees the password, the email code or the cookie.
//   • Outside Electron (plain `npm start`) there is no such session, and sending to the real site is not possible
//     without faking browser headers — so the world says so. Only a development site (VIT_SITE_URL pointing at a
//     non-viton13.com host, e.g. a local mock) is reached directly with a cookie kept in memory, for testing.
import { createRequire } from 'node:module';
import { db, one, run, now } from '../db.mjs';
import { can } from '../plan.mjs';

export const SITE = String(process.env.VIT_SITE_URL || 'https://www.viton13.com').replace(/\/+$/, '');
const SITE_URL = new URL(SITE);
const OFFICIAL = /(^|\.)viton13\.com$/i.test(SITE_URL.hostname);
const PARTITION = 'persist:meridian';
const SIGN_IN = OFFICIAL ? `${SITE}/ru/viton-id?view=signIn` : `${SITE}/login`;
const ANCHOR = `${SITE}/robots.txt`;                            // a tiny page of the site to make requests from

db.exec(`CREATE TABLE IF NOT EXISTS messages_link (user TEXT PRIMARY KEY, site_user TEXT, name TEXT, viton_id TEXT, avatar TEXT, email TEXT, linked INTEGER)`);

// ── Electron (only when this server runs inside the VITON13 window) ─────────
let E = null;
if (process.versions.electron) { try { E = createRequire(import.meta.url)('electron'); if (!E?.BrowserWindow) E = null; } catch { E = null; } }
const mode = E ? 'window' : OFFICIAL ? 'none' : 'direct';

let anchor = null, anchorReady = null;
function anchorWindow() {
  if (anchor && !anchor.isDestroyed() && anchorReady) return anchorReady;
  anchor = new E.BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  anchor.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  anchor.on('closed', () => { anchor = null; anchorReady = null; });
  anchorReady = anchor.loadURL(ANCHOR).then(() => anchor).catch((e) => { anchorReady = null; throw e; });
  return anchorReady;
}

/** One call to the site's API from inside a page of the site, with the site's own cookie. */
async function viaWindow(method, path, body) {
  const win = await anchorWindow();
  if (new URL(win.webContents.getURL()).origin !== SITE_URL.origin) { anchorReady = null; win.destroy(); throw siteDown(); }
  const init = { method, credentials: 'same-origin', cache: 'no-store', headers: body !== undefined ? { 'content-type': 'application/json' } : {} };
  const script = `fetch(${JSON.stringify(path)}, Object.assign(${JSON.stringify(init)}, ${body !== undefined ? `{ body: ${JSON.stringify(JSON.stringify(body))} }` : '{}'}))
    .then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }))`;
  const r = await Promise.race([win.webContents.executeJavaScript(script, true), new Promise((res) => setTimeout(() => res({ status: 0, text: '' }), 20000))]);
  return { status: r.status, data: parse(r.text) };
}

// ── development site: a direct call with a cookie kept in memory ─────────────
const jars = new Map();                                           // local user → "name=value" of the dev site's session
async function viaDirect(user, method, path, body) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const jar = jars.get(user.id); if (jar) headers.cookie = jar;
  try {
    const r = await fetch(SITE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const set = r.headers.getSetCookie?.() || [];
    for (const c of set) { const pair = c.split(';')[0]; if (/session/i.test(pair)) { if (/=;|=$|Max-Age=0/i.test(c)) jars.delete(user.id); else jars.set(user.id, pair); } }
    return { status: r.status, data: parse(await r.text()) };
  } catch { return { status: 0, data: null }; }
}

// ── files (кружки, photos, voice): bytes come back from the site through the same two paths ──
async function binaryViaWindow(path) {
  const win = await anchorWindow();
  if (new URL(win.webContents.getURL()).origin !== SITE_URL.origin) { anchorReady = null; win.destroy(); throw siteDown(); }
  const script = `fetch(${JSON.stringify(path)}, { credentials: 'same-origin', cache: 'no-store' }).then(async (r) => {
    const b = new Uint8Array(await r.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return { status: r.status, type: r.headers.get('content-type') || '', b64: btoa(s) }; }).catch(() => ({ status: 0, type: '', b64: '' }))`;
  const r = await Promise.race([win.webContents.executeJavaScript(script, true), new Promise((res) => setTimeout(() => res({ status: 0, type: '', b64: '' }), 30000))]);
  return { status: r.status, type: r.type, bytes: Buffer.from(r.b64 || '', 'base64') };
}
async function binaryViaDirect(user, path) {
  const headers = {}; const jar = jars.get(user.id); if (jar) headers.cookie = jar;
  try { const r = await fetch(SITE + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(30000) }); return { status: r.status, type: r.headers.get('content-type') || '', bytes: Buffer.from(await r.arrayBuffer()) }; }
  catch { return { status: 0, type: '', bytes: Buffer.alloc(0) }; }
}
const fetchBinary = (user, path) => (mode === 'window' ? binaryViaWindow(path) : binaryViaDirect(user, path));

// A small memory cache, so a <video> asking for byte ranges does not pull the whole file from the site each time.
const files = new Map(); let filesBytes = 0; const FILES_CAP = 80e6;
function remember(key, value) {
  if (files.has(key)) { filesBytes -= files.get(key).bytes.length; files.delete(key); }
  files.set(key, value); filesBytes += value.bytes.length;
  for (const [k, v] of files) { if (filesBytes <= FILES_CAP) break; files.delete(k); filesBytes -= v.bytes.length; }
}
const MEDIA = /^(video\/(webm|mp4)|audio\/(webm|ogg|mp4|mpeg)|image\/(jpeg|png|webp|gif|avif))$/;
async function readRaw(req, limit) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('Кружок слишком большой — до 4 МБ'), { http: 413 }); chunks.push(c); }
  return Buffer.concat(chunks);
}

const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };
const siteDown = () => Object.assign(new Error('viton13.com сейчас не отвечает'), { status: 503 });
function call(user, method, path, body) { return mode === 'window' ? viaWindow(method, path, body) : viaDirect(user, method, path, body); }

// ── signing in on the official page ─────────────────────────────────────────
let signWin = null;
function openSignIn() {
  if (signWin && !signWin.isDestroyed()) { signWin.show(); signWin.focus(); return; }
  signWin = new E.BrowserWindow({ width: 520, height: 760, title: 'VITON ID', backgroundColor: '#000000', autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  signWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) E.shell.openExternal(url); return { action: 'deny' }; });
  signWin.on('closed', () => { signWin = null; });
  signWin.loadURL(SIGN_IN);
}
function closeSignIn() { if (signWin && !signWin.isDestroyed()) signWin.close(); }

// ── who is signed in on the site, and is it this person ─────────────────────
const link = (user) => one('SELECT * FROM messages_link WHERE user = ?', user.id) || null;
async function siteMe(user) {
  const r = await call(user, 'GET', '/api/auth/session');
  return r.status === 200 && r.data?.ok && r.data.user?.id ? r.data.user : null;
}
const meShape = (u) => u && { id: u.id, name: u.name || '', vitonId: u.vitonId || '', avatarUrl: u.avatarUrl || '', email: u.email || '' };

async function status(user) {
  if (mode === 'none') return { mode, connected: false, site: SITE };
  const me = await siteMe(user);
  if (!me) return { mode, connected: false, site: SITE, wasLinked: !!link(user) };
  const mine = String(user.email || '').toLowerCase(), theirs = String(me.email || '').toLowerCase();
  if (user.kind === 'viton' && mine && theirs && mine !== theirs) return { mode, connected: false, mismatch: true, site: SITE, siteEmail: theirs, email: mine };
  run('INSERT INTO messages_link (user, site_user, name, viton_id, avatar, email, linked) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user) DO UPDATE SET site_user = excluded.site_user, name = excluded.name, viton_id = excluded.viton_id, avatar = excluded.avatar, email = excluded.email',
    user.id, me.id, me.name || '', me.vitonId || '', me.avatarUrl || '', theirs, now());
  closeSignIn();
  return { mode, connected: true, site: SITE, me: meShape(me) };
}

// ── the routes ──────────────────────────────────────────────────────────────
const THREAD = /^dm_[A-Za-z0-9_-]{28}$/, DOC = /^[A-Za-z0-9_-]{1,128}$/, STAMP = /^[0-9TZ:.+-]{10,40}$/;
const CODES = { VITON_ID_REQUIRED: 'Войдите в VITON ID на viton13.com', UNAUTHENTICATED: 'Войдите в VITON ID на viton13.com', TOO_MANY_REQUESTS: 'Слишком часто. Подождите немного',
  MESSAGE_TOO_LONG: 'Слишком длинное сообщение — до 2000 знаков', PERSON_NOT_FOUND: 'Человек не найден', THREAD_NOT_FOUND: 'Диалог не найден', MESSAGES_NOT_CONFIGURED: 'Сообщения на сайте сейчас недоступны',
  CROSS_ORIGIN_REQUEST: 'Сайт не принял запрос', ORIGIN_REQUIRED: 'Сайт не принял запрос',
  ATTACHMENT_NOT_FOUND: 'Файл не найден — запишите кружок ещё раз', FILE_TOO_LARGE: 'Кружок слишком большой — до 4 МБ', VIDEO_TOO_LONG: 'Кружок — до минуты',
  VIDEO_NOTES_PER_DAY: 'На сегодня кружков достаточно — завтра снова можно', ATTACHMENT_STORAGE_FAILED: 'Сайт не смог сохранить файл' };
const NO_CIRCLES = 'viton13.com ещё не принимает кружки — нужно обновить сайт';

export async function handle({ req, res: reply, url, user, seg, method, json, fail, body }) {
  if (seg[1] !== 'messages') return false;
  const plan = user.plan || 'guest';
  if (!can(user, 'messages')) { json(402, { ok: false, code: 'subscribe', message: 'Сообщения недоступны на вашем уровне — посмотрите «Что входит»' }); return true; }
  const what = seg[2] || '';

  if (what === 'status' && method === 'GET') { json(200, { ok: true, ...(await status(user)) }); return true; }
  if (mode === 'none') { fail(409, 'Сообщения работают в окне приложения VITON13'); return true; }

  if (what === 'connect' && method === 'POST') {
    if (mode === 'window') { openSignIn(); json(200, { ok: true, opened: true }); return true; }
    const b = await body(), r = await call(user, 'POST', '/api/auth/login', { email: String(b.email || '').slice(0, 254), password: String(b.password || '').slice(0, 200), locale: 'ru' });
    if (r.status === 200 && r.data?.ok) { json(200, { ok: true, ...(await status(user)) }); return true; }
    fail(r.status === 202 ? 409 : 401, r.status === 202 ? 'Сайт просит код из письма — войдите в окне приложения' : 'Неверная почта или пароль'); return true;
  }
  if (what === 'disconnect' && method === 'POST') {
    run('DELETE FROM messages_link WHERE user = ?', user.id);
    await call(user, 'DELETE', '/api/auth/session').catch(() => null); jars.delete(user.id);
    json(200, { ok: true }); return true;
  }

  // everything below needs a site session
  const pass = async (m, path, b) => {
    const r = await call(user, m, path, b);
    if (r.status === 0) { fail(503, 'viton13.com сейчас не отвечает'); return; }
    if (r.status === 401) { json(401, { ok: false, code: 'signin', message: 'Войдите в VITON ID на viton13.com' }); return; }
    if (r.status >= 400 || !r.data?.ok) { fail(r.status >= 400 ? r.status : 502, CODES[r.data?.code] || 'Сайт не смог выполнить запрос'); return; }
    json(200, r.data);
  };
  const q = (k) => String(url.searchParams.get(k) || '');

  if (what === 'threads' && method === 'GET') { await pass('GET', '/api/messages/threads'); return true; }
  if (what === 'unread' && method === 'GET') { await pass('GET', '/api/messages/unread'); return true; }
  if (what === 'open' && method === 'POST') { const b = await body(), peerId = String(b.peerId || ''); if (!DOC.test(peerId)) { fail(400, 'Некорректный человек'); return true; } await pass('POST', '/api/messages/threads', { peerId }); return true; }
  if (what === 'people' && method === 'GET') { const s = q('q').trim().slice(0, 80); if (s.length < 2) { json(200, { ok: true, people: [] }); return true; } await pass('GET', '/api/people/search?q=' + encodeURIComponent(s)); return true; }
  if (what === 'person' && seg[3] && method === 'GET') { if (!DOC.test(seg[3])) { fail(400, 'Некорректный человек'); return true; } await pass('GET', '/api/people/' + seg[3]); return true; }
  if (what === 'presence' && method === 'GET') { const ids = q('ids').split(',').filter((x) => DOC.test(x)).slice(0, 24).join(','); await pass('GET', '/api/messages/presence?ids=' + encodeURIComponent(ids)); return true; }
  if (what === 'presence' && method === 'POST') {
    const b = await body(), out = {};
    if (typeof b.typing === 'boolean') { if (!THREAD.test(String(b.threadId || ''))) { fail(400, 'Некорректный диалог'); return true; } out.threadId = b.threadId; out.typing = b.typing; } else out.heartbeat = true;
    await pass('POST', '/api/messages/presence', out); return true;
  }
  if (what === 'thread' && seg[3]) {
    const id = seg[3]; if (!THREAD.test(id)) { fail(400, 'Некорректный диалог'); return true; }
    // a кружок (or another file) goes up as raw bytes; the site wants base64url JSON and keeps it encrypted
    if (method === 'POST' && seg[4] === 'attach') {
      const type = q('type').split(';')[0].trim().toLowerCase();
      if (!MEDIA.test(type)) { fail(415, 'Такой файл не отправить'); return true; }
      if (type.startsWith('video/') && !can(user, 'circles')) { json(402, { ok: false, code: 'subscribe', message: 'Кружки недоступны на вашем уровне' }); return true; }
      let bytes; try { bytes = await readRaw(req, 4_000_000); } catch (e) { fail(e.http || 400, e.message); return true; }
      if (bytes.length < 16) { fail(400, 'Пустой файл'); return true; }
      const ext = type.split('/')[1].replace('mpeg', 'mp3'), num = (k, max) => { const v = Number(q(k)); return Number.isFinite(v) && v > 0 ? Math.min(max, v) : 0; };
      const r = await call(user, 'POST', `/api/messages/threads/${id}/attachments`, { name: `${type.startsWith('video/') ? 'circle' : 'file'}.${ext}`, type, size: bytes.length,
        width: Math.round(num('width', 4096)), height: Math.round(num('height', 4096)), duration: num('duration', 180), peaks: [], data: bytes.toString('base64url') });
      if (r.status === 0) { fail(503, 'viton13.com сейчас не отвечает'); return true; }
      if (r.status === 401) { json(401, { ok: false, code: 'signin', message: 'Войдите в VITON ID на viton13.com' }); return true; }
      const code = r.data?.code;
      if (type.startsWith('video/') && (code === 'UNSUPPORTED_FILE_TYPE' || code === 'FILE_TYPE_MISMATCH' || r.status === 404 || r.status === 405)) { json(409, { ok: false, code: 'no_circles', message: NO_CIRCLES }); return true; }
      if (r.status >= 400 || !r.data?.ok) { fail(r.status >= 400 ? r.status : 502, CODES[code] || 'Сайт не принял файл'); return true; }
      json(201, r.data); return true;
    }
    // the bytes of one attachment, with byte ranges for <video> / <audio>
    if (method === 'GET' && seg[4] === 'file' && seg[5]) {
      const aid = seg[5]; if (!DOC.test(aid)) { fail(400, 'Некорректный файл'); return true; }
      const key = `${user.id}:${id}:${aid}`; let f = files.get(key);
      if (!f) {
        const r = await fetchBinary(user, `/api/messages/threads/${id}/attachments/${aid}`);
        if (r.status === 401) { json(401, { ok: false, code: 'signin', message: 'Войдите в VITON ID на viton13.com' }); return true; }
        const type = String(r.type).split(';')[0].trim().toLowerCase();
        if (r.status !== 200 || !r.bytes.length || !MEDIA.test(type)) { fail(r.status === 404 ? 404 : 502, 'Файл недоступен'); return true; }
        f = { type, bytes: r.bytes }; remember(key, f);
      }
      const total = f.bytes.length, m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
      const head = { 'content-type': f.type, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=900', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" };
      if (m && (m[1] || m[2])) {
        let start = m[1] ? Number(m[1]) : total - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : total - 1;
        start = Math.max(0, start); end = Math.min(total - 1, end);
        if (start > end) { reply.writeHead(416, { ...head, 'content-range': `bytes */${total}` }); reply.end(); return true; }
        reply.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${total}`, 'content-length': String(end - start + 1) }); reply.end(f.bytes.subarray(start, end + 1)); return true;
      }
      reply.writeHead(200, { ...head, 'content-length': String(total) }); reply.end(f.bytes); return true;
    }
    if (method === 'GET') { const p = new URLSearchParams(); for (const k of ['after', 'before']) if (STAMP.test(q(k))) p.set(k, q(k)); await pass('GET', `/api/messages/threads/${id}${p.size ? '?' + p : ''}`); return true; }
    if (method === 'POST' && seg[4] === 'read') { await pass('PATCH', `/api/messages/threads/${id}`, {}); return true; }
    if (method === 'POST') {
      const b = await body(), text = String(b.text || '').trim(), ids = (Array.isArray(b.attachmentIds) ? b.attachmentIds : []).map(String).filter((x) => DOC.test(x)).slice(0, 4);
      if (!text && !ids.length) { fail(400, 'Пустое сообщение'); return true; } if (text.length > 2000) { fail(413, CODES.MESSAGE_TOO_LONG); return true; }
      const out = { text }; if (ids.length) out.attachmentIds = ids; if (DOC.test(String(b.replyToId || ''))) out.replyToId = b.replyToId;
      await pass('POST', `/api/messages/threads/${id}`, out); return true;
    }
    if (method === 'DELETE') { const m = q('message'); if (!DOC.test(m)) { fail(400, 'Некорректное сообщение'); return true; } await pass('DELETE', `/api/messages/threads/${id}?message=${encodeURIComponent(m)}`); return true; }
  }
  fail(404, 'Нет такого адреса'); return true;
}
export { call as siteCall, status as siteStatus, mode as siteMode };
