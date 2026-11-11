// The model ladder. Models are engines; VIT decides which one works on a task and moves to the next
// when one hits a limit, runs out of balance or stops answering. A local model (Ollama) keeps VIT alive with no keys at all.
import { getSetting, run, now } from './db.mjs';

const PREF = ['qwen3:4b-instruct', 'qwen3', 'gemma3', 'llama3.3', 'llama3.2', 'llama3', 'mistral', 'phi4', 'phi'];
const EMBED = ['bge-m3', 'nomic-embed-text', 'mxbai-embed', 'all-minilm'];
const isEmbed = (n) => /embed|bge-|minilm/i.test(n);
const cool = new Map();          // provider id → { until, reason }
const lastOk = new Map();
let tags = { at: 0, url: '', models: [] };

class HttpError extends Error { constructor(status, body) { super(`HTTP ${status}`); this.status = status; this.body = String(body || '').slice(0, 400); } }

export async function localModels(url) {
  if (now() - tags.at < 30000 && tags.url === url) return tags.models;
  try { const r = await fetch(url + '/api/tags', { signal: AbortSignal.timeout(2500) }); tags = { at: now(), url, models: ((await r.json()).models || []).map((m) => m.name) }; }
  catch { tags = { at: now(), url, models: [] }; }
  return tags.models;
}

export async function providers() {
  const s = getSetting('models', {}), P = [];
  const url = (s.local?.url || process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const names = await localModels(url), chatNames = names.filter((n) => !isEmbed(n));
  const wanted = s.local?.model || process.env.VIT_LOCAL_MODEL;
  const model = wanted && names.includes(wanted) ? wanted : PREF.map((p) => chatNames.find((n) => n.startsWith(p))).find(Boolean) || chatNames[0] || '';
  P.push({ id: 'local', kind: 'ollama', name: 'Локальная модель', where: 'на этом компьютере', url, model, models: chatNames, ready: !!model, on: s.local?.on !== false });
  const cloud = (id, kind, name, base, key, model) => P.push({ id, kind, name, where: 'облако', base, key, model, ready: !!key, on: s[id]?.on !== false });
  cloud('anthropic', 'anthropic', 'Claude', 'https://api.anthropic.com/v1', s.anthropic?.key || process.env.ANTHROPIC_API_KEY || '', s.anthropic?.model || process.env.VIT_CLAUDE_MODEL || 'claude-haiku-5-5');
  cloud('comet', 'openai', 'CometAPI', 'https://api.cometapi.com/v1', s.comet?.key || process.env.COMETAPI_KEY || '', s.comet?.model || process.env.VIT_COMET_MODEL || 'gpt-4o-mini');
  cloud('openai', 'openai', 'OpenAI-совместимая', (s.openai?.base || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), s.openai?.key || process.env.OPENAI_API_KEY || '', s.openai?.model || process.env.VIT_OPENAI_MODEL || 'gpt-4o-mini');
  return P;
}

// eco: local first, cloud only when local fails · balanced: hard work goes to the cloud first · cloud: cloud first for everything
async function ladder(tier) {
  const P = (await providers()).filter((p) => p.ready && p.on), local = P.filter((p) => p.kind === 'ollama'), cloud = P.filter((p) => p.kind !== 'ollama');
  const policy = getSetting('policy', 'eco');
  const order = policy === 'cloud' || (policy === 'balanced' && tier === 'smart') ? [...cloud, ...local] : [...local, ...cloud];
  const fresh = order.filter((p) => !(cool.get(p.id)?.until > now()));
  return fresh.length ? fresh : order;
}

function explain(e) {
  const b = (e.body || '').toLowerCase();
  if (e.status === 401) return { text: 'ключ не принят', ms: 600000 };
  if (e.status === 402 || e.status === 403 || /quota|balance|insufficient|credit/.test(b)) return { text: 'закончился баланс', ms: 600000 };
  if (e.status === 429) return { text: 'достигнут лимит запросов', ms: 60000 };
  if (e.status === 404) return { text: 'модель не найдена', ms: 300000 };
  if (e.status >= 500) return { text: 'сервис временно недоступен', ms: 60000 };
  if (e.name === 'TimeoutError') return { text: 'не ответила вовремя', ms: 30000 };
  return { text: 'недоступна', ms: 20000 };
}

async function* lines(res) {
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of res.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) yield l; } }
  if (buf.trim()) yield buf.trim();
}
const sig = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));
const withSystem = (o) => [...(o.system ? [{ role: 'system', content: o.system }] : []), ...o.messages];
const post = (url, headers, body, signal) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });

const CALL = {
  async ollama(p, o, think = false) {
    const res = await post(p.url + '/api/chat', {}, { model: p.model, stream: true, keep_alive: '30m', ...(think === null ? {} : { think }), ...(o.json ? { format: 'json' } : {}),
      options: { num_predict: o.maxTokens, temperature: o.temperature, num_ctx: 8192 }, messages: withSystem(o) }, sig(o.signal, 180000));
    if (!res.ok) { const body = await res.text(); if (think !== null && /think/i.test(body)) return CALL.ollama(p, o, null); throw new HttpError(res.status, body); }
    let out = '';
    for await (const l of lines(res)) { const d = JSON.parse(l); if (d.error) throw new HttpError(500, d.error); const t = d.message?.content || ''; if (t) { out += t; o.onToken(t); } }
    if (!out.trim()) throw new HttpError(502, 'empty reply'); return out;
  },
  async openai(p, o) {
    const res = await post(p.base + '/chat/completions', { authorization: 'Bearer ' + p.key }, { model: p.model, stream: true, max_tokens: o.maxTokens, temperature: o.temperature,
      ...(o.json ? { response_format: { type: 'json_object' } } : {}), messages: withSystem(o) }, sig(o.signal, 120000));
    if (!res.ok) throw new HttpError(res.status, await res.text());
    let out = '';
    for await (const l of lines(res)) { if (!l.startsWith('data:')) continue; const s = l.slice(5).trim(); if (s === '[DONE]') break; let d; try { d = JSON.parse(s); } catch { continue; }
      if (d.error) throw new HttpError(500, JSON.stringify(d.error)); const t = d.choices?.[0]?.delta?.content || ''; if (t) { out += t; o.onToken(t); } }
    if (!out.trim()) throw new HttpError(502, 'empty reply'); return out;
  },
  async anthropic(p, o) {
    const res = await post(p.base + '/messages', { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' }, { model: p.model, max_tokens: o.maxTokens, stream: true,
      system: (o.system || '') + (o.json ? '\nОтвет — только один JSON-объект, без пояснений.' : ''), messages: o.messages }, sig(o.signal, 120000));
    if (!res.ok) throw new HttpError(res.status, await res.text());
    let out = '';
    for await (const l of lines(res)) { if (!l.startsWith('data:')) continue; let d; try { d = JSON.parse(l.slice(5)); } catch { continue; }
      if (d.type === 'error') throw new HttpError(500, JSON.stringify(d.error)); const t = d.type === 'content_block_delta' ? d.delta?.text || '' : ''; if (t) { out += t; o.onToken(t); } }
    if (!out.trim()) throw new HttpError(502, 'empty reply'); return out;
  },
};

/** One reply from the first model on the ladder that answers. onSwitch fires each time VIT moves down a step. */
export async function chat({ messages, system = '', tier = 'fast', json = false, maxTokens = 600, temperature = 0.5, onToken, onSwitch, signal }) {
  const list = await ladder(tier);
  if (!list.length) { const e = new Error('Нет ни одной доступной модели. Запустите Ollama или добавьте ключ в Настройках.'); e.code = 'NO_MODEL'; throw e; }
  let lastErr;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], t0 = now(); let got = false;
    try {
      const text = await CALL[p.kind](p, { messages, system, json, maxTokens, temperature, signal, onToken: (t) => { got = true; onToken?.(t); } });
      cool.delete(p.id); lastOk.set(p.id, now()); run('INSERT INTO usage (provider, model, ms, ok, created) VALUES (?, ?, ?, 1, ?)', p.id, p.model, now() - t0, now());
      return { text, provider: p.id, name: p.name, model: p.model, local: p.kind === 'ollama', ms: now() - t0 };
    } catch (e) {
      if (signal?.aborted) throw e;
      const why = explain(e); cool.set(p.id, { until: now() + why.ms, reason: why.text }); lastErr = e;
      run('INSERT INTO usage (provider, model, ms, ok, created) VALUES (?, ?, ?, 0, ?)', p.id, p.model, now() - t0, now());
      onSwitch?.({ from: p.name, to: list[i + 1]?.name || null, reason: why.text, partial: got });
    }
  }
  const e = new Error('Ни одна модель сейчас не отвечает. Проверьте Ollama и ключи в Настройках.'); e.code = 'ALL_FAILED'; e.cause = lastErr; throw e;
}

export function parseJSON(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) try { return JSON.parse(text.slice(a, b + 1)); } catch { /* not JSON */ }
  return null;
}
export async function askJSON(opts) { try { return parseJSON((await chat({ ...opts, json: true, temperature: opts.temperature ?? 0.2 })).text); } catch (e) { if (opts.signal?.aborted || e.code) throw e; return null; } }

/** Embedding for memory recall — local only, so what you say never leaves the computer for this. */
export async function embed(text) {
  const P = await providers(), loc = P[0], names = await localModels(loc.url);
  const model = EMBED.map((e) => names.find((n) => n.startsWith(e))).find(Boolean); if (!model) return null;
  try { const r = await post(loc.url + '/api/embed', {}, { model, input: String(text).slice(0, 2000), keep_alive: '30m' }, AbortSignal.timeout(20000)); const v = (await r.json()).embeddings?.[0]; return v ? Float32Array.from(v) : null; }
  catch { return null; }
}

export async function status() {
  return (await providers()).map((p) => { const c = cool.get(p.id);
    return { id: p.id, name: p.name, where: p.where, model: p.model, models: p.models, base: p.kind === 'openai' && p.id === 'openai' ? p.base : undefined, url: p.url, ready: p.ready, on: p.on, local: p.kind === 'ollama',
      key: p.key ? '••••' + p.key.slice(-4) : '', state: !p.ready ? 'none' : c?.until > now() ? 'limit' : 'ok', reason: c?.until > now() ? c.reason : '', lastOk: lastOk.get(p.id) || 0 }; });
}

export async function test(id) {
  const p = (await providers()).find((x) => x.id === id); if (!p?.ready) return { ok: false, reason: 'не настроена' };
  const t0 = now();
  try { await CALL[p.kind](p, { messages: [{ role: 'user', content: 'Ответь одним словом: ок' }], system: '', json: false, maxTokens: 8, temperature: 0, onToken() {} }); cool.delete(p.id); lastOk.set(p.id, now()); return { ok: true, ms: now() - t0 }; }
  catch (e) { const why = explain(e); cool.set(p.id, { until: now() + why.ms, reason: why.text }); return { ok: false, reason: why.text }; }
}
