// Who is using VIT: a VITON ID account (same sign-in the site uses) or a local profile that never leaves this computer.
import crypto from 'node:crypto';
import { all, one, run, now, getSetting, setSetting } from './db.mjs';

const SITE = 'https://www.viton13.com';
const userError = (message) => Object.assign(new Error(message), { user: true });
let cfg = null;
async function firebaseKey() {
  if (cfg) return cfg;
  const r = await fetch(SITE + '/api/auth/firebase-config', { signal: AbortSignal.timeout(8000) }); const d = await r.json();
  if (!d?.ok || !d.config?.apiKey) throw userError('VITON ID сейчас недоступен'); return (cfg = d.config.apiKey);
}
const CODES = { INVALID_LOGIN_CREDENTIALS: 'Неверная почта или пароль', INVALID_PASSWORD: 'Неверная почта или пароль', EMAIL_NOT_FOUND: 'Неверная почта или пароль', INVALID_EMAIL: 'Проверьте адрес почты',
  USER_DISABLED: 'Аккаунт отключён', TOO_MANY_ATTEMPTS_TRY_LATER: 'Слишком много попыток. Попробуйте позже' };

function session(user) { const token = crypto.randomBytes(32).toString('hex'); run('INSERT INTO sessions (token, user, created) VALUES (?, ?, ?)', token, user.id, now()); return token; }
function upsert(id, kind, email, name) {
  run('INSERT INTO users (id, kind, email, name, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, email = excluded.email, name = excluded.name', id, kind, email, name, now());
  return one('SELECT * FROM users WHERE id = ?', id);
}

export function signInLocal(name) {
  const clean = String(name || '').trim().slice(0, 40) || 'Гость';
  const prev = one("SELECT id FROM users WHERE kind IN ('local', 'guest') ORDER BY created LIMIT 1");             // one guest profile per computer
  const user = upsert(prev ? prev.id : 'guest-' + crypto.randomBytes(6).toString('hex'), 'guest', '', clean);
  return { user, token: session(user) };
}

/** The password goes straight to the VITON ID sign-in service and is never stored. */
export async function signInViton(email, password) {
  const key = await firebaseKey();
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: String(email).trim(), password: String(password), returnSecureToken: true }), signal: AbortSignal.timeout(10000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw userError(CODES[String(d?.error?.message || '').split(' : ')[0]] || 'Не получилось войти. Попробуйте ещё раз');
  const name = d.displayName || String(d.email).split('@')[0];
  const user = upsert('viton-' + d.localId, 'viton', d.email, name);
  return { user, token: session(user), moved: adoptGuest(user.id) };
}

/** The first VITON ID sign-in on this computer takes over what the guest profile gathered: memory, conversations, works,
 *  requests, budget and the worlds' own tables — every table with a `user` column. Only into an account that is still empty here. */
export function adoptGuest(to) {
  const guest = one("SELECT id FROM users WHERE kind IN ('local', 'guest') ORDER BY created LIMIT 1"); if (!guest) return 0;
  const tables = all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name)
    .filter((t) => t !== 'sessions' && /^\w+$/.test(t) && all(`PRAGMA table_info(${t})`).some((c) => c.name === 'user'));
  if (tables.some((t) => one(`SELECT 1 AS x FROM ${t} WHERE user = ? LIMIT 1`, to))) return 0;
  let moved = 0;
  for (const t of tables) moved += Number(run(`UPDATE ${t} SET user = ? WHERE user = ?`, to, guest.id).changes || 0);
  const theme = getSetting('theme:' + guest.id, ''); if (theme) setSetting('theme:' + to, theme);
  if (moved) console.log(`[auth] guest profile → ${to}: ${moved} rows`);
  return moved;
}

export function userByToken(token) { if (!token) return null; const s = one('SELECT user FROM sessions WHERE token = ?', token); return s ? one('SELECT * FROM users WHERE id = ?', s.user) : null; }
export function signOut(token) { run('DELETE FROM sessions WHERE token = ?', token); }
