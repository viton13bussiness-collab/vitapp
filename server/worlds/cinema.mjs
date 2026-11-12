// Кинотеатр: screenings with tickets and seats, the film and the viewers' cameras going straight between devices.
//
// viton13.com keeps the screening (settings, tickets, who sits where) and introduces the devices — the meeting rooms
// API with kind «cinema» (site-patch/rtc). This file is the narrow bridge to it through the site session the
// messenger holds, plus one local service: the film proxy. A film drawn on the 3D screen is a WebGL texture, and a
// texture may only come from a page's own origin; most video hosts send no CORS headers, so the film is streamed
// through this local server (byte ranges kept, public https addresses only).
import dns from 'node:dns/promises';
import net from 'node:net';
import { siteCall, siteStatus, siteMode, SITE } from './messages.mjs';

const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/, KEY = /^[A-Z0-9]{4}$/, MEMBER = /^[A-Za-z0-9_-]{1,128}$/, CURSOR = /^[0-9TZ:.#a-z-]{10,40}$/, SEAT = /^R\d{1,2}S\d{1,2}$/;
const TYPES = new Set(['offer', 'answer', 'candidate', 'bye']);
const CODES = {
  VITON_ID_REQUIRED: 'Войдите в VITON ID на viton13.com', ROOM_NOT_FOUND: 'Сеанс не найден, закончился или отменён', ROOM_FULL: 'В зале уже двенадцать человек',
  NOT_A_MEMBER: 'Вы не в зале', PERSON_NOT_IN_ROOM: 'Этот зритель уже вышел', TOO_MANY_REQUESTS: 'Слишком часто. Подождите немного', PAYLOAD_TOO_LARGE: 'Слишком большое сообщение',
  RTC_NOT_CONFIGURED: 'Кинотеатр на viton13.com ещё не включён', RTC_UNAVAILABLE: 'Сервис кинотеатра сейчас недоступен', CROSS_ORIGIN_REQUEST: 'Сайт не принял запрос', ORIGIN_REQUIRED: 'Сайт не принял запрос',
  TITLE_REQUIRED: 'Назовите сеанс', INVALID_FILM: 'Нужна ссылка на видеофайл (.mp4 / .webm) или на YouTube', INVALID_TIME: 'Время сеанса — от сегодня и не дальше двух месяцев', INVALID_HALL: 'Зал — от 3 до 8 рядов и от 6 до 12 мест',
  HOST_ONLY: 'Это может только тот, кто создал сеанс', NOT_ADMITTED: 'Сначала нужен билет', TICKET_NOT_FOUND: 'Такого билета нет', TICKET_USED: 'По этому билету уже вошли',
  SEAT_TAKEN: 'Это место уже занято', SEAT_RESERVED: 'Это место по чужому билету', SEAT_ASSIGNED: 'По билету у вас другое место', HALL_FULL: 'В зале уже двенадцать человек',
  SEAT_HAS_TICKET: 'На это место уже есть билет', TOO_MANY_TICKETS: 'Билетов на сеанс — до шестидесяти', HALL_TOO_SMALL: 'В новом зале не поместятся те, кто уже сидит', INVALID_SEAT: 'Такого места нет',
  NO_SEAT: 'Сначала выберите место', INVALID_REQUEST: 'Некорректный запрос',
};

function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
  const url = String(process.env.VIT_TURN_URL || '').trim();
  if (/^turns?:/.test(url)) list.push({ urls: url.split(',').map((s) => s.trim()).filter(Boolean), username: process.env.VIT_TURN_USER || '', credential: process.env.VIT_TURN_PASS || '' });
  return list;
}

// ── the film proxy ──────────────────────────────────────────────────────────
const devSite = (() => { try { const u = new URL(SITE); return /^(www\.)?viton13\.com$/.test(u.hostname) ? null : u.origin; } catch { return null; } })();
function privateAddress(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
}
async function allowedFilm(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (devSite && u.origin === devSite) return u;                                    // the development stand-in of the site
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (net.isIP(u.hostname)) return privateAddress(u.hostname) ? null : u;
  try { const addrs = await dns.lookup(u.hostname, { all: true }); return addrs.length && addrs.every((a) => !privateAddress(a.address)) ? u : null; } catch { return null; }
}
async function film(req, res, url) {
  let target = await allowedFilm(String(url.searchParams.get('u') || ''));
  if (!target) { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Ссылка на фильм не подходит'); }
  const headers = { 'user-agent': 'VITON13/0.3' }; if (req.headers.range) headers.range = req.headers.range;
  let r;
  for (let hop = 0; hop < 4; hop++) {                                               // follow redirects, re-checking each address
    try { r = await fetch(target, { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) }); } catch { res.writeHead(502); return res.end(); }
    if (r.status < 300 || r.status >= 400) break;
    const next = await allowedFilm(new URL(r.headers.get('location') || '', target).href); if (!next) { res.writeHead(502); return res.end(); } target = next;
  }
  const type = r.headers.get('content-type') || '';
  if (r.status >= 400 || !(/^(video|audio)\//.test(type) || /octet-stream/.test(type))) { res.writeHead(r.status >= 400 ? r.status : 415, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('По ссылке не видеофайл'); }
  const out = { 'content-type': type.startsWith('application/') ? 'video/mp4' : type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  for (const k of ['content-length', 'content-range']) { const v = r.headers.get(k); if (v) out[k] = v; }
  res.writeHead(r.status, out);
  const reader = r.body.getReader(); req.on('close', () => reader.cancel().catch(() => {}));
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; if (!res.write(value)) await new Promise((ok) => res.once('drain', ok)); } } catch { /* the viewer seeked away */ }
  res.end();
}

export async function handle({ req, res, url, user, seg, method, json, fail, body }) {
  if (seg[1] !== 'cinema') return false;
  if ((user.plan || 'guest') === 'guest') { json(402, { ok: false, code: 'subscribe', message: 'Кинотеатр доступен с VITON ID' }); return true; }
  const what = seg[2] || '';
  if (what === 'film' && method === 'GET') { await film(req, res, url); return true; }
  if (what === 'status' && method === 'GET') { const st = await siteStatus(user); json(200, { ok: true, ...st, ice: iceServers(), relay: iceServers().some((s) => String(s.urls).startsWith('turn')) }); return true; }
  if (siteMode === 'none') { fail(409, 'Кинотеатр работает в окне приложения VITON13'); return true; }

  const pass = async (m, path, b, ok = 200) => {
    const r = await siteCall(user, m, path, b);
    if (r.status === 0) return fail(503, 'viton13.com сейчас не отвечает');
    if (r.status === 401) return json(401, { ok: false, code: 'signin', message: CODES.VITON_ID_REQUIRED });
    if (r.status === 404 && (!r.data || r.data.code === 'NOT_FOUND' || !r.data.code)) return json(501, { ok: false, code: 'no_cinema', message: 'На viton13.com ещё нет кинотеатра' });
    if (r.status >= 400 || !r.data?.ok) return json(r.status >= 400 ? r.status : 502, { ok: false, code: r.data?.code || 'site', message: CODES[r.data?.code] || 'Сайт не смог выполнить запрос' });
    json(ok, r.data);
  };
  const clean = (b) => ({ title: String(b.title || '').slice(0, 80), film: { kind: String(b.film?.kind || 'video').slice(0, 10), src: String(b.film?.src || '').slice(0, 600) }, startsAt: String(b.startsAt || '').slice(0, 40),
    rows: Number(b.rows) || 0, cols: Number(b.cols) || 0, seating: b.seating === 'assigned' ? 'assigned' : 'open', note: String(b.note || '').slice(0, 200), ...(typeof b.cancelled === 'boolean' ? { cancelled: b.cancelled } : {}) });
  const seats = (list) => (Array.isArray(list) ? list.map(String).filter((s) => SEAT.test(s)).slice(0, 96) : []);

  if (what === 'mine' && method === 'GET') { await pass('GET', '/api/rtc/cinema/mine'); return true; }
  if (what === 'redeem' && method === 'POST') { const b = await body(); await pass('POST', '/api/rtc/cinema/redeem', { ticket: String(b.ticket || '').slice(0, 20) }); return true; }
  if (what === 'screenings' && !seg[3] && method === 'POST') {
    const b = await body(), t = b.tickets || {};
    await pass('POST', '/api/rtc/rooms', { kind: 'cinema', screening: clean(b.screening || {}), tickets: { count: Math.max(0, Math.min(Number(t.count) || 0, 30)), seats: seats(t.seats), uses: Math.max(1, Math.min(Number(t.uses) || 1, 12)) } }, 201); return true;
  }
  if (what === 'screenings' && seg[3]) {
    const code = String(seg[3]).toUpperCase(); if (!CODE.test(code)) { fail(404, CODES.ROOM_NOT_FOUND); return true; }
    const base = `/api/rtc/rooms/${code}`;
    if (!seg[4] && method === 'GET') { await pass('GET', base); return true; }
    if (!seg[4] && method === 'PATCH') { await pass('PATCH', base, clean(await body())); return true; }
    if (seg[4] === 'tickets' && method === 'POST') { const b = await body(); await pass('POST', base + '/tickets', { count: Math.max(1, Math.min(Number(b.count) || 1, 30)), seats: seats(b.seats), uses: Math.max(1, Math.min(Number(b.uses) || 1, 12)), label: String(b.label || '').slice(0, 40) }); return true; }
    if (seg[4] === 'tickets' && seg[5] && method === 'DELETE') { const key = String(seg[5]).toUpperCase(); if (!KEY.test(key)) { fail(404, CODES.TICKET_NOT_FOUND); return true; } await pass('DELETE', `${base}/tickets?t=${key}`); return true; }
    if (seg[4] === 'seat' && method === 'POST') { const b = await body(), seat = b.seat == null ? null : String(b.seat); if (seat && !SEAT.test(seat)) { fail(400, CODES.INVALID_SEAT); return true; } await pass('POST', base + '/seat', { seat }); return true; }
    if (seg[4] === 'kick' && method === 'POST') { const b = await body(), uid = String(b.uid || ''); if (!MEMBER.test(uid)) { fail(400, CODES.INVALID_REQUEST); return true; } await pass('POST', base + '/kick', { uid }); return true; }
    if (seg[4] === 'presence' && method === 'POST') { const b = await body(), action = String(b.action || ''); if (!['join', 'heartbeat', 'leave'].includes(action)) { fail(400, CODES.INVALID_REQUEST); return true; } await pass('POST', base + '/presence', { action }); return true; }
    if (seg[4] === 'signal' && method === 'POST') {
      const b = await body(), to = String(b.to || ''), type = String(b.type || ''), data = typeof b.data === 'string' ? b.data : JSON.stringify(b.data ?? null);
      if (!MEMBER.test(to) || !TYPES.has(type)) { fail(400, CODES.INVALID_REQUEST); return true; }
      if (data.length > 24000) { fail(413, CODES.PAYLOAD_TOO_LARGE); return true; }
      await pass('POST', base + '/signal', { to, type, data }); return true;
    }
    if (seg[4] === 'signal' && method === 'GET') {
      const p = new URLSearchParams(), since = String(url.searchParams.get('since') || '');
      if (CURSOR.test(since)) p.set('since', since); if (url.searchParams.get('members') === '1') p.set('members', '1');
      await pass('GET', `${base}/signal${p.size ? '?' + p : ''}`); return true;
    }
  }
  fail(404, 'Нет такого адреса'); return true;
}
