// Budget world: money now, what came in and went out this month, goals. Everything stays in the local SQLite file.
// With the VIT subscription the assistant reads the numbers, gives a short plan and keeps the lasting facts in the brain.
import { db, all, one, run, now } from '../db.mjs';
import { addNode } from '../memory.mjs';
import { chat } from '../ladder.mjs';
import { can } from '../plan.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS budget_profile (user TEXT PRIMARY KEY, currency TEXT DEFAULT 'RUB', balance REAL DEFAULT 0, income REAL DEFAULT 0, since INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS budget_tx (id INTEGER PRIMARY KEY, user TEXT, kind TEXT, amount REAL, cat TEXT, note TEXT, day TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS budget_goals (id INTEGER PRIMARY KEY, user TEXT, title TEXT, target REAL, saved REAL DEFAULT 0, deadline TEXT, created INTEGER);
CREATE INDEX IF NOT EXISTS budget_tx_user ON budget_tx (user, day);`);

export const CURRENCIES = ['RUB', 'USD', 'EUR', 'AED', 'GBP', 'KZT', 'CNY'];
export const CATS = { out: ['Еда', 'Кафе', 'Транспорт', 'Жильё', 'Связь', 'Здоровье', 'Одежда', 'Развлечения', 'Подписки', 'Образование', 'Подарки', 'Другое'], in: ['Зарплата', 'Подработка', 'Подарок', 'Другое'] };
const MAX = 1e12;
const bad = (msg) => Object.assign(new Error(msg), { user: true });
const money = (v, msg = 'Проверьте сумму') => { const n = Math.round(Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) * 100) / 100; if (!Number.isFinite(n) || n < 0 || n > MAX) throw bad(msg); return n; };
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00'));
const fmt = (n, cur) => { try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n); } catch { return `${Math.round(n)} ${cur}`; } };

function profile(user) { return one('SELECT currency, balance, income, since, updated FROM budget_profile WHERE user = ?', user) || null; }

function state(user) {
  const p = profile(user), today = new Date(), month = dayOf(today).slice(0, 7);
  const sumSince = p ? one("SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount ELSE -amount END), 0) AS s FROM budget_tx WHERE user = ? AND created >= ?", user, p.since || 0).s : 0;
  const m = one("SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount END), 0) AS i, COALESCE(SUM(CASE WHEN kind = 'out' THEN amount END), 0) AS o FROM budget_tx WHERE user = ? AND substr(day, 1, 7) = ?", user, month);
  const byCat = all("SELECT cat, SUM(amount) AS sum FROM budget_tx WHERE user = ? AND kind = 'out' AND substr(day, 1, 7) = ? GROUP BY cat ORDER BY sum DESC", user, month);
  const months = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(today.getFullYear(), today.getMonth() - k, 1), key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const r = one("SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount END), 0) AS i, COALESCE(SUM(CASE WHEN kind = 'out' THEN amount END), 0) AS o FROM budget_tx WHERE user = ? AND substr(day, 1, 7) = ?", user, key);
    months.push({ month: key, in: r.i, out: r.o }); }
  const income = m.i || p?.income || 0;
  return {
    profile: p, currency: p?.currency || 'RUB', balance: p ? Math.round((p.balance + sumSince) * 100) / 100 : 0,
    month: { key: month, in: m.i, out: m.o, net: m.i - m.o, rate: income > 0 ? Math.max(-1, Math.min(1, (income - m.o) / income)) : null },
    byCat, months, cats: CATS, currencies: CURRENCIES,
    tx: all('SELECT id, kind, amount, cat, note, day, created FROM budget_tx WHERE user = ? ORDER BY day DESC, id DESC LIMIT 300', user),
    goals: all('SELECT id, title, target, saved, deadline, created FROM budget_goals WHERE user = ? ORDER BY id', user),
  };
}

// Only with the VIT subscription do numbers go into the brain on their own (addNode embeds locally, no paid calls).
async function intoBrain(user, items) {
  const out = [];
  for (const [cat, line] of items) { try { const n = await addNode(user.id, cat, line, 'Бюджет'); if (n) out.push(n); } catch (e) { console.error('[budget brain]', e.message); } }
  return out;
}
const incomeFact = (p) => p.income > 0 && ['money', `Доход около ${fmt(p.income, p.currency)} в месяц`];
const goalFact = (g, cur) => ['goals', `Цель: накопить ${fmt(g.target, cur)} на «${g.title}»${g.deadline ? `, срок — ${new Date(g.deadline + 'T00:00:00').toLocaleDateString('ru-RU', { month: 'long' })} ${g.deadline.slice(0, 4)}` : ''}`];

const COACH = `Ты — VIT, спокойный финансовый помощник по личному бюджету. Отвечай по-русски, коротко и по делу.
Формат: одна фраза — общая картина, затем 3–5 пронумерованных шагов, каждый — одно конкретное действие с цифрой из данных.
Используй ТОЛЬКО цифры из сводки; ничего не выдумывай и не додумывай доходы или траты, которых нет. Если данных мало — так и скажи и предложи, что записать.
Не советуй конкретные ценные бумаги, фонды, криптовалюты, банки или финансовые продукты и не обещай доходность. Речь только о бюджете: траты, подушка, накопления на цели.
Без вступлений и приветствий, без повторения этих правил.`;

function summary(s) {
  const c = s.currency, f = (n) => fmt(n, c), L = [];
  L.push(`Валюта: ${c}. Деньги сейчас: ${f(s.balance)}.`);
  if (s.profile?.income) L.push(`Обычный доход в месяц (со слов человека): ${f(s.profile.income)}.`);
  L.push(`Этот месяц (${s.month.key}): пришло ${f(s.month.in)}, ушло ${f(s.month.out)}, итог ${f(s.month.net)}${s.month.rate != null ? `, доля сбережений ${Math.round(s.month.rate * 100)}%` : ''}.`);
  if (s.byCat.length) L.push('Траты по категориям за месяц: ' + s.byCat.map((x) => `${x.cat} ${f(x.sum)}`).join('; ') + '.');
  const past = s.months.slice(0, -1).filter((m) => m.in || m.out); if (past.length) L.push('Прошлые месяцы: ' + past.map((m) => `${m.month}: +${f(m.in)} / −${f(m.out)}`).join('; ') + '.');
  if (s.goals.length) L.push('Цели: ' + s.goals.map((g) => `«${g.title}» — накоплено ${f(g.saved)} из ${f(g.target)}${g.deadline ? `, срок ${g.deadline}` : ''}`).join('; ') + '.');
  L.push(`Сегодня ${dayOf()}.`);
  return L.join('\n');
}

export async function handle({ user, seg, method, json, fail, body }) {
  if (seg[1] !== 'budget') return false;
  const id = Number(seg[3]);
  try {
    if (!seg[2] && method === 'GET') { json(200, { ok: true, plan: user.plan, ...state(user.id) }); return true; }

    if (seg[2] === 'profile' && method === 'POST') {
      const b = await body(), p = profile(user.id), cur = CURRENCIES.includes(b.currency) ? b.currency : p?.currency || 'RUB';
      const income = b.income !== undefined ? money(b.income, 'Проверьте доход') : p?.income || 0;
      if (b.balance !== undefined || !p) run('INSERT INTO budget_profile (user, currency, balance, income, since, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user) DO UPDATE SET currency = excluded.currency, balance = excluded.balance, income = excluded.income, since = excluded.since, updated = excluded.updated',
        user.id, cur, money(b.balance ?? 0, 'Проверьте сумму денег'), income, now(), now());
      else run('UPDATE budget_profile SET currency = ?, income = ?, updated = ? WHERE user = ?', cur, income, now(), user.id);
      const remembered = user.plan === 'vit' ? await intoBrain(user, [incomeFact(profile(user.id))].filter(Boolean)) : [];
      json(200, { ok: true, remembered, ...state(user.id) }); return true;
    }

    if (seg[2] === 'tx' && method === 'POST' && !seg[3]) {
      const b = await body(), kind = b.kind === 'in' ? 'in' : 'out', amount = money(b.amount);
      if (!amount) throw bad('Сумма должна быть больше нуля');
      const cat = CATS[kind].includes(b.cat) ? b.cat : 'Другое', day = isDay(String(b.day || '')) ? b.day : dayOf();
      run('INSERT INTO budget_tx (user, kind, amount, cat, note, day, created) VALUES (?, ?, ?, ?, ?, ?, ?)', user.id, kind, amount, cat, text(b.note, 120), day, now());
      if (!profile(user.id)) run('INSERT INTO budget_profile (user, currency, balance, income, since, updated) VALUES (?, ?, 0, 0, 0, ?)', user.id, 'RUB', now());
      json(200, { ok: true, ...state(user.id) }); return true;
    }
    if (seg[2] === 'tx' && method === 'DELETE' && id) {
      run('DELETE FROM budget_tx WHERE id = ? AND user = ?', id, user.id); json(200, { ok: true, ...state(user.id) }); return true;
    }

    if (seg[2] === 'goals' && method === 'POST' && !seg[3]) {
      const b = await body(), title = text(b.title, 80), target = money(b.target, 'Проверьте сумму цели');
      if (!title) throw bad('Как называется цель?'); if (!target) throw bad('Сколько нужно накопить?');
      const deadline = isDay(String(b.deadline || '')) ? b.deadline : null;
      const gid = Number(run('INSERT INTO budget_goals (user, title, target, saved, deadline, created) VALUES (?, ?, ?, ?, ?, ?)', user.id, title, target, money(b.saved ?? 0), deadline, now()).lastInsertRowid);
      const g = one('SELECT * FROM budget_goals WHERE id = ?', gid);
      const remembered = user.plan === 'vit' ? await intoBrain(user, [goalFact(g, profile(user.id)?.currency || 'RUB')]) : [];
      json(200, { ok: true, remembered, ...state(user.id) }); return true;
    }
    if (seg[2] === 'goals' && method === 'POST' && id) {
      const g = one('SELECT * FROM budget_goals WHERE id = ? AND user = ?', id, user.id); if (!g) { fail(404, 'Цель не найдена'); return true; }
      const b = await body();
      const saved = b.add !== undefined ? Math.max(0, Math.round((g.saved + Number(String(b.add).replace(/\s/g, '').replace(',', '.'))) * 100) / 100) : b.saved !== undefined ? money(b.saved) : g.saved;
      if (!Number.isFinite(saved) || saved > MAX) throw bad('Проверьте сумму');
      const target = b.target !== undefined ? money(b.target, 'Проверьте сумму цели') || g.target : g.target;
      const title = b.title !== undefined ? text(b.title, 80) || g.title : g.title;
      const deadline = b.deadline === null || b.deadline === '' ? null : isDay(String(b.deadline || '')) ? b.deadline : g.deadline;
      run('UPDATE budget_goals SET title = ?, target = ?, saved = ?, deadline = ? WHERE id = ?', title, target, saved, deadline, id);
      json(200, { ok: true, ...state(user.id) }); return true;
    }
    if (seg[2] === 'goals' && method === 'DELETE' && id) {
      run('DELETE FROM budget_goals WHERE id = ? AND user = ?', id, user.id); json(200, { ok: true, ...state(user.id) }); return true;
    }

    if (seg[2] === 'advice' && method === 'POST') {
      if (!can(user, 'budget.advice')) { json(402, { ok: false, code: 'subscribe', message: 'Разбор бюджета делает ассистент VIT — он входит в подписку.' }); return true; }
      const s = state(user.id);
      if (!s.profile && !s.tx.length) { fail(400, 'Сначала запишите, сколько у вас денег и какой доход'); return true; }
      const r = await chat({ system: COACH, messages: [{ role: 'user', content: summary(s) }], tier: 'fast', maxTokens: 700, temperature: 0.3 });
      const facts = [];
      const inc = s.profile?.income || s.month.in; if (inc > 0) facts.push(['money', `Доход около ${fmt(inc, s.currency)} в месяц`]);
      if (s.month.rate != null && s.month.out > 0) facts.push(['money', `Откладывает около ${Math.round(Math.max(0, s.month.rate) * 100)}% дохода в месяц`]);
      const top = s.goals.filter((g) => g.saved < g.target).sort((a, b) => b.target - a.target)[0]; if (top) facts.push(goalFact(top, s.currency));
      const remembered = await intoBrain(user, facts.slice(0, 3));
      json(200, { ok: true, text: r.text, model: r.model, local: r.local, remembered }); return true;
    }
  } catch (e) {
    if (e.user) { fail(400, e.message); return true; }
    if (e.code === 'NO_MODEL' || e.code === 'ALL_FAILED') { fail(503, e.message); return true; }
    throw e;
  }
  return false;
}
