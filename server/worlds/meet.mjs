// Встречи: video meetings and films watched together.
//
// Video and sound go straight between the participants (WebRTC, peer to peer); nothing of it passes here or through
// the site. viton13.com only introduces the devices to each other: a room, and a small inbox where they leave their
// connection offers (/api/rtc/* on the site — see site-patch/rtc). This file is the narrow bridge to those routes,
// reusing the site session the messenger already holds (server/worlds/messages.mjs).
import { siteCall, siteStatus, siteMode } from './messages.mjs';
import { can } from '../plan.mjs';

const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/, MEMBER = /^[A-Za-z0-9_-]{1,128}$/, CURSOR = /^[0-9TZ:.#a-z-]{10,40}$/;
const TYPES = new Set(['offer', 'answer', 'candidate', 'bye']);
const CODES = {
  VITON_ID_REQUIRED: 'Войдите в VITON ID на viton13.com', ROOM_NOT_FOUND: 'Встреча не найдена или уже закончилась', ROOM_FULL: 'Во встрече уже шесть человек',
  NOT_A_MEMBER: 'Вы не во встрече', PERSON_NOT_IN_ROOM: 'Этот человек уже вышел', TOO_MANY_REQUESTS: 'Слишком часто. Подождите немного', PAYLOAD_TOO_LARGE: 'Слишком большое сообщение',
  RTC_REJOIN: 'Переподключаемся к встрече…', RTC_NOT_CONFIGURED: 'Встречи на viton13.com ещё не включены', RTC_UNAVAILABLE: 'Сервис встреч сейчас недоступен', CROSS_ORIGIN_REQUEST: 'Сайт не принял запрос', ORIGIN_REQUIRED: 'Сайт не принял запрос',
};

/** STUN is free and public; a relay (TURN) helps the networks STUN can't cross and is added only when configured. */
function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
  const url = String(process.env.VIT_TURN_URL || '').trim();
  if (/^turns?:/.test(url)) list.push({ urls: url.split(',').map((s) => s.trim()).filter(Boolean), username: process.env.VIT_TURN_USER || '', credential: process.env.VIT_TURN_PASS || '' });
  return list;
}

export async function handle({ url, user, seg, method, json, fail, body }) {
  if (seg[1] !== 'meet') return false;
  if (!can(user, 'meet')) { json(402, { ok: false, code: 'subscribe', message: 'Встречи недоступны на вашем уровне — посмотрите «Что входит»' }); return true; }
  const what = seg[2] || '';

  if (what === 'status' && method === 'GET') { const st = await siteStatus(user); json(200, { ok: true, ...st, ice: iceServers(), relay: iceServers().some((s) => String(s.urls).startsWith('turn')) }); return true; }
  if (siteMode === 'none') { fail(409, 'Встречи работают в окне приложения VITON13'); return true; }

  // the site answers; a 404 on the rooms path means the site doesn't have rooms yet
  const pass = async (m, path, b, ok = 200) => {
    const r = await siteCall(user, m, path, b);
    if (r.status === 0) return fail(503, 'viton13.com сейчас не отвечает');
    if (r.status === 401) return json(401, { ok: false, code: 'signin', message: CODES.VITON_ID_REQUIRED });
    if (r.status === 404 && (!r.data || r.data.code === 'NOT_FOUND' || !r.data.code)) return json(501, { ok: false, code: 'no_rooms', message: 'На viton13.com ещё нет комнат для встреч' });
    if (r.status >= 400 || !r.data?.ok) return json(r.status >= 400 ? r.status : 502, { ok: false, code: r.data?.code || 'site', message: CODES[r.data?.code] || 'Сайт не смог выполнить запрос' });
    json(ok, r.data);
  };

  if (what === 'rooms' && !seg[3] && method === 'POST') { const b = await body(); await pass('POST', '/api/rtc/rooms', { title: String(b.title || '').trim().slice(0, 80) }); return true; }
  if (what === 'rooms' && seg[3]) {
    const code = String(seg[3]).toUpperCase(); if (!CODE.test(code)) { fail(404, CODES.ROOM_NOT_FOUND); return true; }
    const base = `/api/rtc/rooms/${code}`;
    if (!seg[4] && method === 'GET') { await pass('GET', base); return true; }
    if (seg[4] === 'presence' && method === 'POST') { const b = await body(), action = String(b.action || ''); if (!['join', 'heartbeat', 'leave'].includes(action)) { fail(400, 'Некорректный запрос'); return true; } await pass('POST', base + '/presence', { action }); return true; }
    if (seg[4] === 'signal' && method === 'POST') {
      const b = await body(), to = String(b.to || ''), type = String(b.type || ''), data = typeof b.data === 'string' ? b.data : JSON.stringify(b.data ?? null);
      if (!MEMBER.test(to) || !TYPES.has(type)) { fail(400, 'Некорректный запрос'); return true; }
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
