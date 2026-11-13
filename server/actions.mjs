// VIT's hands: things done in the app's worlds when the person asks in plain words — a record in the budget, a goal,
// a thought in the brain, music, a world opened, a meeting started. Data is written here; what only the window can do
// (play, open, start a meeting) goes back to it as an `action` event. Every number in a reply is read from the database.
import { db, one, run, now } from './db.mjs';
import { addNode, forget, CATS as MEM_CATS } from './memory.mjs';
import { askJSON } from './ladder.mjs';
import { can } from './plan.mjs';
import { state as budgetState } from './worlds/budget.mjs';
import { detect, looksLikeAction, GUESS, checkGuess, WORLD_NAMES, dayOf } from './intent.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS vit_actions (id INTEGER PRIMARY KEY, user TEXT, action TEXT, tbl TEXT, ref INTEGER, msg INTEGER, created INTEGER, undone INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS vit_actions_user ON vit_actions (user, id);`);

export const UNDO_MS = 10 * 60e3;
const MONTH = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTH_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const ON = { Еда: 'еду', Кафе: 'кафе', Транспорт: 'транспорт', Жильё: 'жильё', Связь: 'связь', Здоровье: 'здоровье', Одежда: 'одежду', Развлечения: 'развлечения', Подписки: 'подписки', Образование: 'образование', Подарки: 'подарки' };
const GENRE = { jazz: 'джаз', rock: 'рок', pop: 'поп', classical: 'классика', electronic: 'электроника', lofi: 'lo-fi', chillout: 'чилл', ambient: 'эмбиент', 'hip hop': 'хип-хоп', news: 'новости' };
const money = (n, cur = 'RUB') => { try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n).replace(/ /g, ' '); } catch { return `${n} ${cur}`; } };
const signed = (n, cur) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), cur);
const monthName = (key) => MONTH[Number(key.slice(5, 7)) - 1];
const dateText = (day) => { const [y, m, d] = day.split('-').map(Number); return `${d} ${MONTH_OF[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };
function dayLabel(day) {
  const d = new Date(), today = dayOf(d); d.setDate(d.getDate() - 1); const y1 = dayOf(d); d.setDate(d.getDate() - 1);
  return day === today ? 'сегодня' : day === y1 ? 'вчера' : day === dayOf(d) ? 'позавчера' : dateText(day);
}
const currency = (user) => one('SELECT currency FROM budget_profile WHERE user = ?', user)?.currency || 'RUB';
const record = (user, action, tbl, ref) => Number(run('INSERT INTO vit_actions (user, action, tbl, ref, created) VALUES (?, ?, ?, ?, ?)', user, action, tbl, ref, now()).lastInsertRowid);

/** What the person asks for: the rules first; one small model call only when the words look like a command the rules could not read. */
export async function understand(text, { signal, onSwitch } = {}) {
  const quick = detect(text); if (quick) return { ...quick, by: 'rules' };
  if (!looksLikeAction(text)) return null;
  try {
    const g = await askJSON({ system: GUESS, messages: [{ role: 'user', content: String(text).slice(0, 400) }], tier: 'fast', maxTokens: 200, signal, onSwitch });
    const c = g?.action && g.action !== 'none' ? checkGuess(g, text) : null;
    return c ? { ...c, by: 'model' } : null;
  } catch (e) { if (signal?.aborted) throw e; return null; }
}

/** Do it. Returns the reply VIT says and the event the window gets: { id?, action, ok, summary, world, undo, at, data }. */
export async function perform(user, act) {
  const a = act.args || {}, at = now(), ev = (o) => ({ action: act.action, at, undo: false, ...o });
  switch (act.action) {
    case 'budget.add': {
      const kind = a.kind === 'in' ? 'in' : 'out', cur = currency(user.id), month = a.day.slice(0, 7);
      const tx = Number(run('INSERT INTO budget_tx (user, kind, amount, cat, note, day, created) VALUES (?, ?, ?, ?, ?, ?, ?)', user.id, kind, a.amount, a.cat, a.note || '', a.day, at).lastInsertRowid);
      if (!one('SELECT 1 AS x FROM budget_profile WHERE user = ?', user.id)) run('INSERT INTO budget_profile (user, currency, balance, income, since, updated) VALUES (?, ?, 0, 0, 0, ?)', user.id, 'RUB', at);
      const catSum = one('SELECT COALESCE(SUM(amount), 0) AS s FROM budget_tx WHERE user = ? AND kind = ? AND cat = ? AND substr(day, 1, 7) = ?', user.id, kind, a.cat, month).s;
      const kindSum = one('SELECT COALESCE(SUM(amount), 0) AS s FROM budget_tx WHERE user = ? AND kind = ? AND substr(day, 1, 7) = ?', user.id, kind, month).s;
      const label = a.note && a.note.toLowerCase() !== a.cat.toLowerCase() ? a.note : a.cat;
      const summary = `${kind === 'in' ? '+' : '−'}${money(a.amount, cur)} · ${label} · ${dayLabel(a.day)}`, mn = monthName(month);
      const tail = kind === 'in' ? `Доходы за ${mn} — ${money(kindSum, cur)}.` : ON[a.cat] ? `За ${mn} уже ${money(catSum, cur)} на ${ON[a.cat]}.` : `Расходы за ${mn} — ${money(kindSum, cur)}.`;
      const id = record(user.id, act.action, 'budget_tx', tx);
      return { reply: `Записал: ${summary}. ${tail}`, event: ev({ id, ok: true, summary, world: 'budget', undo: true, data: { tx: { id: tx, kind, amount: a.amount, cat: a.cat, note: a.note || '', day: a.day }, currency: cur, catSum, kindSum, month } }) };
    }
    case 'budget.goal': {
      const cur = currency(user.id), title = String(a.title || 'Цель').slice(0, 80);
      const gid = Number(run('INSERT INTO budget_goals (user, title, target, saved, deadline, created) VALUES (?, ?, ?, 0, ?, ?)', user.id, title, a.target, a.deadline || null, at).lastInsertRowid);
      if (!one('SELECT 1 AS x FROM budget_profile WHERE user = ?', user.id)) run('INSERT INTO budget_profile (user, currency, balance, income, since, updated) VALUES (?, ?, 0, 0, 0, ?)', user.id, 'RUB', at);
      let per = '';
      if (a.deadline) { const d = new Date(a.deadline + 'T00:00:00'), n = new Date(), months = Math.max(1, (d.getFullYear() - n.getFullYear()) * 12 + d.getMonth() - n.getMonth());
        per = ` Чтобы успеть, откладывайте около ${money(Math.ceil(a.target / months / 100) * 100, cur)} в месяц (${months} мес.).`; }
      const summary = `Цель «${title}» · ${money(a.target, cur)}${a.deadline ? ` · к ${dateText(a.deadline)}` : ''}`;
      const id = record(user.id, act.action, 'budget_goals', gid);
      return { reply: `Поставил цель «${title}»: ${money(a.target, cur)}${a.deadline ? ` к ${dateText(a.deadline)}` : ''}.${per}`, event: ev({ id, ok: true, summary, world: 'budget', undo: true, data: { goal: { id: gid, title, target: a.target, deadline: a.deadline || null }, currency: cur } }) };
    }
    case 'budget.report': {
      const s = budgetState(user.id), cur = s.currency;
      if (!s.tx.length && !s.profile?.balance) return { reply: 'В бюджете пока нет записей. Скажите, например: «потратил 500 на такси» — я запишу.', event: ev({ ok: true, summary: 'Записей пока нет', world: 'budget', data: { empty: true } }) };
      const m = a.period === 'prev' ? s.months.at(-2) : s.months.at(-1), key = m.month, mn = monthName(key);
      const top = a.period === 'prev' ? db.prepare("SELECT cat, SUM(amount) AS sum FROM budget_tx WHERE user = ? AND kind = 'out' AND substr(day, 1, 7) = ? GROUP BY cat ORDER BY sum DESC").all(user.id, key) : s.byCat;
      const L = [];
      if (a.focus === 'balance') L.push(`Деньги сейчас: ${money(s.balance, cur)}.`);
      L.push(`${mn[0].toUpperCase() + mn.slice(1)}: доходы ${money(m.in, cur)}, расходы ${money(m.out, cur)}, итог ${signed(m.in - m.out, cur)}.`);
      if (a.cat) { const c = top.find((x) => x.cat === a.cat); L.push(`На ${ON[a.cat] || a.cat.toLowerCase()} — ${money(c?.sum || 0, cur)}.`); }
      else if (top.length) L.push(`Больше всего: ${top.slice(0, 3).map((x) => `${x.cat} ${money(x.sum, cur)}`).join(', ')}.`);
      if (a.focus !== 'balance') L.push(`Деньги сейчас: ${money(s.balance, cur)}.`);
      return { reply: L.join(' '), event: ev({ ok: true, summary: `${mn[0].toUpperCase() + mn.slice(1)}: +${money(m.in, cur)} / −${money(m.out, cur)}`, world: 'budget', data: { month: key, in: m.in, out: m.out, net: m.in - m.out, balance: s.balance, top: top.slice(0, 5), currency: cur } }) };
    }
    case 'brain.add': {
      const node = await addNode(user.id, a.cat, a.text, 'VIT');
      const name = MEM_CATS.find((c) => c.id === a.cat)?.name || 'Память';
      if (!node) return { reply: 'Не получилось записать в мозг: пустая мысль.', event: ev({ ok: false, summary: 'Не записал', world: 'brain' }) };
      if (node.created < at) return { reply: `Это уже есть в мозге («${name}»): «${node.text}». Отметил как более важное.`, event: ev({ ok: true, summary: `${name} · уже было`, world: 'brain', data: { node } }) };
      const id = record(user.id, act.action, 'nodes', node.id);
      return { reply: `Запомнил в разделе «${name}»: ${node.text}`, event: ev({ id, ok: true, summary: `${name} · ${node.text}`, world: 'brain', undo: true, data: { node } }) };
    }
    case 'music.play': {
      const { vitFind } = await import('./worlds/music.mjs');
      const r = await vitFind(user, a.query, { radio: a.radio, tag: a.tag }).catch(() => ({ from: null, tracks: [] }));
      const t = r.tracks[0], what = a.query || GENRE[a.tag] || (a.radio ? 'радио' : 'музыку');
      if (!t) return { reply: `Не нашёл «${what}» ни в ваших треках, ни на радио. Попробуйте другое название.`, event: ev({ ok: false, summary: `Не нашёл «${what}»`, world: 'music' }) };
      const more = r.tracks.length > 1 ? ` Дальше в очереди ещё ${r.tracks.length - 1}.` : '';
      const reply = r.from === 'radio' ? `Включаю радио «${t.title}»${a.tag ? ` — ${GENRE[a.tag]}` : ''}.${more}`
        : r.from === 'free' ? `Включаю альбом «${t.album}» — ${t.artist}, свободная музыка (${t.license}).`
        : `Включаю «${t.title}»${t.artist ? ` — ${t.artist}` : ''}.${more}`;
      return { reply, event: ev({ ok: true, summary: `${r.from === 'radio' ? 'Радио' : 'Трек'} · ${t.title}`, world: 'music', data: { from: r.from, tracks: r.tracks } }) };
    }
    case 'open': {
      const name = WORLD_NAMES[a.world];
      return { reply: `Открываю «${name}».`, event: ev({ ok: true, summary: `Открыть «${name}»`, world: a.world, data: { world: a.world } }) };
    }
    case 'meet.create': {
      if (!can(user, 'meet')) return { reply: 'Встречи доступны с VITON ID. Войдите — и я начну встречу одной фразой.', event: ev({ ok: false, summary: 'Встречи — с VITON ID', world: 'meet' }) };
      return { reply: 'Начинаю новую встречу: сейчас откроются «Встречи» с кодом приглашения.', event: ev({ ok: true, summary: `Новая встреча${a.title ? ` · ${a.title}` : ''}`, world: 'meet', data: { title: a.title || '' } }) };
    }
  }
  return { reply: 'Это действие я пока не умею.', event: ev({ ok: false, summary: 'Не умею', world: 'vit' }) };
}

/** The reply that carries the action, so «Отменить» can mark it in the conversation. */
export function linkMessage(actionId, msgId) { if (actionId) run('UPDATE vit_actions SET msg = ? WHERE id = ?', msgId, actionId); }

/** Take back what VIT just wrote: only the person's own, only within ten minutes. */
export function undo(user, id) {
  const a = one('SELECT * FROM vit_actions WHERE id = ? AND user = ?', Number(id), user.id);
  if (!a) return { ok: false, status: 404, message: 'Действие не найдено' };
  if (a.undone) return { ok: true, already: true };
  if (now() - a.created > UNDO_MS) return { ok: false, status: 409, message: 'Отменить можно в течение 10 минут. Удалите запись в самом мире.' };
  if (a.tbl === 'budget_tx') run('DELETE FROM budget_tx WHERE id = ? AND user = ?', a.ref, user.id);
  else if (a.tbl === 'budget_goals') run('DELETE FROM budget_goals WHERE id = ? AND user = ?', a.ref, user.id);
  else if (a.tbl === 'nodes') forget(user.id, a.ref);
  else return { ok: false, status: 400, message: 'Это действие не отменяется' };
  run('UPDATE vit_actions SET undone = 1 WHERE id = ?', a.id);
  const msg = a.msg && one('SELECT m.id, m.meta FROM msgs m JOIN convs c ON c.id = m.conv WHERE m.id = ? AND c.user = ?', a.msg, user.id);
  if (msg) { try { const meta = JSON.parse(msg.meta || '{}'); if (meta.action) { meta.action.undone = true; run('UPDATE msgs SET meta = ? WHERE id = ?', JSON.stringify(meta), msg.id); } } catch { /* leave the message as it is */ } }
  return { ok: true };
}
