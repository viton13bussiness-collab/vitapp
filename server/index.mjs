// VIT server: the brain behind the app. Serves the interface and a small JSON API on this computer only.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOST, PORT, WEB, WORK, VERSION } from './config.mjs';
import { all, one, run, now, getSetting, setSetting } from './db.mjs';
import { signInLocal, signInViton, signOut, userByToken } from './auth.mjs';
import { handle, pulse, jobShape } from './agent.mjs';
import { graph, forget, forgetAll, CATS } from './memory.mjs';
import { status as modelStatus, test as modelTest } from './ladder.mjs';
import { AGENTS } from './agents.mjs';
import { listRequests, allRequests, createRequest, updateRequest, onRequest, teamChannel, STATUS } from './team.mjs';
import { transcribe, voiceStatus } from './voice.mjs';

// Worlds of the ecosystem (journal, store, medicine, hub…) plug in as files in server/worlds/*.mjs, each exporting handle(ctx) → true when it answered.
const worlds = [];
{ const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'worlds');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort() : []) { try { const m = await import(pathToFileURL(path.join(dir, f)).href); if (typeof m.handle === 'function') worlds.push(m.handle); } catch (e) { console.error(`[world ${f}]`, e.message); } } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8' };
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const fail = (res, code, message) => json(res, code, { ok: false, message });
const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const COOKIE = `vit${PORT === 5313 ? '' : PORT}`;
const setCookie = (res, token) => res.setHeader('set-cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 31536000 : 0}`);
async function raw(req, limit) { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('Слишком большой запрос'), { http: 413 }); chunks.push(c); } return Buffer.concat(chunks); }
async function body(req) { const b = await raw(req, 1e6); if (!b.length) return {}; try { return JSON.parse(b.toString('utf8')); } catch { throw Object.assign(new Error('Некорректный запрос'), { http: 400 }); } }
const pubUser = (u) => u && { id: u.id, kind: u.kind, name: u.name, email: u.email };

function serve(res, file, extra = {}) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', ...extra }); res.end(data);
  });
}
function sse(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  const send = (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
  return send;
}
function currentConv(user) {
  const c = one('SELECT * FROM convs WHERE user = ? ORDER BY updated DESC LIMIT 1', user.id); if (c) return c;
  const id = Number(run('INSERT INTO convs (user, title, created, updated) VALUES (?, ?, ?, ?)', user.id, '', now(), now()).lastInsertRowid); return one('SELECT * FROM convs WHERE id = ?', id);
}
const messages = (convId) => all('SELECT id, role, content, meta, created FROM msgs WHERE conv = ? ORDER BY id', convId).map((m) => ({ ...m, meta: JSON.parse(m.meta || '{}') }));
const ownConv = (user, id) => one('SELECT * FROM convs WHERE id = ? AND user = ?', Number(id), user.id);

const feeds = new Set();            // live channels of the open app windows
onRequest((r) => { for (const f of feeds) if (f.user === r.user || f.team) f.send({ type: 'request', request: r }); });

async function api(req, res, url, user, token) {
  const p = url.pathname, m = req.method, seg = p.split('/').filter(Boolean);            // ['api', …]
  if (p === '/api/health') return json(res, 200, { ok: true, version: VERSION });
  if (p === '/api/auth/local' && m === 'POST') { const b = await body(req); const s = signInLocal(b.name); setCookie(res, s.token); return json(res, 200, { ok: true, me: pubUser(s.user) }); }
  if (p === '/api/auth/viton' && m === 'POST') { const b = await body(req); if (!b.email || !b.password) return fail(res, 400, 'Введите почту и пароль'); const s = await signInViton(b.email, b.password); setCookie(res, s.token); return json(res, 200, { ok: true, me: pubUser(s.user) }); }
  if (p === '/api/auth/logout' && m === 'POST') { signOut(token); setCookie(res, ''); return json(res, 200, { ok: true }); }
  if (p === '/api/me') return json(res, 200, { ok: true, me: pubUser(user), version: VERSION });
  if (!user) return fail(res, 401, 'Войдите в VIT');

  if (p === '/api/state') { const conv = currentConv(user); return json(res, 200, { ok: true, me: pubUser(user), conv: conv.id, messages: messages(conv.id), cats: CATS, agents: AGENTS.map(({ id, name, color, about }) => ({ id, name, color, about })), voice: voiceStatus(), speak: getSetting('speak', 'voice'), theme: getSetting('theme:' + user.id, ''), version: VERSION }); }
  if (p === '/api/convs' && m === 'GET') return json(res, 200, { ok: true, items: all("SELECT id, title, updated FROM convs WHERE user = ? AND title != '' ORDER BY updated DESC LIMIT 40", user.id) });
  if (p === '/api/convs' && m === 'POST') { const id = Number(run('INSERT INTO convs (user, title, created, updated) VALUES (?, ?, ?, ?)', user.id, '', now(), now()).lastInsertRowid); return json(res, 200, { ok: true, conv: id, messages: [] }); }
  if (seg[1] === 'convs' && seg[2] && m === 'GET') { const c = ownConv(user, seg[2]); if (!c) return fail(res, 404, 'Диалог не найден'); run('UPDATE convs SET updated = ? WHERE id = ?', now(), c.id); return json(res, 200, { ok: true, conv: c.id, messages: messages(c.id) }); }

  if (p === '/api/chat' && m === 'POST') {
    const b = await body(req), c = ownConv(user, b.conv); if (!c) return fail(res, 404, 'Диалог не найден'); if (!String(b.text || '').trim()) return fail(res, 400, 'Пустое сообщение');
    const send = sse(req, res), ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try { await handle({ user, convId: c.id, text: b.text, emit: send, signal: ac.signal }); }
    catch (e) { if (!ac.signal.aborted) send({ type: 'error', message: e.code ? e.message : 'Что-то пошло не так. Попробуйте ещё раз.' }); if (!e.code && !ac.signal.aborted) console.error('[chat]', e); }
    send({ type: 'done' }); return res.end();
  }
  if (p === '/api/pulse') { try { return json(res, 200, { ok: true, message: await pulse(user, currentConv(user).id) }); } catch { return json(res, 200, { ok: true, message: null }); } }
  if (p === '/api/events') { const send = sse(req, res), f = { user: user.id, team: url.searchParams.get('team') === '1', send }; feeds.add(f); send({ type: 'hello' }); const beat = setInterval(() => res.write(': ping\n\n'), 25000); return req.on('close', () => { clearInterval(beat); feeds.delete(f); }); }

  if (p === '/api/memory' && m === 'GET') return json(res, 200, { ok: true, ...graph(user.id) });
  if (p === '/api/memory' && m === 'DELETE') { forgetAll(user.id); return json(res, 200, { ok: true }); }
  if (seg[1] === 'memory' && seg[2] && m === 'DELETE') return json(res, 200, { ok: forget(user.id, Number(seg[2])) });

  if (p === '/api/jobs') return json(res, 200, { ok: true, items: all('SELECT * FROM jobs WHERE user = ? ORDER BY id DESC LIMIT 60', user.id).map(jobShape) });
  if (p === '/api/requests' && m === 'GET') return json(res, 200, { ok: true, items: listRequests(user.id), channel: teamChannel() });
  if (p === '/api/requests' && m === 'POST') { const b = await body(req); if (!String(b.title || '').trim()) return fail(res, 400, 'Нет названия заявки'); return json(res, 200, { ok: true, request: await createRequest(user, b.title, b.detail), channel: teamChannel() }); }
  if (p === '/api/team/requests' && m === 'GET') return json(res, 200, { ok: true, items: allRequests(), statuses: STATUS });
  if (seg[1] === 'team' && seg[2] === 'requests' && seg[3] && m === 'POST') { const b = await body(req), r = updateRequest(Number(seg[3]), b.status, b.note); return r ? json(res, 200, { ok: true, request: r }) : fail(res, 400, 'Не получилось обновить заявку'); }

  if (p === '/api/models' && m === 'GET') return json(res, 200, { ok: true, items: await modelStatus(), policy: getSetting('policy', 'eco') });
  if (p === '/api/models' && m === 'POST') {
    const b = await body(req), s = getSetting('models', {});
    if (b.policy && ['eco', 'balanced', 'cloud'].includes(b.policy)) setSetting('policy', b.policy);
    if (b.id && ['local', 'anthropic', 'comet', 'openai'].includes(b.id)) { const cur = { ...(s[b.id] || {}) };
      for (const k of ['key', 'model', 'base', 'url']) if (typeof b[k] === 'string') { if (b[k].trim()) cur[k] = b[k].trim().slice(0, 400); else delete cur[k]; }
      if (typeof b.on === 'boolean') cur.on = b.on; s[b.id] = cur; setSetting('models', s); }
    return json(res, 200, { ok: true, items: await modelStatus(), policy: getSetting('policy', 'eco') });
  }
  if (p === '/api/models/test' && m === 'POST') { const b = await body(req); return json(res, 200, { ok: true, result: await modelTest(b.id), items: await modelStatus() }); }

  if (p === '/api/settings' && m === 'GET') { const tg = getSetting('telegram', {}); return json(res, 200, { ok: true, proactive: getSetting('proactive', true), speak: getSetting('speak', 'voice'), telegram: { set: teamChannel(), chat: tg.chat || process.env.TELEGRAM_CHAT_ID || '' }, voice: voiceStatus(), version: VERSION,
    stats: { messages: one('SELECT COUNT(*) AS n FROM msgs m JOIN convs c ON c.id = m.conv WHERE c.user = ?', user.id).n, nodes: one('SELECT COUNT(*) AS n FROM nodes WHERE user = ?', user.id).n, jobs: one('SELECT COUNT(*) AS n FROM jobs WHERE user = ?', user.id).n } }); }
  if (p === '/api/settings' && m === 'POST') { const b = await body(req);
    if (typeof b.proactive === 'boolean') setSetting('proactive', b.proactive);
    if (['always', 'voice', 'never'].includes(b.speak)) setSetting('speak', b.speak);
    if (['spatial', 'ribbon', 'axon', 'aurora', 'horizon'].includes(b.theme)) setSetting('theme:' + user.id, b.theme);
    if (b.telegram && typeof b.telegram === 'object') { const cur = getSetting('telegram', {}); if (typeof b.telegram.token === 'string') cur.token = b.telegram.token.trim().slice(0, 200); if (typeof b.telegram.chat === 'string') cur.chat = b.telegram.chat.trim().slice(0, 60); setSetting('telegram', cur); }
    return json(res, 200, { ok: true }); }

  if (p === '/api/stt' && m === 'POST') { try { const text = await transcribe(await raw(req, 25e6)); return json(res, 200, { ok: true, text }); } catch (e) { return fail(res, e.code === 'NO_STT' ? 501 : 500, e.code === 'NO_STT' ? e.message : 'Не получилось распознать речь'); } }

  if (p === '/api/export') { const convs = all('SELECT * FROM convs WHERE user = ?', user.id);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="vit-export-${new Date().toISOString().slice(0, 10)}.json"` });
    return res.end(JSON.stringify({ exported: new Date().toISOString(), profile: pubUser(user), conversations: convs.map((c) => ({ ...c, messages: messages(c.id) })), memory: graph(user.id), jobs: all('SELECT * FROM jobs WHERE user = ?', user.id).map(jobShape), requests: listRequests(user.id) }, null, 2)); }
  if (p === '/api/data' && m === 'DELETE') { forgetAll(user.id); for (const c of all('SELECT id FROM convs WHERE user = ?', user.id)) run('DELETE FROM msgs WHERE conv = ?', c.id);
    for (const j of all('SELECT id FROM jobs WHERE user = ?', user.id)) fs.rmSync(path.join(WORK, `job-${j.id}`), { recursive: true, force: true });
    run('DELETE FROM convs WHERE user = ?', user.id); run('DELETE FROM jobs WHERE user = ?', user.id); run('DELETE FROM requests WHERE user = ?', user.id); return json(res, 200, { ok: true }); }
  for (const w of worlds) if (await w({ req, res, url, user, seg, method: m, json: (code, o) => json(res, code, o), fail: (code, msg) => fail(res, code, msg), body: () => body(req) })) return;
  return fail(res, 404, 'Нет такого адреса');
}

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (HOST === '127.0.0.1' && !LOCAL_HOST.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }                      // DNS rebinding
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { res.writeHead(403); return res.end(); }   // cross-site writes
    const token = cookie(req)[COOKIE] || '', user = userByToken(token);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, user, token);
    if (url.pathname.startsWith('/workspace/')) {                                     // what the agents produced; pages open sandboxed
      const [, , jobDir, name] = url.pathname.split('/'), id = Number(String(jobDir || '').replace('job-', ''));
      if (!user || !one('SELECT id FROM jobs WHERE id = ? AND user = ?', id, user.id) || !/^[\w.-]+$/.test(name || '')) { res.writeHead(404); return res.end(); }
      return serve(res, path.join(WORK, `job-${id}`, name), { 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: https:" });
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname === '/team' ? 'team.html' : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '');
    const file = path.join(WEB, rel); if (!file.startsWith(WEB)) { res.writeHead(403); return res.end(); }
    serve(res, file);
  } catch (e) {
    const known = e.http || e.user;
    if (!res.headersSent) fail(res, e.http || (e.user ? 400 : 500), known ? e.message : 'Ошибка сервера'); else res.end();
    if (!known) console.error(e);
  }
});

export function start(port = PORT) {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, HOST, () => { console.log(`VITON13 ${VERSION} · http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}`); resolve(port); }); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start().catch((e) => { console.error(e.code === 'EADDRINUSE' ? `Порт ${PORT} занят. Задайте другой: VIT_PORT=5314 npm start` : e); process.exit(1); });
