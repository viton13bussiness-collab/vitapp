// How calls get through strict networks. STUN finds a direct path for most people; for the 10–20% behind strict NATs a TURN
// relay carries the media. Your own TURN account (VIT_TURN_URL / VIT_TURN_USER / VIT_TURN_PASS in .env) comes first.
// Without it, Metered's free «Open Relay» is used through its static auth: the shared secret is published openly on
// https://www.metered.ca/tools/openrelay/ for anyone, so no account is needed. Credentials follow the TURN REST convention
// (coturn use-auth-secret): username = "<expiry>:<id>", password = base64(HMAC-SHA1(secret, username)), valid for 24 hours.
// The free relay is shared by everyone who uses it (20 GB a month in total) — good as a safety net, not a guarantee.
import crypto from 'node:crypto';

const OPEN_RELAY = { host: 'staticauth.openrelay.metered.ca', secret: 'openrelayprojectsecret' };
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

export function iceServers() {
  const own = String(process.env.VIT_TURN_URL || '').trim();
  if (/^turns?:/.test(own)) return [...STUN, { urls: own.split(',').map((s) => s.trim()).filter(Boolean), username: process.env.VIT_TURN_USER || '', credential: process.env.VIT_TURN_PASS || '' }];
  if (process.env.VIT_TURN === 'off') return STUN;
  const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:viton13`;
  const credential = crypto.createHmac('sha1', OPEN_RELAY.secret).update(username).digest('base64');
  const h = OPEN_RELAY.host;
  return [...STUN, { urls: [`turn:${h}:80`, `turn:${h}:80?transport=tcp`, `turn:${h}:443?transport=tcp`, `turns:${h}:443?transport=tcp`], username, credential }];
}
