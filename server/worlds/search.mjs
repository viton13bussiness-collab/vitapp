// One search over the person's own things on this computer: thoughts in the brain, budget records and goals, VIT Music tracks,
// VIT conversations. Answers GET /api/search?q=… with small groups; the client adds worlds, settings and «ask VIT» itself.
import { all } from '../db.mjs';

const has = (table) => { try { return !!all("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", table).length; } catch { return false; } };
// SQLite's LIKE ignores case only for Latin letters, so the rows are matched here, in JS, where «Такси» equals «такси»
const fold = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const clip = (s, n = 110) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const money = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

export async function handle({ url, user, seg, method, json }) {
  if (seg[1] !== 'search' || method !== 'GET') return false;
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) { json(200, { ok: true, q, groups: [] }); return true; }
  const f = fold(q), hit = (...v) => v.some((x) => fold(x).includes(f)), groups = [];
  const push = (id, title, items) => { if (items.length) groups.push({ id, title, items }); };

  push('brain', 'Мозг', all('SELECT id, cat, text, quote FROM nodes WHERE user = ? ORDER BY weight DESC, id DESC LIMIT 2000', user.id)
    .filter((n) => hit(n.text, n.quote)).slice(0, 6).map((n) => ({ go: 'brain', arg: { node: n.id }, title: clip(n.text), sub: 'Мысль' })));
  const convs = new Map();
  for (const m of all('SELECT c.id, c.title, m.content FROM convs c JOIN msgs m ON m.conv = c.id WHERE c.user = ? ORDER BY c.updated DESC, m.id DESC LIMIT 3000', user.id))
    if (!convs.has(m.id) && hit(m.title, m.content)) convs.set(m.id, m);
  push('vit', 'Разговоры с VIT', [...convs.values()].slice(0, 5).map((c) => ({ go: 'vit', arg: { conv: c.id }, title: clip(c.title || c.content, 80), sub: clip(c.content, 90) })));
  if (has('budget_tx')) push('budget', 'Бюджет', [
    ...all('SELECT title, target, saved FROM budget_goals WHERE user = ?', user.id).filter((g) => hit(g.title)).slice(0, 3)
      .map((g) => ({ go: 'budget', title: g.title, sub: `Цель · ${money(g.saved)} из ${money(g.target)}` })),
    ...all('SELECT kind, amount, cat, note, day FROM budget_tx WHERE user = ? ORDER BY day DESC, id DESC LIMIT 3000', user.id).filter((t) => hit(t.note, t.cat)).slice(0, 5)
      .map((t) => ({ go: 'budget', title: `${t.kind === 'in' ? '+' : '−'}${money(t.amount)} · ${t.note || t.cat}`, sub: `${t.cat} · ${t.day}` })),
  ]);
  if (has('music_uploads')) push('music', 'VIT Music', all('SELECT id, title, artist, album FROM music_uploads WHERE user = ? ORDER BY created DESC LIMIT 2000', user.id)
    .filter((t) => hit(t.title, t.artist, t.album)).slice(0, 5).map((t) => ({ go: 'music', title: t.title, sub: t.artist || 'Мой трек' })));
  json(200, { ok: true, q, groups });
  return true;
}
