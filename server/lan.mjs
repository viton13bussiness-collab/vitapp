// VITON13 on the iPhone: the Mac's server also answers on the home Wi‑Fi address, but only to devices paired by a
// one-time code from a QR shown on the Mac. Off by default; the guest sign-in and the team console stay on the Mac.
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { all, one, run, db, now, getSetting, setSetting } from './db.mjs';

db.exec('CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, user TEXT, token TEXT UNIQUE, name TEXT, ip TEXT, created INTEGER, seen INTEGER)');

const CODE_TTL = Number(process.env.VIT_PAIR_TTL_MS) || 10 * 60e3;          // a code lives 10 minutes
const codes = new Map();                 // code → { user, exp }
const tries = new Map();                 // ip → { n, until } — failed claims
let lanServer = null, bound = null, handler = null, basePort = 0;

/** The Mac's address on the home network: the first private IPv4 of en0/en1 (Wi‑Fi or Ethernet). */
export function lanIp() {
  const ifs = os.networkInterfaces();
  for (const name of ['en0', 'en1', 'en2', 'en3']) for (const a of ifs[name] || []) if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
  return null;
}
export const isLan = (req) => !!lanServer && req.socket?.server === lanServer;
export const lanHostOk = (req) => !!bound && req.headers.host === `${bound.ip}:${bound.port}`;
export const lanUrl = () => (bound ? `http://${bound.ip}:${bound.port}` : null);

function listen() {
  const ip = lanIp(); if (!ip) return Promise.resolve(null);
  if (bound?.ip === ip) return Promise.resolve(bound);
  return close().then(() => new Promise((resolve) => {
    const srv = http.createServer((req, res) => handler(req, res));
    srv.once('error', (e) => { console.error('[lan]', e.message); lanServer = null; bound = null; resolve(null); });
    srv.listen(basePort, ip, () => { lanServer = srv; bound = { ip, port: basePort }; console.log(`[lan] VITON13 по домашней сети: http://${ip}:${basePort}`); resolve(bound); });
  }));
}
function close() {
  if (!lanServer) return Promise.resolve();
  const s = lanServer; lanServer = null; bound = null; s.closeAllConnections?.();
  return new Promise((r) => s.close(() => r()));
}

/** Called once by the main server after it starts; reopens the home-network door if the person left it open. */
export async function initLan(h, port) { handler = h; basePort = port; if (getSetting('lan', false)) await listen(); }
export async function setLan(on) { setSetting('lan', !!on); if (on) await listen(); else { codes.clear(); await close(); } return lanState(); }
export async function lanState(user) {
  if (getSetting('lan', false) && lanIp() !== bound?.ip) await listen();             // the Wi‑Fi gave the Mac a new address
  return { on: !!getSetting('lan', false), url: lanUrl(), ip: lanIp(), port: basePort, devices: user ? devices(user.id) : [] };
}

// ── pairing ────────────────────────────────────────────────────────────────
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (n = 8) => Array.from(crypto.randomBytes(n), (b) => ALPHA[b % ALPHA.length]).join('');
export function newCode(user) {
  if (!bound) throw Object.assign(new Error('Сначала откройте доступ по домашней сети'), { http: 409 });
  for (const [c, v] of codes) if (v.exp < now() || v.user === user.id) codes.delete(c);            // one live code per person
  const code = randomCode(), url = `${lanUrl()}/pair?c=${code}`;
  codes.set(code, { user: user.id, exp: now() + CODE_TTL });
  return { code, url, exp: now() + CODE_TTL, svg: qrSvg(url) };
}
export function claim(code, ip, ua) {
  const t = tries.get(ip); if (t && t.until > now() && t.n >= 8) throw Object.assign(new Error('Слишком много попыток. Подождите 10 минут'), { http: 429 });
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), v = codes.get(c);
  if (!v || v.exp < now()) {
    const cur = t && t.until > now() ? t : { n: 0, until: now() + 10 * 60e3 }; cur.n++; tries.set(ip, cur);
    throw Object.assign(new Error('Код не подошёл или устарел. Покажите новый на Mac'), { http: 403 });
  }
  codes.delete(c); tries.delete(ip);                                                                // single use
  const token = crypto.randomBytes(32).toString('hex'), name = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'Устройство';
  run('INSERT INTO sessions (token, user, created) VALUES (?, ?, ?)', token, v.user, now());
  run('INSERT INTO devices (user, token, name, ip, created, seen) VALUES (?, ?, ?, ?, ?, ?)', v.user, token, name, ip, now(), now());
  return { token, user: v.user, name };
}
export const isDevice = (token) => { if (!token) return false; const d = one('SELECT id FROM devices WHERE token = ?', token); if (d) run('UPDATE devices SET seen = ? WHERE id = ?', now(), d.id); return !!d; };
export const devices = (user) => all('SELECT id, name, ip, created, seen FROM devices WHERE user = ? ORDER BY id', user);
export function unpair(user, id) {
  const d = one('SELECT * FROM devices WHERE id = ? AND user = ?', Number(id), user); if (!d) return false;
  run('DELETE FROM sessions WHERE token = ?', d.token); run('DELETE FROM devices WHERE id = ?', d.id); return true;
}
export function unpairToken(token) { const d = one('SELECT id FROM devices WHERE token = ?', token); if (d) run('DELETE FROM devices WHERE id = ?', d.id); }
/** A paired phone signed in with VITON ID: the device keeps its place, now under the new session and account. */
export function retoken(oldToken, newToken, user) { run('UPDATE devices SET token = ?, user = ?, seen = ? WHERE token = ?', newToken, user, now(), oldToken); run('DELETE FROM sessions WHERE token = ?', oldToken); }

// ── QR code (byte mode, versions 1–10, error correction M or L) — written for VITON13 after the public QR standard ──
const ECC = { M: { bits: 0, cw: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] }, L: { bits: 1, cw: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], blocks: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4] } };
const rawModules = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC[e].cw[v] * ECC[e].blocks[v];
const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gmul(root, 0x02); } return r; }
function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); } return r; }

export function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let ver = 0, ecl = 'M';
  for (const e of ['M', 'L']) { for (let v = 1; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v, e) * 8) { ver = v; ecl = e; break; } if (ver) break; }
  if (!ver) throw new Error('QR: text too long');
  const cap = dataCodewords(ver, ecl) * 8, bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // error correction, interleaved
  const nb = ECC[ecl].blocks[ver], el = ECC[ecl].cw[ver], raw = Math.floor(rawModules(ver) / 8), nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(el), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += d.length; const ec = rsRemainder(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(ec)); }
  const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
  // function patterns
  const size = ver * 4 + 17, mod = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    pos.forEach((a, i) => pos.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  }
  const format = (mask) => {
    const d = (ECC[ecl].bits << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i)); set(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = (ver << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
  // data, zig-zag from the bottom right
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v; if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; } } }
  // mask with the lowest penalty
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let y = 0; y < size; y++) for (const line of [mod[y], mod.map((r) => r[y])]) { let run = 1; for (let x = 1; x <= size; x++) { if (x < size && line[x] === line[x - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
    mod.forEach((r) => r.forEach((c) => { dark += c ? 1 : 0; })); p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, low = Infinity;
  for (let m = 0; m < 8; m++) { apply(m); format(m); const s = penalty(); if (s < low) { low = s; best = m; } apply(m); }
  apply(best); format(best);
  return mod;
}
export function qrSvg(text) {
  const m = qrMatrix(text), n = m.length, q = 4; let d = '';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + q * 2} ${n + q * 2}" shape-rendering="crispEdges" role="img" aria-label="QR-код для iPhone"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
