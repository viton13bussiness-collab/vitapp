// Memory as a graph: every thought is a node, every link is meaning. Nine kinds of memory, stored only on this computer.
import { all, one, run, now } from './db.mjs';
import { askJSON, embed } from './ladder.mjs';

export const CATS = [
  { id: 'emotions', name: 'Эмоции', color: '#ff375f' }, { id: 'mood', name: 'Настроение', color: '#bf5af2' },
  { id: 'knowledge', name: 'Знания', color: '#0a84ff' }, { id: 'people', name: 'Люди', color: '#30d158' },
  { id: 'goals', name: 'Цели', color: '#ffd60a' }, { id: 'tasks', name: 'Задачи', color: '#ff9f0a' },
  { id: 'ideas', name: 'Идеи', color: '#66d4cf' }, { id: 'said', name: 'Вы говорили', color: '#64d2ff' },
  { id: 'money', name: 'Деньги', color: '#34e0a1' },
];
const CAT_IDS = new Set(CATS.map((c) => c.id));

const toBlob = (v) => (v ? new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)) : null);
const fromBlob = (b) => (b ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) : null);
function cos(a, b) { if (!a || !b || a.length !== b.length) return 0; let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); }
const words = (s) => new Set(String(s).toLowerCase().match(/[a-zа-яё0-9]{4,}/gi) || []);
function overlap(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); }
const pub = (n) => ({ id: n.id, cat: n.cat, text: n.text, quote: n.quote, weight: n.weight, created: n.created });

/** What VIT remembers that is relevant to this text. */
export async function recall(user, text, k = 6) {
  const rows = all('SELECT * FROM nodes WHERE user = ?', user); if (!rows.length) return [];
  const qv = await embed(text);
  return rows.map((n) => ({ n, s: qv && n.emb ? cos(qv, fromBlob(n.emb)) : overlap(text, n.text) * 0.9 }))
    .filter((x) => x.s > (qv ? 0.42 : 0.3)).sort((a, b) => b.s - a.s).slice(0, k).map((x) => pub(x.n));
}

const EXTRACT = `Ты — память персонального агента VIT. Из сообщения человека выдели только то, что стоит помнить о нём надолго.
Категории (cat): emotions — эмоции; mood — настроение; knowledge — факты о человеке, его деле, вкусах, обстоятельствах; people — люди из его жизни; goals — цели; tasks — конкретные задачи и дела; money — деньги: доходы, траты, долги, накопления, финансовые цели; ideas — идеи; said — важная прямая мысль или принцип.
Правила: ничего не выдумывай и не описывай ассистента; запоминай только то, что человек сам сообщил о себе, своих делах и людях; вопросы к ассистенту, приветствия и просьбы без личных фактов не запоминай — верни {\"items\":[]}; каждый пункт — одно короткое предложение на русском о человеке в третьем лице («Хочет…», «Работает…»); не больше 4 пунктов.
Ответ строго JSON: {"items":[{"cat":"goals","text":"…"}]}`;

const ABOUT_SELF = /[^a-zа-яё](я|мне|меня|мной|мой|моя|моё|мои|моего|моей|моим|моих|моему|мою|мы|нас|нам|наш|наша|наше|наши|хочу|хотим|планирую|мечтаю|люблю|ненавижу|боюсь|работаю|живу|учусь|зовут|i|i'm|my|me|we|our)(?=[^a-zа-яё]|$)/i;
/** Pull lasting facts out of what the person said, link them and return the new nodes. */
export async function remember(user, text, signal) {
  if (String(text).trim().length < 14 || !ABOUT_SELF.test(' ' + text)) return [];             // a question to VIT says nothing about the person
  const res = await askJSON({ system: EXTRACT, messages: [{ role: 'user', content: String(text).slice(0, 1500) }], tier: 'fast', maxTokens: 300, signal });
  const items = (Array.isArray(res?.items) ? res.items : []).filter((i) => i && CAT_IDS.has(i.cat) && typeof i.text === 'string' && i.text.trim().length > 5).slice(0, 4);
  if (!items.length) return [];
  const existing = all('SELECT * FROM nodes WHERE user = ?', user).map((n) => ({ ...n, v: fromBlob(n.emb) })), fresh = [];
  for (const it of items) {
    const txt = it.text.trim().slice(0, 240), v = await embed(txt);
    const scored = existing.map((n) => ({ n, s: v && n.v ? cos(v, n.v) : overlap(txt, n.text) })).sort((a, b) => b.s - a.s);
    if (scored[0]?.s > 0.9) { run('UPDATE nodes SET weight = weight + 1 WHERE id = ?', scored[0].n.id); continue; }       // already known → it matters more
    const id = Number(run('INSERT INTO nodes (user, cat, text, quote, emb, created) VALUES (?, ?, ?, ?, ?, ?)', user, it.cat, txt, String(text).slice(0, 300), toBlob(v), now()).lastInsertRowid);
    for (const s of scored.slice(0, 3)) if (s.s > 0.55) run('INSERT OR IGNORE INTO edges (a, b, kind, w) VALUES (?, ?, ?, ?)', s.n.id, id, 'meaning', s.s);
    for (const f of fresh) run('INSERT OR IGNORE INTO edges (a, b, kind, w) VALUES (?, ?, ?, ?)', f.id, id, 'together', 0.5);
    const node = { id, cat: it.cat, text: txt, quote: String(text).slice(0, 300), weight: 1, created: now(), v };
    existing.push(node); fresh.push(node);
  }
  return fresh.map(pub);
}

export function graph(user) {
  const nodes = all('SELECT id, cat, text, quote, weight, created FROM nodes WHERE user = ? ORDER BY id', user), ids = new Set(nodes.map((n) => n.id));
  return { cats: CATS, nodes, edges: all('SELECT a, b, kind, w FROM edges').filter((e) => ids.has(e.a) && ids.has(e.b)) };
}
export function forget(user, id) { const n = one('SELECT id FROM nodes WHERE id = ? AND user = ?', id, user); if (!n) return false; run('DELETE FROM edges WHERE a = ? OR b = ?', id, id); run('DELETE FROM nodes WHERE id = ?', id); return true; }
export function forgetAll(user) { for (const n of all('SELECT id FROM nodes WHERE user = ?', user)) run('DELETE FROM edges WHERE a = ? OR b = ?', n.id, n.id); run('DELETE FROM nodes WHERE user = ?', user); }

/** Put one thought into the brain by hand (or from a world such as the budget). Links it to what is close in meaning. */
export async function addNode(user, cat, text, quote = '') {
  const txt = String(text || '').trim().slice(0, 240); if (txt.length < 2 || !CAT_IDS.has(cat)) return null;
  const v = await embed(txt).catch(() => null), existing = all('SELECT * FROM nodes WHERE user = ?', user);
  const scored = existing.map((n) => ({ n, s: v && n.emb ? cos(v, fromBlob(n.emb)) : overlap(txt, n.text) })).sort((a, b) => b.s - a.s);
  if (scored[0]?.s > 0.93) { run('UPDATE nodes SET weight = weight + 1 WHERE id = ?', scored[0].n.id); return pub({ ...scored[0].n, weight: scored[0].n.weight + 1 }); }
  const id = Number(run('INSERT INTO nodes (user, cat, text, quote, emb, created) VALUES (?, ?, ?, ?, ?, ?)', user, cat, txt, String(quote || '').slice(0, 300), toBlob(v), now()).lastInsertRowid);
  for (const x of scored.slice(0, 3)) if (x.s > 0.5) run('INSERT OR IGNORE INTO edges (a, b, kind, w) VALUES (?, ?, ?, ?)', x.n.id, id, 'meaning', x.s);
  return pub(one('SELECT * FROM nodes WHERE id = ?', id));
}
