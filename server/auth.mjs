// Who is using VIT: a VITON ID account (same sign-in the site uses) or a local profile that never leaves this computer.
import crypto from 'node:crypto';
import { one, run, now } from './db.mjs';

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
  run('INSERT INTO users (id, kind, email, name, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name', id, kind, email, name, now());
  return one('SELECT * FROM users WHERE id = ?', id);
}

export function signInLocal(name) {
  const clean = String(name || '').trim().slice(0, 40); if (!clean) throw userError('Как к вам обращаться?');
  const user = one("SELECT * FROM users WHERE kind = 'local'") ? upsert(one("SELECT id FROM users WHERE kind = 'local'").id, 'local', '', clean) : upsert('local-' + crypto.randomBytes(6).toString('hex'), 'local', '', clean);
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
  return { user, token: session(user) };
}

export function userByToken(token) { if (!token) return null; const s = one('SELECT user FROM sessions WHERE token = ?', token); return s ? one('SELECT * FROM users WHERE id = ?', s.user) : null; }
export function signOut(token) { run('DELETE FROM sessions WHERE token = ?', token); }
