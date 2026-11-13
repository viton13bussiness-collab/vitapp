// VIT's action parser: what counts as a command, and what must stay a conversation. Run: node --test 'server/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, parseAmount, parseDay, parseDeadline, checkGuess, looksLikeAction, isFree } from '../intent.mjs';

const NOW = new Date(2026, 10, 13, 12, 0);                 // 13 November 2026, a Friday
const d = (text) => detect(text, NOW);
const is = (text, action, args = {}) => test(`«${text}» → ${action}`, () => {
  const r = d(text); assert.ok(r, 'no action read'); assert.equal(r.action, action);
  for (const [k, v] of Object.entries(args)) assert.deepEqual(r.args[k], v, `${k}: ${JSON.stringify(r.args)}`);
});
const none = (text) => test(`«${text}» stays a conversation`, () => assert.equal(d(text), null));

// ── budget.add ──
is('потратил 500 на такси', 'budget.add', { kind: 'out', amount: 500, cat: 'Транспорт', note: 'Такси', day: '2026-11-13' });
is('Потратила 1,5к на кафе', 'budget.add', { kind: 'out', amount: 1500, cat: 'Кафе' });
is('вчера заплатил 2 тыс за интернет', 'budget.add', { amount: 2000, cat: 'Связь', day: '2026-11-12' });
is('заплатил полторы тысячи за обед', 'budget.add', { amount: 1500, cat: 'Кафе' });
is('позавчера купил кроссовки за 7 990 ₽', 'budget.add', { amount: 7990, cat: 'Одежда', note: 'Кроссовки', day: '2026-11-11' });
is('запиши доход 80000 зарплата', 'budget.add', { kind: 'in', amount: 80000, cat: 'Зарплата' });
is('мне перевели 15к за проект', 'budget.add', { kind: 'in', amount: 15000, cat: 'Подработка' });
is('получил 80 000 зарплату', 'budget.add', { kind: 'in', amount: 80000, cat: 'Зарплата' });
is('ушло 3200 на продукты в Пятёрочке', 'budget.add', { kind: 'out', amount: 3200, cat: 'Еда' });
is('12.11 потратил 800 на метро', 'budget.add', { amount: 800, day: '2026-11-12', cat: 'Транспорт' });
is('потратил две тысячи пятьсот на подарок маме', 'budget.add', { amount: 2500, cat: 'Подарки' });
is('VIT, запиши 990 подписка на музыку', 'budget.add', { kind: 'out', amount: 990, cat: 'Подписки' });
is('-300 кофе', 'budget.add', { kind: 'out', amount: 300, cat: 'Кафе' });
is('оплатил аренду 45 тыс', 'budget.add', { amount: 45000, cat: 'Жильё' });
is('потратил 1.2 млн на ремонт', 'budget.add', { amount: 1200000 });

// ── budget.goal ──
is('поставь цель накопить 300 тысяч на машину к лету', 'budget.goal', { title: 'Машина', target: 300000, deadline: '2027-06-01' });
is('хочу накопить 1 млн на квартиру до декабря 2027', 'budget.goal', { title: 'Квартира', target: 1000000, deadline: '2027-12-01' });
is('цель: 50 тыс на отпуск через 6 месяцев', 'budget.goal', { target: 50000, deadline: '2027-05-13' });

// ── budget.report ──
is('сколько я потратил в этом месяце', 'budget.report', { period: 'month', focus: 'month' });
is('какой у меня баланс', 'budget.report', { focus: 'balance' });
is('сколько я потратил на такси', 'budget.report', { cat: 'Транспорт' });
is('покажи мои траты за прошлый месяц', 'budget.report', { period: 'prev' });

// ── brain.add ──
is('добавь в мозг: хочу открыть студию в Дубае', 'brain.add', { cat: 'goals', text: 'Хочу открыть студию в Дубае' });
is('запомни, что у мамы день рождения 5 марта', 'brain.add', { cat: 'people', text: 'У мамы день рождения 5 марта' });
is('запиши идею: кофейня с роботами', 'brain.add', { cat: 'ideas', text: 'Кофейня с роботами' });
is('запиши в память купить молоко', 'brain.add', { cat: 'tasks' });

// ── music.play ──
is('включи радио джаз', 'music.play', { query: '', radio: true, tag: 'jazz' });
is('поставь Tenca', 'music.play', { query: 'Tenca', radio: false });
is('можешь включить что-нибудь спокойное?', 'music.play', { query: '', tag: 'chillout' });
is('включи музыку', 'music.play', { query: '' });
is('хочу послушать Radiohead', 'music.play', { query: 'Radiohead' });

// ── open / meet.create ──
is('открой кинотеатр', 'open', { world: 'cinema' });
is('открой бюджет', 'open', { world: 'budget' });
is('Пожалуйста, перейди в музыку', 'open', { world: 'music' });
is('покажи мою память', 'open', { world: 'memory' });
is('создай встречу', 'meet.create');
is('начни созвон с командой', 'meet.create', { title: 'с командой' });

// ── what must NOT become an action ──
none('сколько стоит такси в Дубае?');
none('расскажи про бюджетирование');
none('как накопить 300 тысяч на машину?');
none('хочу запустить арт-студию современной живописи');
none('запусти арт-студию');
none('включи свет');
none('поставь задачу команде');
none('Найди свежие новости об ИИ-агентах');
none('я вчера потратил кучу денег');
none('сколько мне нужно денег на машину?');
none('что ты обо мне помнишь?');
none('сделай план продвижения сайта');
none('привет');

// ── numbers and dates on their own ──
test('sums in words and digits', () => {
  for (const [s, n] of [['1,5к', 1500], ['2 тыс', 2000], ['полторы тысячи', 1500], ['80 000 ₽', 80000], ['1 500', 1500], ['300 тысяч', 300000], ['два косаря', 2000], ['99,90', 99.9], ['пятьсот', 500], ['тысячу', 1000], ['1.2 млн', 1200000], ['500 к ужину', 500]])
    assert.equal(parseAmount(s), n, s);
  assert.equal(parseAmount('кучу денег'), null);
});
test('days and deadlines', () => {
  assert.equal(parseDay('вчера', NOW).day, '2026-11-12');
  assert.equal(parseDay('3 ноября', NOW).day, '2026-11-03');
  assert.equal(parseDay('20 декабря', NOW).day, '2025-12-20');              // a day ahead of today means last year
  assert.equal(parseDay('просто так', NOW).day, '2026-11-13');
  assert.equal(parseDeadline('к лету', NOW).deadline, '2027-06-01');
  assert.equal(parseDeadline('до конца года', NOW).deadline, '2026-12-31');
  assert.equal(parseDeadline('к 2028', NOW).deadline, '2028-01-01');
  assert.equal(parseDeadline('когда-нибудь', NOW).deadline, null);
});
test('a model guess is checked, and the sum always comes from the text', () => {
  assert.equal(checkGuess({ action: 'budget.add', args: { kind: 'out', category: 'Кафе' } }, 'ну я там закинул на кофе', NOW), null);            // no sum in the text → nothing written
  const g = checkGuess({ action: 'budget.add', args: { kind: 'out', category: 'Выдумка', note: 'кофе' } }, 'кофе вышел в 450', NOW);
  assert.equal(g.args.amount, 450); assert.equal(g.args.cat, 'Кафе');
  assert.equal(checkGuess({ action: 'rm -rf', args: {} }, 'x', NOW), null);
  assert.equal(checkGuess({ action: 'open', args: { world: 'nowhere' } }, 'x', NOW), null);
});
test('which messages may ask a model, and which cost no trial answer', () => {
  assert.equal(looksLikeAction('ну короче включи там что-то на фон'), true);
  assert.equal(looksLikeAction('сколько стоит такси в Дубае?'), false);
  assert.equal(isFree('потратил 500 на такси'), true);
  assert.equal(isFree('сколько я потратил в этом месяце'), false);
  assert.equal(isFree('расскажи анекдот'), false);
});
