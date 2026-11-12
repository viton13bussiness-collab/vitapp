// Budget world: how much money there is now, what came in and went out this month, where it went, goals.
// You keep track yourself with a quick line («кофе 350», «+80000 зарплата», «такси 540 вчера»); with the VIT subscription
// the assistant reads the numbers, gives a short plan and keeps the lasting facts in the brain.
import { head, styled, skeleton, reduced } from '/worlds/_ui.js';

const PALETTE = ['#34e0a1', '#0a84ff', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#30d158', '#ff6b3d', '#5e5ce6', '#c2a37a', '#8e8e93'];
const CUR_NAME = { RUB: '₽ Рубль', USD: '$ Доллар', EUR: '€ Евро', AED: 'AED Дирхам', GBP: '£ Фунт', KZT: '₸ Тенге', CNY: '¥ Юань' };

// quick line → { kind, amount, cat, note, day }. Stems, checked in order; the first that matches wins.
const OUT_WORDS = [
  ['Подписки', ['подписк', 'netflix', 'spotify', 'яндекс плюс', 'кинопоиск', 'icloud', 'youtube', 'chatgpt', 'claude', 'apple music', 'okko', 'ivi']],
  ['Кафе', ['кофе', 'кафе', 'ресторан', 'обед', 'ужин', 'завтрак', 'бар ', 'пицц', 'суши', 'бургер', 'доставк', 'шаурм', 'макдон', 'вкусно', 'kfc', 'старбакс', 'чай']],
  ['Еда', ['продукт', 'магазин', 'пятёроч', 'пятероч', 'перекрёст', 'перекрест', 'магнит', 'вкусвилл', 'ашан', 'лента', 'еда', 'хлеб', 'молок', 'овощ', 'фрукт', 'мясо', 'супермаркет', 'самокат', 'лавк']],
  ['Транспорт', ['такси', 'метро', 'автобус', 'бензин', 'топлив', 'заправк', 'парков', 'каршер', 'поезд', 'электрич', 'самолёт', 'самолет', 'авиа', 'uber', 'проезд', 'тройк']],
  ['Жильё', ['аренд', 'квартир', 'ипотек', 'коммунал', 'жкх', 'свет', 'газ', 'вода', 'ремонт', 'мебел']],
  ['Связь', ['связь', 'телефон', 'мобильн', 'интернет', 'симк', 'мтс', 'билайн', 'мегафон', 'теле2']],
  ['Здоровье', ['аптек', 'врач', 'лекарств', 'стоматолог', 'клиник', 'анализ', 'фитнес', 'спортзал', 'зал ', 'массаж', 'витамин']],
  ['Одежда', ['одежд', 'обув', 'кроссовк', 'куртк', 'футболк', 'джинс', 'платье', 'худи', 'zara', 'uniqlo']],
  ['Развлечения', ['кино', 'концерт', 'игр', 'театр', 'музей', 'клуб', 'отдых', 'развлеч', 'боулинг', 'кальян', 'steam', 'playstation']],
  ['Образование', ['курс', 'книг', 'обучен', 'школ', 'универ', 'репетитор', 'урок', 'учеб']],
  ['Подарки', ['подар', 'цвет', 'букет']],
];
const IN_WORDS = [['Зарплата', ['зарплат', 'зп', 'аванс', 'оклад', 'премия', 'преми']], ['Подработка', ['подработ', 'фриланс', 'заказ', 'проект', 'клиент', 'гонорар', 'кворк']], ['Подарок', ['подар', 'подарили']]];
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return dayOf(d); };

export function parseLine(raw) {
  let s = ' ' + String(raw || '').toLowerCase().replace(/ё/g, 'е').trim() + ' ';
  if (!s.trim()) return null;
  let day = shift(0);
  const dayWords = [[/\sпозавчера\s/, -2], [/\sвчера\s/, -1], [/\sсегодня\s/, 0]];
  for (const [re, k] of dayWords) if (re.test(s)) { day = shift(k); s = s.replace(re, ' '); }
  const dm = s.match(/\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s/);
  if (dm) { const y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : new Date().getFullYear(), d = new Date(y, +dm[2] - 1, +dm[1]);
    if (!Number.isNaN(d.getTime()) && d.getDate() === +dm[1]) { day = dayOf(d); s = s.replace(dm[0], ' '); } }
  let kind = /^\s*\+/.test(s) ? 'in' : 'out'; const minus = /^\s*[-−]/.test(s);
  const am = s.match(/([+\-−]?)\s*(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(тыс\.?|тыщ|к|k|млн)?(?=\s|₽|р|\$|€|$)/);
  if (!am) return { kind, amount: 0, cat: '', note: raw.trim(), day };
  let amount = Number(am[2].replace(/\s/g, '').replace(',', '.'));
  if (/тыс|тыщ|^к$|^k$/.test(am[3] || '')) amount *= 1000; if (am[3] === 'млн') amount *= 1e6;
  if (am[1] === '+') kind = 'in';
  const note = (s.slice(0, am.index) + ' ' + s.slice(am.index + am[0].length)).replace(/[+\-−₽$€]/g, ' ').replace(/(^|\s)р(уб\S*)?(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  const hay = ' ' + note + ' ';
  const inHit = IN_WORDS.find(([, w]) => w.some((x) => hay.includes(x)));
  if (!minus && kind === 'out' && inHit && inHit[0] !== 'Подарок') kind = 'in';
  let cat = 'Другое';
  if (kind === 'in') cat = inHit ? inHit[0] : 'Другое';
  else { const hit = OUT_WORDS.find(([, w]) => w.some((x) => hay.includes(x))); if (hit) cat = hit[0]; }
  return { kind, amount: Math.round(amount * 100) / 100, cat, note: note.charAt(0).toUpperCase() + note.slice(1), day };
}

export default function view(ctx) {
  const { h, api, css, toast, md } = ctx; css('/worlds/_ui.css'); css('/worlds/budget.css');
  const ready = Promise.all([styled('/worlds/_ui.css'), styled('/worlds/budget.css')]);
  const plan = ctx.plan || 'guest', vit = plan === 'vit';
  let S = null, alive = true, advice = null, adviceBusy = false, painted = false, queue = Promise.resolve(), quickEl = null;
  const slot = { note: h('div'), hero: h('div', { class: 'bg-slot' }), grid: h('div', { class: 'bg-slot' }) };

  const editBtn = h('button', { class: 'btn sm ghost w-press', onclick: () => sheet() }, 'Изменить');
  const top = head(h, { title: 'Бюджет', controls: [editBtn] });
  const body = h('div', { class: 'bg-in' });
  const scroll = h('div', { class: 'bg-scroll scroll' }, body);
  const root = h('div', { class: 'view bg' }, top.el, scroll);

  const cur = () => S?.currency || 'RUB';
  const fmt = (n, opts = {}) => { const frac = Math.round(n) !== Math.round(n * 100) / 100; try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur(), maximumFractionDigits: frac && !opts.round ? 2 : 0, minimumFractionDigits: 0, ...(opts.sign ? { signDisplay: 'exceptZero' } : {}) }).format(n); } catch { return `${Math.round(n)} ${cur()}`; } };
  const sym = () => { try { return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: cur() }).formatToParts(0).find((p) => p.type === 'currency')?.value || cur(); } catch { return cur(); } };
  const catColor = (c, kind = 'out') => kind === 'in' ? 'var(--ok)' : PALETTE[Math.max(0, (S?.cats?.out || []).indexOf(c)) % PALETTE.length];
  const monthName = (key, form = 'long') => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: form }); };
  const dayLabel = (d) => d === shift(0) ? 'Сегодня' : d === shift(-1) ? 'Вчера' : new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', ...(d.slice(0, 4) !== String(new Date().getFullYear()) ? { year: 'numeric' } : {}) });
  const num = (v) => Number(String(v || '').replace(/\s/g, '').replace(',', '.'));

  async function call(path, opts) { try { const d = await api(path, opts); if (!alive) return null; if (d.profile !== undefined) S = d; return d; } catch (e) { toast(e.message); return null; } }

  // ── onboarding: four calm steps, one question each ─────────────────────────
  function onboarding() {
    const o = { balance: '', income: '', currency: 'RUB', goal: '', target: '' }; let step = 0;
    const card = h('div', { class: 'bg-onb glass w-mat' });
    const steps = [
      { q: 'Сколько у вас сейчас денег?', hint: 'Всё вместе: карты, наличные, накопления. Можно примерно — потом поправите.', key: 'balance', money: true, cur: true },
      { q: 'Какой у вас доход в месяц?', hint: 'Обычный месяц, после налогов. Если доход плавает — среднее.', key: 'income', money: true },
      { q: 'Ради чего копите?', hint: 'Первая цель: подушка, поездка, техника, свой проект. Можно пропустить.', goal: true },
    ];
    function paint() {
      const s = steps[step], err = h('div', { class: 'bg-err', role: 'alert' });
      const input = (key, ph, attrs = {}) => h('input', { class: 'field bg-big', inputmode: 'decimal', autocomplete: 'off', placeholder: ph, value: o[key], oninput: (e) => { o[key] = e.target.value; }, ...attrs });
      const fields = s.goal
        ? [h('input', { class: 'field', placeholder: 'Например: подушка на 3 месяца', maxlength: 80, value: o.goal, oninput: (e) => { o.goal = e.target.value; } }), h('input', { class: 'field', inputmode: 'decimal', autocomplete: 'off', placeholder: `Сколько нужно, ${sym()}`, value: o.target, oninput: (e) => { o.target = e.target.value; } })]
        : [h('div', { class: 'bg-money' }, input(s.key, '0'), h('span', { class: 'bg-sym' }, sym()))];
      const curRow = s.cur && h('div', { class: 'bg-curs', role: 'group', 'aria-label': 'Валюта' }, (S?.currencies || Object.keys(CUR_NAME)).map((c) => h('button', { class: 'w-pill w-press' + (c === o.currency ? ' on' : ''), 'aria-pressed': String(c === o.currency), onclick: () => { o.currency = c; S = { ...(S || {}), currency: c }; paint(); } }, CUR_NAME[c] || c)));
      const next = h('button', { class: 'btn lg w-press', type: 'submit' }, step < steps.length - 1 ? 'Дальше' : 'Готово');
      const form = h('form', { class: 'bg-onb-form', onsubmit: async (e) => { e.preventDefault(); err.textContent = '';
        if (s.money && (o[s.key] === '' || !(num(o[s.key]) >= 0))) { err.textContent = 'Введите сумму цифрами'; return; }
        if (s.goal && o.goal.trim() && !(num(o.target) > 0)) { err.textContent = 'Сколько нужно накопить?'; return; }
        if (step < steps.length - 1) { step++; return paint(); }
        next.disabled = true;
        const p = await call('/api/budget/profile', { body: { balance: num(o.balance), income: num(o.income) || 0, currency: o.currency } });
        if (p && o.goal.trim()) await call('/api/budget/goals', { body: { title: o.goal.trim(), target: num(o.target) } });
        if (p) { toast('Бюджет готов'); paintAll(); } else next.disabled = false; } }, fields, curRow, err,
        h('div', { class: 'bg-onb-acts' }, step > 0 && h('button', { type: 'button', class: 'btn ghost w-press', onclick: () => { step--; paint(); } }, 'Назад'), h('span', { class: 'grow' }),
          s.goal && h('button', { type: 'button', class: 'btn ghost w-press', onclick: () => { o.goal = ''; form.requestSubmit(); } }, 'Пропустить'), next));
      card.replaceChildren(h('div', { class: 'bg-dots', 'aria-hidden': 'true' }, steps.map((_, i) => h('i', { class: i === step ? 'on' : i < step ? 'done' : '' }))),
        h('span', { class: 'cap' }, `Шаг ${step + 1} из ${steps.length}`), h('h2', { class: 'bg-q' }, s.q), h('p', { class: 'bg-hint' }, s.hint), form);
      requestAnimationFrame(() => card.querySelector('input')?.focus());
    }
    paint();
    return h('div', { class: 'bg-onb-wrap' }, h('div', { class: 'bg-onb-intro' }, h('h2', null, 'Деньги под контролем'), h('p', null, 'Три вопроса — и видно, сколько у вас есть, куда уходит и сколько осталось до цели.')), card);
  }

  // ── pieces ────────────────────────────────────────────────────────────────
  function ring(rate) {
    const r = 34, c = 2 * Math.PI * r, v = rate == null ? 0 : Math.max(0, rate), col = rate == null ? 'var(--soft2)' : rate < 0 ? 'var(--bad)' : rate < 0.1 ? 'var(--warn)' : 'var(--ok)';
    return h('div', { class: 'bg-ring', title: 'Сколько от дохода осталось в этом месяце' },
      h('div', { html: `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="${r}" class="bg-ring-bg"/><circle cx="40" cy="40" r="${r}" class="bg-ring-v" style="stroke:${col};stroke-dasharray:${(c * v).toFixed(1)} ${c.toFixed(1)}"/></svg>` }),
      h('div', { class: 'bg-ring-t' }, h('b', null, rate == null ? '—' : `${Math.round(rate * 100)}%`), h('span', null, 'остаётся')));
  }
  function hero() {
    const m = S.month;
    return h('section', { class: 'bg-hero glass w-mat', style: '--d:0' },
      h('div', { class: 'bg-hero-main' }, h('span', { class: 'cap' }, 'Деньги сейчас'), h('div', { class: 'bg-balance' }, fmt(S.balance, { round: true })),
        h('div', { class: 'bg-kpis' },
          h('div', null, h('span', null, `Пришло · ${monthName(m.key)}`), h('b', { class: 'bg-in-c' }, fmt(m.in, { round: true }))),
          h('div', null, h('span', null, 'Ушло'), h('b', null, fmt(m.out, { round: true }))),
          h('div', null, h('span', null, 'Итог месяца'), h('b', { class: m.net < 0 ? 'bg-neg' : '' }, fmt(m.net, { round: true, sign: true }))))),
      ring(m.rate));
  }

  function quick() {
    const input = h('input', { class: 'field bg-quick-in', placeholder: 'кофе 350 · +80000 зарплата · такси 540 вчера', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Записать трату или доход' });
    const preview = h('div', { class: 'bg-preview', 'aria-live': 'polite' });
    let parsed = null;
    const catSel = () => { const list = S.cats[parsed.kind];
      return h('select', { class: 'bg-cat-sel', 'aria-label': 'Категория', onchange: (e) => { parsed.cat = e.target.value; } }, list.map((c) => h('option', { value: c, selected: c === parsed.cat }, c))); };
    const flip = () => { parsed.kind = parsed.kind === 'in' ? 'out' : 'in'; if (!S.cats[parsed.kind].includes(parsed.cat)) parsed.cat = 'Другое'; draw(); };
    const draw = () => {
      if (!parsed) return preview.replaceChildren(h('span', { class: 'bg-tip' }, 'Пишите как в заметке: сумма и пара слов. «+» — доход.'));
      if (!parsed.amount) return preview.replaceChildren(h('span', { class: 'bg-tip' }, 'Добавьте сумму цифрами'));
      preview.replaceChildren(
        h('button', { type: 'button', class: 'tag bg-kind w-press ' + parsed.kind, title: 'Поменять: доход или трата', onclick: flip }, parsed.kind === 'in' ? 'Доход' : 'Трата'),
        h('b', { class: 'bg-pv-sum' + (parsed.kind === 'in' ? ' in' : '') }, fmt(parsed.kind === 'in' ? parsed.amount : -parsed.amount, { sign: true })), catSel(),
        h('span', { class: 'bg-tip' }, dayLabel(parsed.day)), parsed.note && h('span', { class: 'bg-tip bg-pv-note' }, parsed.note));
    };
    const paintPreview = () => { parsed = parseLine(input.value); draw(); };
    input.addEventListener('input', paintPreview);
    const add = h('button', { class: 'btn w-press', type: 'submit' }, 'Записать');
    const form = h('form', { class: 'bg-quick glass w-mat', style: '--d:1', onsubmit: async (e) => { e.preventDefault();
      if (!parsed?.amount) { input.focus(); paintPreview(); return; }
      const item = parsed, line = input.value; input.value = ''; paintPreview();                       // the line clears at once; records go out one after another
      queue = queue.then(async () => { const d = await call('/api/budget/tx', { body: item }); if (d) paintAll(); else if (!input.value) { input.value = line; paintPreview(); } }); } },
      h('div', { class: 'bg-quick-row' }, input, add), preview);
    paintPreview();
    return form;
  }

  function donut() {
    const list = S.byCat, total = list.reduce((a, x) => a + x.sum, 0), r = 52, c = 2 * Math.PI * r; let off = 0;
    const arcs = list.map((x) => { const len = (x.sum / total) * c, gap = list.length > 1 ? Math.min(3, len * 0.3) : 0, s = `<circle cx="70" cy="70" r="${r}" style="stroke:${catColor(x.cat)};stroke-dasharray:${Math.max(0.01, len - gap).toFixed(2)} ${c.toFixed(2)};stroke-dashoffset:${(-off).toFixed(2)}"/>`; off += len; return s; }).join('');
    return h('section', { class: 'bg-card glass w-mat', style: '--d:2' }, h('div', { class: 'bg-card-head' }, h('h2', null, 'Куда уходит'), h('span', { class: 'cap' }, monthName(S.month.key, 'long'))),
      total ? h('div', { class: 'bg-donut' },
        h('div', { class: 'bg-donut-art', html: `<svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="${r}" class="bg-donut-bg"/><g class="bg-arcs">${arcs}</g></svg>` }, h('div', { class: 'bg-donut-c' }, h('b', null, fmt(total, { round: true })), h('span', null, 'за месяц'))),
        h('ul', { class: 'bg-legend' }, list.map((x) => h('li', null, h('i', { style: `background:${catColor(x.cat)}` }), h('span', null, x.cat), h('b', null, fmt(x.sum, { round: true })), h('em', null, `${Math.round((x.sum / total) * 100)}%`)))))
        : h('p', { class: 'bg-quiet' }, 'В этом месяце трат пока нет. Запишите первую строкой выше.'));
  }

  function bars() {
    const ms = S.months, top = Math.max(1, ...ms.flatMap((m) => [m.in, m.out]));
    return h('section', { class: 'bg-card glass w-mat', style: '--d:3' }, h('div', { class: 'bg-card-head' }, h('h2', null, 'Полгода'), h('span', { class: 'bg-keys' }, h('i', { class: 'in' }), 'пришло', h('i', { class: 'out' }), 'ушло')),
      h('div', { class: 'bg-bars' }, ms.map((m, i) => h('div', { class: 'bg-bar' + (i === ms.length - 1 ? ' now' : ''), title: `${monthName(m.month)}: +${fmt(m.in, { round: true })} / −${fmt(m.out, { round: true })}` },
        h('div', { class: 'bg-bar-cols' }, h('u', { class: 'in', style: `--v:${(m.in / top).toFixed(3)}` }), h('u', { class: 'out', style: `--v:${(m.out / top).toFixed(3)}` })),
        h('span', null, monthName(m.month, 'short').replace('.', ''))))));
  }

  function goals() {
    const add = () => {
      const t = h('input', { class: 'field sm', placeholder: 'Цель', maxlength: 80 }), v = h('input', { class: 'field sm', placeholder: `Сумма, ${sym()}`, inputmode: 'decimal' }), d = h('input', { class: 'field sm', type: 'date', 'aria-label': 'Срок (необязательно)' });
      const f = h('form', { class: 'bg-goal-new', onsubmit: async (e) => { e.preventDefault(); if (!t.value.trim() || !(num(v.value) > 0)) { toast('Название и сумма цифрами'); return; }
        const r = await call('/api/budget/goals', { body: { title: t.value.trim(), target: num(v.value), deadline: d.value || null } }); if (r) { if (r.remembered?.length) toast('VIT запомнил цель'); paintAll(); } } },
        t, v, d, h('button', { class: 'btn sm w-press', type: 'submit' }, 'Добавить'), h('button', { class: 'btn sm ghost w-press', type: 'button', onclick: () => f.replaceWith(addBtn) }, 'Отмена'));
      addBtn.replaceWith(f); t.focus();
    };
    const addBtn = h('button', { class: 'btn sm ghost w-press', onclick: add }, '+ Цель');
    const goal = (g) => {
      const p = Math.min(1, g.saved / g.target), left = Math.max(0, g.target - g.saved), done = left <= 0;
      let tail = '';
      if (!done && g.deadline) { const months = Math.max(1, Math.ceil((new Date(g.deadline + 'T00:00:00') - new Date()) / (30.44 * 864e5))); tail = new Date(g.deadline) < new Date() ? ' · срок прошёл' : ` · ≈ ${fmt(left / months, { round: true })} в месяц`; }
      const acts = h('div', { class: 'bg-goal-acts' });
      const topUp = () => { const inp = h('input', { class: 'field sm', placeholder: `+ ${sym()}`, inputmode: 'decimal', 'aria-label': 'Сколько отложить' });
        const f = h('form', { class: 'bg-topup', onsubmit: async (e) => { e.preventDefault(); const n = num(inp.value); if (!n) return; if (await call(`/api/budget/goals/${g.id}`, { body: { add: n } })) paintAll(); } }, inp, h('button', { class: 'btn sm w-press', type: 'submit' }, 'OK'));
        acts.replaceChildren(f); inp.focus(); inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') paintAll(); }); };
      acts.append(!done && h('button', { class: 'btn sm w-press', onclick: topUp }, 'Пополнить'),
        !vit && h('button', { class: 'btn sm ghost w-press', title: 'Положить цель в мозг', onclick: async (e) => { e.currentTarget.disabled = true; try { await api('/api/memory', { body: { cat: 'goals', text: `Цель: накопить ${fmt(g.target, { round: true })} на «${g.title}»` } }); toast('Цель теперь в мозге'); } catch (x) { toast(x.message); e.currentTarget.disabled = false; } } }, 'В мозг'),
        h('button', { class: 'icon-btn bg-x', title: 'Удалить цель', 'aria-label': `Удалить цель «${g.title}»`, onclick: async () => { if (confirm(`Удалить цель «${g.title}»?`) && await call(`/api/budget/goals/${g.id}`, { method: 'DELETE' })) paintAll(); } }, '×'));
      return h('li', { class: 'bg-goal' + (done ? ' done' : '') },
        h('div', { class: 'bg-goal-top' }, h('b', null, g.title), h('span', null, done ? 'Готово ✓' : `${Math.round(p * 100)}%`)),
        h('div', { class: 'bg-prog' }, h('u', { style: `--v:${p.toFixed(4)}` })),
        h('div', { class: 'bg-goal-sub' }, `${fmt(g.saved, { round: true })} из ${fmt(g.target, { round: true })}`, done ? '' : ` · осталось ${fmt(left, { round: true })}`, tail), acts);
    };
    return h('section', { class: 'bg-card glass w-mat', style: '--d:4' }, h('div', { class: 'bg-card-head' }, h('h2', null, 'Цели'), addBtn),
      S.goals.length ? h('ul', { class: 'bg-goals' }, S.goals.map(goal)) : h('p', { class: 'bg-quiet' }, 'Цель делает накопления осмысленными: подушка, поездка, своё дело.'));
  }

  function vitCard() {
    if (!vit) return h('section', { class: 'bg-card bg-vit locked glass w-mat', style: '--d:5' },
      h('div', { class: 'bg-vit-glyph', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/></svg>' }),
      h('div', { class: 'bg-vit-t' }, h('h2', null, 'VIT считает за вас'), h('p', null, 'С подпиской VIT ассистент сам считает бюджет, видит перекосы и ведёт цели. А главное о ваших деньгах складывает в мозг.')),
      h('button', { class: 'btn w-press', onclick: () => ctx.upgrade?.('budget') }, 'Подключить VIT'));
    const out = h('div', { class: 'bg-advice' });
    const run = async () => { if (adviceBusy) return; adviceBusy = true; paintVit();
      try { const d = await api('/api/budget/advice', { method: 'POST', body: {} }); if (!alive) return; advice = d; }
      catch (e) { advice = { error: e.message }; } adviceBusy = false; if (alive) paintVit(); };
    const btn = h('button', { class: 'btn w-press', onclick: run }, advice ? 'Разобрать заново' : 'Разобрать с VIT');
    const card = h('section', { class: 'bg-card bg-vit glass w-mat', style: '--d:5' });
    function paintVit() {
      btn.disabled = adviceBusy; btn.textContent = adviceBusy ? 'VIT считает…' : advice?.text ? 'Разобрать заново' : 'Разобрать с VIT';
      out.replaceChildren(...(adviceBusy ? [h('span', { class: 'w-skel', style: 'height:14px;width:82%' }), h('span', { class: 'w-skel', style: 'height:14px;width:64%;--i:1' }), h('span', { class: 'w-skel', style: 'height:14px;width:74%;--i:2' })]
        : advice?.error ? [h('p', { class: 'bg-err' }, advice.error)]
        : advice?.text ? [h('div', { class: 'md bg-advice-md', html: md(advice.text) }), advice.remembered?.length && h('div', { class: 'bg-remembered' }, h('span', { class: 'cap' }, 'В мозге'), advice.remembered.map((n) => h('span', { class: 'tag' }, h('i', { style: `background:${n.cat === 'goals' ? '#ffd60a' : '#34e0a1'}` }), n.text))),
          advice.model && h('span', { class: 'cap bg-model' }, (advice.local ? 'на этом компьютере · ' : '') + advice.model)].filter(Boolean)
        : [h('p', { class: 'bg-quiet' }, 'VIT посмотрит на цифры этого месяца и цели и предложит несколько конкретных шагов.')]));
    }
    card.append(h('div', { class: 'bg-card-head' }, h('h2', null, 'Разбор VIT'), btn), out); paintVit();
    return card;
  }

  function history() {
    const days = new Map(); for (const t of S.tx) { if (!days.has(t.day)) days.set(t.day, []); days.get(t.day).push(t); }
    const row = (t) => h('li', { class: 'bg-tx' }, h('i', { class: 'bg-dot', style: `background:${catColor(t.cat, t.kind)}` }),
      h('div', { class: 'bg-tx-t' }, h('b', null, t.note || t.cat), h('span', null, t.cat)),
      h('b', { class: 'bg-tx-sum' + (t.kind === 'in' ? ' in' : '') }, fmt(t.kind === 'in' ? t.amount : -t.amount, { sign: true })),
      h('button', { class: 'icon-btn bg-x', title: 'Удалить', 'aria-label': `Удалить: ${t.note || t.cat} ${t.amount}`, onclick: async () => { if (await call(`/api/budget/tx/${t.id}`, { method: 'DELETE' })) paintAll(); } }, '×'));
    return h('section', { class: 'bg-card bg-hist glass w-mat', style: '--d:6' }, h('div', { class: 'bg-card-head' }, h('h2', null, 'Записи'), h('span', { class: 'cap' }, S.tx.length ? String(S.tx.length) : '')),
      S.tx.length ? [...days].map(([d, list]) => { const net = list.reduce((a, t) => a + (t.kind === 'in' ? t.amount : -t.amount), 0);
        return h('div', { class: 'bg-day' }, h('div', { class: 'bg-day-h' }, h('span', null, dayLabel(d)), h('span', null, fmt(net, { round: true, sign: true }))), h('ul', null, list.map(row))); })
        : h('p', { class: 'bg-quiet' }, 'Здесь появятся траты и доходы, сгруппированные по дням.'));
  }

  // ── profile sheet ─────────────────────────────────────────────────────────
  function sheet() {
    if (!S?.profile) return;
    const bal = h('input', { class: 'field', inputmode: 'decimal', value: String(S.balance) }), inc = h('input', { class: 'field', inputmode: 'decimal', value: String(S.profile.income || '') });
    let c = S.currency;
    const curs = h('div', { class: 'bg-curs' }); const paintC = () => curs.replaceChildren(...S.currencies.map((x) => h('button', { type: 'button', class: 'w-pill w-press' + (x === c ? ' on' : ''), onclick: () => { c = x; paintC(); } }, CUR_NAME[x] || x))); paintC();
    const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), reduced() ? 0 : 260); window.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', esc);
    const wrap = h('div', { class: 'bg-sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
      h('form', { class: 'bg-sheet glass', role: 'dialog', 'aria-label': 'Деньги и доход', onsubmit: async (e) => { e.preventDefault();
        const b = { currency: c, income: num(inc.value) || 0 }; if (num(bal.value) !== S.balance) b.balance = num(bal.value);
        if (!(num(bal.value) >= 0)) { toast('Введите сумму цифрами'); return; }
        if (await call('/api/budget/profile', { body: b })) { close(); paintAll(); } } },
        h('h2', null, 'Деньги и доход'),
        h('label', null, h('span', { class: 'cap' }, 'Деньги сейчас'), bal), h('p', { class: 'bg-hint' }, 'Новая сумма станет точкой отсчёта: записи после неё будут прибавляться и вычитаться.'),
        h('label', null, h('span', { class: 'cap' }, 'Доход в месяц'), inc),
        h('div', null, h('span', { class: 'cap' }, 'Валюта'), curs),
        h('div', { class: 'bg-onb-acts' }, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn ghost w-press', onclick: close }, 'Отмена'), h('button', { class: 'btn w-press', type: 'submit' }, 'Сохранить'))));
    root.append(wrap); requestAnimationFrame(() => bal.focus());
  }

  function paintAll() {
    if (!alive || !S) return;
    const y = scroll.scrollTop;
    editBtn.style.display = S.profile ? '' : 'none';
    top.count(S.profile ? `${monthName(S.month.key)[0].toUpperCase() + monthName(S.month.key).slice(1)} · ${cur()}` : '');
    if (!S.profile && !S.tx.length) { quickEl = null; body.replaceChildren(onboarding()); return; }
    if (!quickEl) { quickEl = quick(); body.replaceChildren(slot.note, slot.hero, quickEl, slot.grid); }      // the quick line stays put, so typing and focus survive repaints
    slot.note.replaceChildren(...(plan === 'guest' ? [h('div', { class: 'bg-note' }, 'Гостевой режим: записи хранятся только на этом компьютере. Войдите через VITON ID, чтобы бюджет был в вашем аккаунте.')] : []));
    slot.hero.replaceChildren(hero());
    slot.grid.replaceChildren(h('div', { class: 'bg-grid' }, h('div', { class: 'bg-col' }, donut(), bars(), vitCard()), h('div', { class: 'bg-col' }, goals(), history())));
    scroll.scrollTop = y;
    if (painted) [slot.hero, slot.grid].forEach((x) => x.querySelectorAll('.w-mat').forEach((el) => { el.style.animation = 'none'; }));             // arrive once; later repaints are instant
    painted = true;
  }

  ready.then(() => { if (alive && !S) body.replaceChildren(h('div', { class: 'bg-sk' }, skeleton(h, 3, 'bg-sk-card'))); });
  Promise.all([api('/api/budget'), ready]).then(([d]) => { if (!alive) return; S = d; paintAll(); })
    .catch((e) => { if (alive) body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Бюджет не открылся'), e.message)); });
  return { root, destroy() { alive = false; } };
}
