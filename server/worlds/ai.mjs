// «Нейросети» — an AI studio on this Mac: chat with any installed model, an arena of two models side by side, one-click text tools,
// macOS voices, speech recognition (the existing /api/stt), image description with a local vision model, and pictures from a prompt
// (the one outside service: Pollinations, free and keyless). Local models are free for everyone; Claude counts as the paid part.
// What people make stays as ordinary files: voice in ~/Documents/VITON13/Голос, pictures in ~/Pictures/VITON13.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { all, run, db, now } from '../db.mjs';
import { providers } from '../ladder.mjs';
import { voiceStatus } from '../voice.mjs';
import { can, vitBlocked } from '../plan.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS ai_msgs (id INTEGER PRIMARY KEY, user TEXT, role TEXT, content TEXT, model TEXT, ms INTEGER, created INTEGER);
CREATE INDEX IF NOT EXISTS ai_msgs_user ON ai_msgs (user, id);
CREATE TABLE IF NOT EXISTS ai_votes (id INTEGER PRIMARY KEY, user TEXT, a TEXT, b TEXT, winner TEXT, prompt TEXT, created INTEGER);`);

const MAX_TEXT = 5000, IMG_MAX = 15 * 1024 * 1024;
const VOICE_DIR = path.join(os.homedir(), 'Documents', 'VITON13', 'Голос');
const PIC_DIR = path.join(os.homedir(), 'Pictures', 'VITON13');
const DIRS = { voice: VOICE_DIR, image: PIC_DIR };
const FILE_RE = { voice: /\.(m4a|aiff)$/i, image: /\.(jpe?g|png|webp)$/i };
const MIME = { '.m4a': 'audio/mp4', '.aiff': 'audio/aiff', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const isEmbed = (n) => /embed|bge-|minilm/i.test(n);
const VISION_NAME = /vl\b|vl:|llava|vision|moondream|minicpm-v|bakllava|gemma3(?!n)|llama4|mistral-small3/i;
const clip = (s) => String(s ?? '').slice(0, MAX_TEXT);

// ── models ───────────────────────────────────────────────────────────────────
async function ollamaBase() { const P = await providers(); return P.find((p) => p.kind === 'ollama')?.url || 'http://127.0.0.1:11434'; }
let tagCache = { at: 0, items: [], up: false };
async function installed() {
  if (now() - tagCache.at < 8000) return tagCache;
  try {
    const r = await fetch((await ollamaBase()) + '/api/tags', { signal: AbortSignal.timeout(2500) }), d = await r.json();
    const base = await ollamaBase();
    tagCache = { at: now(), up: true, items: await Promise.all((d.models || []).map(async (m) => {
      const caps = m.capabilities || [], embed = caps.includes('embedding') || isEmbed(m.name), think = caps.includes('thinking');
      return { id: m.name, size: m.size || 0, params: m.details?.parameter_size || '', family: m.details?.family || '', embed,
        vision: caps.includes('vision') || (!caps.length && VISION_NAME.test(m.name)), think, reasoner: think && await alwaysThinks(base, m) };
    })) };
  } catch { tagCache = { at: now(), up: false, items: [] }; }
  return tagCache;
}
// Some builds only reason (Qwen3 «Thinking», R1, QwQ): asked not to think, they think out loud in the answer. Those run with thinking on,
// and the thinking streams separately so the answer stays clean. The model card says which build it is; the answer is kept per digest.
const showCache = new Map();
async function alwaysThinks(base, m) {
  if (/deepseek-r1|qwq|magistral|reasoning|thinking/i.test(m.name)) return true;
  const key = m.digest || m.name; if (showCache.has(key)) return showCache.get(key);
  let v = false;
  try { const r = await post(base + '/api/show', {}, { model: m.name }, AbortSignal.timeout(3000)), d = await r.json(), info = d.model_info || {};
    v = /thinking/i.test(`${info['general.finetune'] || ''} ${info['general.basename'] || ''} ${info['general.name'] || ''}`); showCache.set(key, v); } catch { /* ask again next time */ }
  return v;
}
async function cloudModels() {
  const c = (await providers()).find((p) => p.kind === 'anthropic');
  if (!c?.ready || !c.on) return [];
  return [{ id: 'cloud:haiku', name: 'Claude Haiku', model: c.model, key: c.key, base: c.base }, ...(c.top ? [{ id: 'cloud:opus', name: 'Claude Opus', model: c.top, key: c.key, base: c.base, effort: c.topEffort }] : [])];
}
const cloudOk = (user) => can(user, 'ai.cloud') && !vitBlocked(user);
/** Which engine answers for this model id: a local model by its Ollama name, or Claude when the plan allows it. */
async function resolve(user, id) {
  id = String(id || '');
  if (id.startsWith('cloud:')) {
    const m = (await cloudModels()).find((x) => x.id === id);
    if (!m) return { error: 'Облачная модель не подключена: ключ Claude добавляется в Настройках → Модели.' };
    if (!cloudOk(user)) return { error: 'Облачные модели входят в подписку VIT. Модели на этом Mac — бесплатно.', code: 'subscribe' };
    return { kind: 'anthropic', ...m };
  }
  const t = await installed(), m = t.items.find((x) => x.id === id && !x.embed);
  if (!m) return { error: t.up ? 'Такой модели нет на этом Mac.' : 'Ollama не запущена — откройте её, и модели появятся.' };
  return { kind: 'ollama', id: m.id, name: m.id, model: m.id, reasoner: m.reasoner, base: await ollamaBase() };
}

// ── streaming calls ──────────────────────────────────────────────────────────
async function* lines(res) {
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of res.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) yield l; } }
  if (buf.trim()) yield buf.trim();
}
const post = (url, headers, body, signal) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
const sig = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

/** Stream one reply. Thinking is off on hybrid local models (it would only make the playground slow); reasoning-only builds stream it to onThink; <think> tags are dropped. */
async function stream(eng, { messages, system = '', maxTokens = 900, images, onToken, onThink, signal }) {
  if (eng.kind === 'ollama') {
    const go = (think) => post(eng.base + '/api/chat', {}, { model: eng.model, stream: true, keep_alive: '10m', ...(think === null ? {} : { think }), options: { num_predict: maxTokens + (think ? 3000 : 0), num_ctx: 8192 },
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m, i) => (images && i === messages.length - 1 ? { ...m, images } : m))] }, sig(signal, 240000));
    let res = await go(!!eng.reasoner);
    if (!res.ok) { const body = await res.text(); if (/think/i.test(body)) res = await go(null); else throw Object.assign(new Error(body.slice(0, 200)), { status: res.status }); }
    if (!res.ok) throw Object.assign(new Error((await res.text()).slice(0, 200)), { status: res.status });
    let out = '', inThink = false;
    for await (const l of lines(res)) {
      const d = JSON.parse(l); if (d.error) throw new Error(d.error);
      if (d.message?.thinking) onThink?.(d.message.thinking);
      let t = d.message?.content || '';
      if (t.includes('<think>')) { inThink = true; t = t.split('<think>')[0]; }
      if (inThink) { const k = t.indexOf('</think>'); if (k < 0) continue; inThink = false; t = t.slice(k + 8); }
      if (t) { out += t; onToken(t); }
    }
    return out.trim();
  }
  // Claude: same shape as the ladder — room for thinking, low effort, usage written to the shared table so Settings shows the spend
  const opus = /opus|fable/.test(eng.model), t0 = now(), usage = { input: 0, output: 0 };
  const headers = { 'x-api-key': eng.key, 'anthropic-version': '2023-06-01', ...(opus ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}) };
  try {
    const res = await post(eng.base + '/messages', headers, { model: eng.model, max_tokens: maxTokens + (opus ? 6000 : 2500), stream: true, output_config: { effort: eng.effort || 'low' }, ...(opus ? { fallbacks: 'default' } : {}),
      system, messages }, sig(signal, opus ? 300000 : 120000));
    if (!res.ok) throw Object.assign(new Error('Claude: ' + res.status), { status: res.status });
    let out = '';
    for await (const l of lines(res)) { if (!l.startsWith('data:')) continue; let d; try { d = JSON.parse(l.slice(5)); } catch { continue; }
      if (d.type === 'error') throw new Error('Claude: ' + (d.error?.type || 'ошибка'));
      if (d.type === 'message_start') usage.input = d.message?.usage?.input_tokens || 0;
      if (d.type === 'message_delta') usage.output = d.usage?.output_tokens || usage.output;
      const t = d.type === 'content_block_delta' && d.delta?.type === 'text_delta' ? d.delta.text : ''; if (t) { out += t; onToken(t); } }
    run('INSERT INTO usage (provider, model, ms, ok, created, tin, tout) VALUES (?, ?, ?, 1, ?, ?, ?)', 'anthropic-ai', eng.model, now() - t0, now(), usage.input, usage.output);
    return out.trim();
  } catch (e) { run('INSERT INTO usage (provider, model, ms, ok, created) VALUES (?, ?, ?, 0, ?)', 'anthropic-ai', eng.model, now() - t0, now()); throw e; }
}
const humanError = (e) => (/fetch failed|ECONNREFUSED/.test(String(e?.cause?.code || e?.cause || e?.message)) ? 'Ollama не отвечает — запустите её и попробуйте ещё раз.'
  : e?.name === 'TimeoutError' ? 'Модель не ответила вовремя.' : e?.status === 404 ? 'Модель не найдена.' : e?.status === 401 ? 'Ключ Claude не принят.' : 'Модель не ответила. Попробуйте ещё раз.');

function sse(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  return { send: (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); }, signal: ac.signal, end: () => res.end() };
}

// ── tools ────────────────────────────────────────────────────────────────────
const TOOLS = {
  short: 'Сократи текст пользователя в 2–3 раза, сохранив главное и язык оригинала. Только результат, без вступлений.',
  translate: 'Переведи текст пользователя: если он на русском — на английский, иначе — на русский. Только перевод, без пояснений.',
  pretty: 'Перепиши текст пользователя красиво и ясно: живой язык, ровный ритм, без канцелярита и воды. Смысл и язык оригинала сохрани. Только результат.',
  threads: 'Сделай из текста пользователя пост для Threads: до 300 знаков, по-человечески, первая строка цепляет, без хештегов и эмодзи-гирлянд. Язык оригинала. Только пост.',
  fix: 'Исправь орфографию, пунктуацию и грамматику в тексте пользователя. Ничего не переписывай сверх ошибок. Только исправленный текст.',
  explain: 'Объясни текст или тему пользователя просто, как другу без специальных знаний: коротко, с одним примером из жизни. Отвечай на языке пользователя.',
  ideas: 'Дай ровно 10 коротких, разных и конкретных идей по теме пользователя — нумерованным списком, по одной строке. Отвечай на языке пользователя.',
};

// ── voice: macOS `say` ───────────────────────────────────────────────────────
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Grandma|Grandpa|Junior|Ralph|Fred|Kathy|Rocko)\b/;
let voiceCache = null;
function voices() {
  if (voiceCache) return voiceCache;
  voiceCache = new Promise((ok) => execFile('say', ['-v', '?'], { timeout: 8000, maxBuffer: 2e6 }, (e, out) => {
    const list = e ? [] : String(out).split('\n').map((l) => /^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/.exec(l)).filter(Boolean).map((m) => ({ name: m[1].trim(), lang: m[2] }));
    const rank = (v) => (/premium|улучш.*выс|высокого/i.test(v.name) ? 0 : /enhanced|улучш/i.test(v.name) ? 1 : /^(Milena|Samantha|Alex|Daniel|Ava|Zoe|Evan)\b/.test(v.name) ? 2 : 3);
    const pick = (re) => list.filter((v) => re.test(v.lang) && !NOVELTY.test(v.name)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    ok({ ru: pick(/^ru_/), en: [...pick(/^en_US/), ...pick(/^en_(GB|AU|IE|IN|ZA)/)] });
  }));
  return voiceCache;
}
const isRu = (t) => (t.match(/[а-яё]/gi) || []).length >= (t.match(/[a-z]/gi) || []).length * 0.5 && /[а-яё]/i.test(t);
const sh = (cmd, args, ms = 120000) => new Promise((ok, no) => execFile(cmd, args, { timeout: ms, maxBuffer: 4e6 }, (e, out) => (e ? no(e) : ok(out))));

/** A readable, safe file name: words from the text, no path characters, date in front. */
function fileName(text, ext) {
  const words = String(text).replace(/[^\p{L}\p{N} -]+/gu, ' ').trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 48).trim() || 'без названия';
  const d = new Date(), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.${String(d.getSeconds()).padStart(2, '0')}`;
  return `${stamp} ${words}${ext}`;
}
/** A file inside one of our two folders, or null. */
function inside(kind, name) {
  const dir = DIRS[kind]; if (!dir) return null;
  const base = path.basename(String(name || '')); if (!base || base !== String(name) || base.startsWith('.') || !FILE_RE[kind].test(base)) return null;
  const full = path.join(dir, base); return path.dirname(full) === dir && fs.existsSync(full) ? full : null;
}
function recent(kind, n = 12) {
  try { return fs.readdirSync(DIRS[kind]).filter((f) => FILE_RE[kind].test(f) && !f.startsWith('.')).map((f) => { const s = fs.statSync(path.join(DIRS[kind], f)); return { name: f, size: s.size, at: s.mtimeMs }; })
    .sort((a, b) => b.at - a.at).slice(0, n).map((f) => ({ ...f, url: `/api/ai/file/${kind}/${encodeURIComponent(f.name)}` })); } catch { return []; }
}

// ── pictures: Pollinations (checked 2026-11-13: classic keyless endpoint, area ≤ 768², one image per ~45 s per address) ──
const SIZES = { square: [768, 768], portrait: [640, 896], landscape: [896, 640] };
let picBusy = false, picNext = 0;

async function readRaw(req, limit) { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('Картинка больше 15 МБ'), { http: 413 }); chunks.push(c); } return Buffer.concat(chunks); }

export async function handle({ req, res, url, user, seg, method, json, fail, body }) {
  if (seg[1] !== 'ai') return false;
  const p = seg.slice(2).join('/');

  if (method === 'GET' && p === 'state') {
    const t = await installed(), cloud = await cloudModels(), v = await voices();
    const votes = all('SELECT winner, a, b FROM ai_votes WHERE user = ?', user.id), score = {};
    for (const r of votes) { for (const m of [r.a, r.b]) score[m] ||= { wins: 0, games: 0 }; score[r.a].games++; score[r.b].games++; if (r.winner === 'a') score[r.a].wins++; if (r.winner === 'b') score[r.b].wins++; }
    json(200, { ok: true, ollama: t.up,
      models: t.items.filter((m) => !m.embed).map(({ id, size, params, vision, reasoner }) => ({ id, size, params, vision, reasoner })),
      all: t.items.map(({ id, size, params, embed, vision, reasoner }) => ({ id, size, params, embed, vision, reasoner })),
      cloud: cloud.map(({ id, name, model }) => ({ id, name, model })), cloudOk: cloudOk(user),
      images: can(user, 'ai'), stt: voiceStatus().stt, voices: { ru: v.ru.map((x) => x.name), en: v.en.map((x) => x.name) },
      history: all('SELECT role, content, model, ms, created FROM ai_msgs WHERE user = ? ORDER BY id DESC LIMIT 60', user.id).reverse(),
      score, voiceFiles: recent('voice', 6), pictures: recent('image', 12), folders: { voice: '~/Documents/VITON13/Голос', image: '~/Pictures/VITON13' } });
    return true;
  }

  // chat with one model; the conversation is this world's own, kept per person
  if (method === 'POST' && p === 'chat') {
    const b = await body(), text = clip(b.text).trim(); if (!text) { fail(400, 'Пустое сообщение'); return true; }
    const eng = await resolve(user, b.model); if (eng.error) { json(eng.code ? 402 : 400, { ok: false, code: eng.code, message: eng.error }); return true; }
    const hist = all('SELECT role, content FROM ai_msgs WHERE user = ? ORDER BY id DESC LIMIT 16', user.id).reverse();
    run('INSERT INTO ai_msgs (user, role, content, model, ms, created) VALUES (?, ?, ?, ?, 0, ?)', user.id, 'user', text, eng.id, now());
    const s = sse(res), t0 = now(); let first = 0, out = '';
    const mark = () => { if (!first) { first = now() - t0; s.send({ type: 'first', ms: first }); } };
    try {
      out = await stream(eng, { system: 'Ты — языковая модель в песочнице приложения VITON13. Отвечай по делу, на языке собеседника. Markdown можно.',
        messages: [...hist, { role: 'user', content: text }], maxTokens: 1200, signal: s.signal, onThink: (t) => { mark(); s.send({ type: 'think', t }); }, onToken: (t) => { mark(); s.send({ type: 'token', t }); } });
      const ms = now() - t0; run('INSERT INTO ai_msgs (user, role, content, model, ms, created) VALUES (?, ?, ?, ?, ?, ?)', user.id, 'assistant', out || '…', eng.id, ms, now());
      s.send({ type: 'done', ms, first, model: eng.id });
    } catch (e) {
      if (out) run('INSERT INTO ai_msgs (user, role, content, model, ms, created) VALUES (?, ?, ?, ?, ?, ?)', user.id, 'assistant', out, eng.id, now() - t0, now());
      if (!s.signal.aborted) s.send({ type: 'error', message: humanError(e) });
    }
    s.end(); return true;
  }
  if (method === 'DELETE' && p === 'chat') { run('DELETE FROM ai_msgs WHERE user = ?', user.id); json(200, { ok: true }); return true; }

  // arena: one prompt, two models at once
  if (method === 'POST' && p === 'arena') {
    const b = await body(), text = clip(b.text).trim(); if (!text) { fail(400, 'Напишите задание'); return true; }
    const A = await resolve(user, b.a), B = await resolve(user, b.b), bad = A.error ? A : B.error ? B : null;
    if (bad) { json(bad.code ? 402 : 400, { ok: false, code: bad.code, message: bad.error }); return true; }
    const s = sse(res);
    await Promise.all([['a', A], ['b', B]].map(async ([side, eng]) => {
      const t0 = now(); let first = 0; const mark = () => { if (!first) { first = now() - t0; s.send({ side, type: 'first', ms: first }); } };
      try {
        await stream(eng, { messages: [{ role: 'user', content: text }], maxTokens: 900, signal: s.signal,
          onThink: (t) => { mark(); s.send({ side, type: 'think', t }); }, onToken: (t) => { mark(); s.send({ side, type: 'token', t }); } });
        s.send({ side, type: 'done', ms: now() - t0, first });
      } catch (e) { if (!s.signal.aborted) s.send({ side, type: 'error', message: humanError(e) }); }
    }));
    s.send({ type: 'end' }); s.end(); return true;
  }
  if (method === 'POST' && p === 'vote') {
    const b = await body(); if (!['a', 'b', 'tie'].includes(b.winner) || !b.a || !b.b) { fail(400, 'Нет голоса'); return true; }
    run('INSERT INTO ai_votes (user, a, b, winner, prompt, created) VALUES (?, ?, ?, ?, ?, ?)', user.id, String(b.a).slice(0, 80), String(b.b).slice(0, 80), b.winner, clip(b.prompt).slice(0, 500), now());
    json(200, { ok: true }); return true;
  }

  // one-click tools on a local model
  if (method === 'POST' && p === 'tool') {
    const b = await body(), text = clip(b.text).trim(), sys = TOOLS[b.tool];
    if (!sys) { fail(400, 'Нет такого инструмента'); return true; } if (!text) { fail(400, 'Вставьте текст'); return true; }
    if (String(b.model || '').startsWith('cloud:')) { fail(400, 'Инструменты работают на моделях этого Mac'); return true; }    // free by design: tools never reach the cloud
    const eng = await resolve(user, b.model); if (eng.error) { json(eng.code ? 402 : 400, { ok: false, code: eng.code, message: eng.error }); return true; }
    const s = sse(res), t0 = now();
    try { await stream(eng, { system: sys, messages: [{ role: 'user', content: text }], maxTokens: 1200, signal: s.signal, onThink: (t) => s.send({ type: 'think', t }), onToken: (t) => s.send({ type: 'token', t }) }); s.send({ type: 'done', ms: now() - t0 }); }
    catch (e) { if (!s.signal.aborted) s.send({ type: 'error', message: humanError(e) }); }
    s.end(); return true;
  }

  // describe a picture with a local vision model; the image goes in the body as is
  if (method === 'POST' && p === 'vision') {
    const type = String(req.headers['content-type'] || ''); if (!/^image\/(png|jpe?g|webp|gif)/.test(type)) { fail(415, 'Нужна картинка: PNG, JPG или WebP'); return true; }
    const t = await installed(), m = t.items.find((x) => x.id === url.searchParams.get('model') && x.vision);
    if (!m) { fail(400, 'Нет модели, которая понимает картинки'); return true; }
    const buf = await readRaw(req, IMG_MAX); if (!buf.length) { fail(400, 'Пустая картинка'); return true; }
    const q = clip(url.searchParams.get('q') || '').trim() || 'Опиши, что на картинке: главное, детали, текст, если он есть.';
    const s = sse(res), t0 = now();
    try { await stream({ kind: 'ollama', model: m.id, reasoner: m.reasoner, base: await ollamaBase() }, { system: 'Отвечай на русском, если вопрос на русском.', messages: [{ role: 'user', content: q }], images: [buf.toString('base64')], maxTokens: 900, signal: s.signal, onThink: (x) => s.send({ type: 'think', t: x }), onToken: (x) => s.send({ type: 'token', t: x }) }); s.send({ type: 'done', ms: now() - t0 }); }
    catch (e) { if (!s.signal.aborted) s.send({ type: 'error', message: humanError(e) }); }
    s.end(); return true;
  }

  // text → speech with a macOS voice, saved as an ordinary file
  if (method === 'POST' && p === 'say') {
    const b = await body(), text = clip(b.text).trim(); if (!text) { fail(400, 'Напишите текст'); return true; }
    const v = await voices(), list = isRu(text) ? v.ru : v.en, every = [...v.ru, ...v.en];
    const voice = every.find((x) => x.name === b.voice) || list[0] || every[0]; if (!voice) { fail(501, 'На этом Mac не нашлось голосов для озвучки'); return true; }
    fs.mkdirSync(VOICE_DIR, { recursive: true });
    const name = fileName(text, '.m4a'), out = path.join(VOICE_DIR, name), tmp = path.join(os.tmpdir(), `vit-say-${process.pid}-${now()}.txt`);
    try {
      fs.writeFileSync(tmp, text, 'utf8');                                                          // text goes through a file: nothing in it can act as an option
      await sh('say', ['-v', voice.name, '-f', tmp, '-o', out, '--file-format=m4af', '--data-format=aac'], 120000);
    } catch { try { fs.rmSync(out, { force: true }); } catch { /* nothing written */ } fail(500, 'Не получилось озвучить'); return true; }
    finally { fs.rmSync(tmp, { force: true }); }
    json(200, { ok: true, file: { name, url: `/api/ai/file/voice/${encodeURIComponent(name)}`, voice: voice.name, size: fs.statSync(out).size } }); return true;
  }

  // a picture from a prompt — the only request that leaves this Mac
  if (method === 'POST' && p === 'image') {
    if (!can(user, 'ai')) { json(402, { ok: false, code: 'ai', message: 'Картинки по описанию — с VITON ID.' }); return true; }
    const b = await body(), prompt = clip(b.prompt).replace(/\s+/g, ' ').trim().slice(0, 900); if (!prompt) { fail(400, 'Опишите картинку'); return true; }
    if (picBusy) { fail(429, 'Картинка уже рисуется — подождите её.'); return true; }
    const wait = Math.ceil((picNext - now()) / 1000); if (wait > 0) { json(429, { ok: false, wait, message: `Pollinations рисует бесплатно по одной картинке примерно раз в 45 секунд. Ещё ${wait} с.` }); return true; }
    const [w, hgt] = SIZES[b.size] || SIZES.square, seed = Math.floor(Math.random() * 1e9);
    const src = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${hgt}&seed=${seed}`;
    picBusy = true;
    try {
      const r = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(120000), headers: { accept: 'image/*' } });
      picNext = now() + 46000;
      if (!/^https:/.test(r.url)) throw Object.assign(new Error('not https'), { human: 'Сервис ответил не по защищённому адресу.' });
      if (r.status === 402 || r.status === 429) { const ra = Number(r.headers.get('retry-after')) || 45; picNext = now() + ra * 1000; throw Object.assign(new Error('limit'), { human: `Pollinations просит подождать ${ra} с.` }); }
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { human: 'Pollinations сейчас не рисует. Попробуйте чуть позже.' });
      const type = String(r.headers.get('content-type') || ''); if (!/^image\/(jpeg|png|webp)/.test(type)) throw Object.assign(new Error(type), { human: 'Сервис прислал не картинку.' });
      if (Number(r.headers.get('content-length')) > IMG_MAX) throw Object.assign(new Error('big'), { human: 'Картинка больше 15 МБ.' });
      const chunks = []; let n = 0;
      for await (const c of r.body) { n += c.length; if (n > IMG_MAX) throw Object.assign(new Error('big'), { human: 'Картинка больше 15 МБ.' }); chunks.push(c); }
      fs.mkdirSync(PIC_DIR, { recursive: true });
      const ext = /png/.test(type) ? '.png' : /webp/.test(type) ? '.webp' : '.jpg', name = fileName(prompt, ext);
      fs.writeFileSync(path.join(PIC_DIR, name), Buffer.concat(chunks));
      json(200, { ok: true, file: { name, url: `/api/ai/file/image/${encodeURIComponent(name)}`, size: n, w, h: hgt } });
    } catch (e) { fail(502, e.human || (e.name === 'TimeoutError' ? 'Pollinations не успел нарисовать. Попробуйте ещё раз.' : 'Не получилось получить картинку.')); }
    finally { picBusy = false; }
    return true;
  }

  // files we made: play, show, download — only from our two folders
  if (method === 'GET' && seg[2] === 'file' && seg[3] && seg[4]) {
    const full = inside(seg[3], decodeURIComponent(seg[4])); if (!full) { fail(404, 'Файл не найден'); return true; }
    const st = fs.statSync(full), type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const headers = { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes',
      ...(url.searchParams.get('dl') === '1' ? { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(full))}` } : {}) };
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2])), end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); res.end(); return true; }
      res.writeHead(206, { ...headers, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${st.size}` }); fs.createReadStream(full, { start, end }).pipe(res); return true;
    }
    res.writeHead(200, { ...headers, 'content-length': st.size }); fs.createReadStream(full).pipe(res); return true;
  }
  if (method === 'POST' && p === 'reveal') {
    if (req.viaLan) { fail(403, 'Показать в Finder можно только на самом Mac'); return true; }
    const b = await body(), full = b.name ? inside(b.kind, b.name) : DIRS[b.kind]; if (!full) { fail(404, 'Файл не найден'); return true; }
    fs.mkdirSync(DIRS[b.kind], { recursive: true });
    try { await sh('open', b.name ? ['-R', full] : [full], 10000); json(200, { ok: true }); } catch { fail(500, 'Не получилось открыть Finder'); }
    return true;
  }
  return false;
}
