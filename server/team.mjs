// Requests to people. When a task needs a human, VIT hands it to the VITON13 team and the status comes back live.
import { all, one, run, now, getSetting } from './db.mjs';

export const STATUS = { new: 'Новая', accepted: 'Принята', working: 'В работе', done: 'Готово', cancelled: 'Отменена' };
const listeners = new Set();
export const onRequest = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const shape = (r) => r && { ...r, log: JSON.parse(r.log || '[]'), statusName: STATUS[r.status] };
const tell = (r) => { for (const fn of listeners) try { fn(r); } catch { /* listener gone */ } };

function telegram() { const s = getSetting('telegram', {}); return { token: s.token || process.env.TELEGRAM_BOT_TOKEN || '', chat: s.chat || process.env.TELEGRAM_CHAT_ID || '' }; }
export const teamChannel = () => { const t = telegram(); return !!(t.token && t.chat); };
async function notify(text) {
  const t = telegram(); if (!t.token || !t.chat) return false;
  try { const r = await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: t.chat, text }), signal: AbortSignal.timeout(8000) }); return r.ok; }
  catch { return false; }
}

export const listRequests = (user) => all('SELECT * FROM requests WHERE user = ? ORDER BY id DESC', user).map(shape);
export const allRequests = () => all('SELECT r.*, u.name AS userName FROM requests r LEFT JOIN users u ON u.id = r.user ORDER BY r.id DESC').map(shape);

export async function createRequest(user, title, detail) {
  const t = now(), log = [{ at: t, status: 'new', note: 'Заявка создана' }];
  const id = Number(run('INSERT INTO requests (user, title, detail, status, log, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)', user.id, String(title).slice(0, 140), String(detail || '').slice(0, 2000), 'new', JSON.stringify(log), t, t).lastInsertRowid);
  const sent = await notify(`VIT · новая заявка №${id}\n${title}\n\n${String(detail || '').slice(0, 800)}\n\nОт: ${user.name}${user.email ? ' · ' + user.email : ''}`);
  if (sent) run('UPDATE requests SET sent = 1 WHERE id = ?', id);
  const r = shape(one('SELECT * FROM requests WHERE id = ?', id)); tell(r); return r;
}

export function updateRequest(id, status, note = '') {
  const r = one('SELECT * FROM requests WHERE id = ?', id); if (!r || !STATUS[status]) return null;
  const log = JSON.parse(r.log || '[]'); log.push({ at: now(), status, note: String(note).slice(0, 400) || STATUS[status] });
  run('UPDATE requests SET status = ?, log = ?, updated = ? WHERE id = ?', status, JSON.stringify(log), now(), id);
  const out = shape(one('SELECT * FROM requests WHERE id = ?', id)); tell(out); return out;
}
