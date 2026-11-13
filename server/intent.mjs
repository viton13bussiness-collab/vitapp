// What the person asks VIT to DO, read from plain Russian without a language model: «потратил 500 на такси»,
// «запомни, что …», «включи радио джаз», «открой бюджет». Pure functions only (no database), so the tests run anywhere.
// When the words look like a command but this parser is not sure, agent.mjs asks the cheapest model once (see GUESS).

export const ACTIONS = ['budget.add', 'budget.goal', 'budget.report', 'brain.add', 'music.play', 'open', 'meet.create'];
export const BUDGET_CATS = { out: ['Еда', 'Кафе', 'Транспорт', 'Жильё', 'Связь', 'Здоровье', 'Одежда', 'Развлечения', 'Подписки', 'Образование', 'Подарки', 'Другое'], in: ['Зарплата', 'Подработка', 'Подарок', 'Другое'] };
export const BRAIN_CATS = ['emotions', 'mood', 'knowledge', 'people', 'goals', 'tasks', 'ideas', 'said', 'money'];

// Cyrillic has no \b in JS regexes: these stand in for word edges.
const B = '(?<![а-яa-z0-9])', E = '(?![а-яa-z0-9])';
const rx = (s, f = '') => new RegExp(s.replace(/\\b</g, B).replace(/\\b>/g, E), f);
const pad = (n) => String(n).padStart(2, '0');
export const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// «на машину» → «Машина»: the goal's name in the nominative, for the common endings only
const nominative = (s) => String(s || '').split(' ').map((w) => w.replace(/ую$/, 'ая').replace(/юю$/, 'яя').replace(/([бвгджзклмнпрстфхцчшщ])у$/, '$1а')).join(' ');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tidy = (s) => String(s || '').replace(/^[\s,.:;—–-]+|[\s,.:;!?—–-]+$/g, '').replace(/\s+/g, ' ').trim();

// ── numbers: «500», «1 500», «1,5к», «2 тыс», «80 000 ₽», «полторы тысячи», «два косаря», «1,2 млн» ──
const WORDS = {
  ноль: 0, один: 1, одна: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
  полтора: 1.5, полторы: 1.5, полтинник: 50, полтос: 50, сотка: 100, сотку: 100, сотня: 100, сотню: 100, пятихатка: 500, пятихатку: 500,
};
const MULT = { тысяча: 1e3, тысячу: 1e3, тысячи: 1e3, тысяч: 1e3, тыс: 1e3, тыща: 1e3, тыщу: 1e3, тыщи: 1e3, тыщ: 1e3, косарь: 1e3, косаря: 1e3, косарей: 1e3, штука: 1e3, штуку: 1e3, штуки: 1e3,
  миллион: 1e6, миллиона: 1e6, миллионов: 1e6, млн: 1e6, лям: 1e6, ляма: 1e6, лямов: 1e6 };
const DIGITS = rx('(?<![\\d.,])(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?(?![.,]?\\d)(?:(кк|к|k)(?![а-яa-z])|\\s?(тыс\\.?|тысяч[аиу]?|тыщ[иу]?|т\\.р\\.?|млн|миллион(?:а|ов)?|лям(?:а|ов)?)\\b>)?', 'i');

/** The first sum of money in the text, or null. */
export function parseAmount(text) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const m = DIGITS.exec(t);
  if (m) {
    let n = Number(m[1].replace(/[   ]/g, '') + (m[2] ? '.' + m[2] : ''));
    const u = (m[3] || m[4] || '').replace(/\.$/, '');
    if (/^(к|k|тыс|тысяч|тыщ|т\.р)/.test(u)) n *= 1e3; else if (/^(кк|млн|миллион|лям)/.test(u)) n *= 1e6;
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  let total = 0, cur = 0, seen = false;
  for (const w of t.split(/[^а-яa-z]+/)) {
    if (w in WORDS) { cur += WORDS[w]; seen = true; }
    else if (w in MULT) { total += (cur || 1) * MULT[w]; cur = 0; seen = true; }
    else if (seen && w) break;
  }
  const n = total + cur;
  return seen && n > 0 ? Math.round(n * 100) / 100 : null;
}

// ── days: «сегодня», «вчера», «позавчера», «12.11», «3 ноября» ──
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const MONTH_RX = MONTHS.map((m) => `${m}[а-я]*`).join('|');
const monthIdx = (word) => MONTHS.findIndex((m) => new RegExp('^' + m).test(word));
const DAY_WORDS = rx(`\\b<(позавчера|вчера|сегодня)\\b>`);
const DAY_NUM = rx(`(?<![\\d.,])(\\d{1,2})\\.(\\d{2})(?:\\.(\\d{2,4}))?(?![\\d]|\\s?(?:к|k|тыс|руб|р\\b>|₽))`);
const DAY_NAME = rx(`\\b<(\\d{1,2})\\s+(${MONTH_RX})(?:\\s+(\\d{4}))?\\b>`);

/** The day of a record: { day: 'YYYY-MM-DD', cut: the words that named it } — today when nothing names one. A date ahead of today means last year. */
export function parseDay(text, now = new Date()) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const back = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return dayOf(d); };
  let m = DAY_WORDS.exec(t);
  if (m) return { day: back({ сегодня: 0, вчера: 1, позавчера: 2 }[m[1]]), cut: m[0] };
  const mk = (dd, mm, yy, cut) => { let y = yy ? (yy < 100 ? 2000 + yy : yy) : now.getFullYear(); let d = new Date(y, mm, dd);
    if (d.getMonth() !== mm || d.getDate() !== dd) return null; if (!yy && d > now) d = new Date(y - 1, mm, dd); return { day: dayOf(d), cut }; };
  m = DAY_NUM.exec(t); if (m) { const r = mk(+m[1], +m[2] - 1, m[3] ? +m[3] : 0, m[0]); if (r) return r; }
  m = DAY_NAME.exec(t); if (m) { const r = mk(+m[1], monthIdx(m[2]), m[3] ? +m[3] : 0, m[0]); if (r) return r; }
  return { day: dayOf(now), cut: '' };
}

/** A goal's deadline: «к лету», «до декабря», «к концу года», «через 6 месяцев», «к 2027». Null when none is named. */
export function parseDeadline(text, now = new Date()) {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е'), y = now.getFullYear();
  const ahead = (d) => (d <= now ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d);
  let m = rx('\\b<(?:к|до)\\s+(лету|осени|зиме|весне|лета|осени|зимы|весны)\\b>').exec(t);
  if (m) { const k = { лету: 5, лета: 5, осени: 8, зиме: 11, зимы: 11, весне: 2, весны: 2 }[m[1]]; return { deadline: dayOf(ahead(new Date(y, k, 1))), cut: m[0] }; }
  m = rx('\\b<(?:к|до)\\s+(?:концу|конца)\\s+года\\b>|\\b<(?:к|до)\\s+нового\\s+года\\b>').exec(t);
  if (m) return { deadline: `${y}-12-31`, cut: m[0] };
  m = rx(`\\b<(?:к|до)\\s+(?:(\\d{1,2})\\s+)?(${MONTH_RX})(?:\\s+(\\d{4}))?\\b>`).exec(t);
  if (m) { const mi = monthIdx(m[2]); let d = new Date(m[3] ? +m[3] : y, mi, m[1] ? +m[1] : 1); if (!m[3]) d = ahead(d); return { deadline: dayOf(d), cut: m[0] }; }
  m = rx('\\b<через\\s+(\\d{1,2}|полгода|год)\\s*(месяц[а-я]*|год[а-я]*|лет)?\\b>').exec(t);
  if (m) { const n = m[1] === 'полгода' ? 6 : m[1] === 'год' ? 12 : /^(год|лет)/.test(m[2] || '') ? +m[1] * 12 : +m[1]; const d = new Date(now); d.setMonth(d.getMonth() + n); return { deadline: dayOf(d), cut: m[0] }; }
  m = rx('\\b<(?:к|до)\\s+(20\\d\\d)(?:\\s+год[а-я]*)?\\b>').exec(t);
  if (m) return { deadline: `${m[1]}-01-01`, cut: m[0] };
  return { deadline: null, cut: '' };
}

// ── categories ──
const CAT_WORDS = [
  ['Транспорт', 'такси|метро|автобус|трамва|троллейбус|электричк|бензин|заправк|топливо|парковк|каршеринг|самокат|uber|убер|поезд|авиабилет|самол[её]т|проезд|транспорт'],
  ['Кафе', 'кафе|ресторан|кофе|кофейн|обед|ужин|завтрак|бар|пицц|суши|роллы|бургер|макдо|шаурм|фастфуд|доставк[аиу] еды'],
  ['Еда', 'продукт|еду|еда|еды|магазин|супермаркет|пят[её]рочк|перекр[её]ст|ашан|вкусвилл|магнит|лент[ау]|хлеб|молок|овощ|фрукт'],
  ['Жильё', 'аренд|квартир|коммунал|жкх|ипотек|квартплат|жиль[её]'],
  ['Связь', 'связь|телефон|мобильн|интернет|сотов|симк'],
  ['Здоровье', 'аптек|лекарств|врач|стоматолог|клиник|анализ|здоровь|массаж|спортзал|фитнес'],
  ['Одежда', 'одежд|обув|кроссовк|куртк|джинс|футболк|плать|рубашк|костюм'],
  ['Развлечения', 'кино|концерт|игр[уаы]|театр|развлеч|клуб|боулинг|музей|выставк|отдых'],
  ['Подписки', 'подписк|netflix|spotify|яндекс плюс|icloud|youtube|chatgpt|claude'],
  ['Образование', 'курс|книг|обучени|уч[её]б|школ|репетитор|универ|лекци'],
  ['Подарки', 'подар|цвет[ыо]|букет'],
];
const IN_WORDS = [['Зарплата', 'зарплат|зп\\b>|оклад|аванс|преми'], ['Подработка', 'подработ|фриланс|заказ|проект|клиент|гонорар|халтур'], ['Подарок', 'подар']];
export function guessCat(text, kind = 'out') {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  for (const [cat, w] of kind === 'in' ? IN_WORDS : CAT_WORDS) if (rx(`\\b<(?:${w})`).test(t)) return cat;
  return 'Другое';
}
function guessBrainCat(t) {
  if (/(^|\s)(иде[яюи]|придумал|а что если)/.test(t)) return 'ideas';
  if (/(надо|нужно|не забыть|сделать|позвонить|купить|задач|дедлайн)/.test(t)) return 'tasks';
  if (/(цел[ьи]|хочу|мечтаю|планирую)/.test(t)) return 'goals';
  if (/(мам|пап|брат|сестр|жен[аеуы]|муж|сын|доч|друг|друз|подруг|коллег|начальни|партн[её]р|клиент|зовут)/.test(t)) return 'people';
  if (/(деньг|зарплат|долг|кредит|руб|₽|\$|доход|накоплен)/.test(t)) return 'money';
  if (/(чувствую|радост|грустн|злюсь|боюсь|счастлив|тревож)/.test(t)) return 'emotions';
  return 'knowledge';
}

// ── worlds by name ──
export const WORLD_NAMES = {
  cinema: 'Кинотеатр', budget: 'Бюджет', music: 'VIT Music', brain: 'Мозг', memory: 'Память', messages: 'Сообщения', meet: 'Встречи', browser: 'Meridian', apps: 'Приложения',
  journal: 'VJOURNAL', store: 'Store', medicine: 'Медицина', hub: 'Hub', settings: 'Настройки', home: 'Главная', works: 'Работы', requests: 'Заявки', agents: 'Агенты', vit: 'VIT',
};
const WORLD_RX = [
  ['cinema', 'кинотеатр|кино'], ['budget', 'бюджет|финансы|кошел[её]к'], ['music', 'музык[ауи]|vit music|плеер|медиатек[ау]'], ['brain', 'мозг'], ['memory', 'памят[ьи]'],
  ['messages', 'сообщени[яй]|чат[ы]?|мессенджер|переписк[ау]'], ['meet', 'встреч[иу]|созвоны'], ['browser', 'браузер|meridian|меридиан'], ['apps', 'приложени[яй]|apps'],
  ['journal', 'журнал|vjournal|дневник'], ['store', 'store|магазин|стор'], ['medicine', 'медицин[ауы]'], ['hub', 'hub|хаб'], ['settings', 'настройки'],
  ['home', 'главн(?:ую|ая)(?: страниц[уа]| экран)?|домой|главный экран'], ['works', 'работы'], ['requests', 'заявки'], ['agents', 'агент(?:ы|ов)'],
];
const worldOf = (s) => { const w = tidy(s).replace(/^(мой|мою|мои|моё|мое|мне|раздел|мир|приложение|вкладку|экран)\s+/g, '').replace(/\s+(пожалуйста|плиз)$/, ''); for (const [id, r] of WORLD_RX) if (new RegExp(`^(?:${r})$`).test(w)) return id; return null; };

// ── music ──
const GENRES = [['jazz', 'джаз|jazz'], ['rock', 'рок|rock'], ['pop', 'поп|pop'], ['classical', 'классик[ауи]|классическ'], ['electronic', 'электрон|electronic|техно|хаус'], ['lofi', 'лоу-?фай|ло-?фай|lo-?fi'],
  ['chillout', 'чилл|chill|спокойн|расслаб|для сна|релакс'], ['ambient', 'эмбиент|ambient'], ['hip hop', 'хип-?хоп|рэп|hip-?hop|rap'], ['news', 'новост']];
const VAGUE = /^(спокойн|расслаб|бодр|для сна|для работы|что-нибудь|что-то|что нибудь|любую|любое|какую-нибудь|на фон|фоном|фон|музыку|радио)[а-яa-z]*/i;
const genreOf = (t) => { for (const [tag, r] of GENRES) if (rx(`\\b<(?:${r})`).test(t)) return tag; return ''; };
const MUSIC_FILL = rx('\\b<(мне|нам|пожалуйста|плиз|музыку|музыка|музыки|песню|песни|песенку|трек|треки|радио|радиостанцию|станцию|что-нибудь|что-то|какую-нибудь|какой-нибудь|какое-нибудь|немного|послушать|в эфире|по радио|включи|поставь)\\b>', 'gi');

// ── the parser ──
const Q = rx('^(?:а\\s+)?(?:как|почему|зачем|что\\s+такое|что\\s+значит|стоит\\s+ли|сколько\\s+стоит|сколько\\s+стоят|расскажи|объясни|подскажи|можно\\s+ли|где|когда|кто|чем)\\b>');
const POLITE = rx('^(?:(?:vit|вит|слушай|пожалуйста|давай|а|ну|эй|можешь|сможешь|пожалуйста,)[\\s,]+)+');
const NOT_PLAY = rx('\\b<(цел[ьи]|будильник|таймер|напоминани|задач|встреч|созвон|свет|чайник|режим|тем[уа]|обои|оценк|лайк|плюс|минус|галочк|запят|точк|акцент|рекорд|диагноз|укол|капельниц)');

/** { action, args } for a clear command, or null. The text is the person's own message. */
export function detect(raw, now = new Date()) {
  const orig = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (orig.length < 3) return null;
  let low = orig.toLowerCase().replace(/ё/g, 'е');
  const pm = POLITE.exec(low); const off = pm ? pm[0].length : 0;
  const o = orig.slice(off), t = low.slice(off);                           // same length: lowercasing Russian keeps every index
  const question = Q.test(t);

  // open a world: «открой кинотеатр», «покажи бюджет», «перейди в музыку»
  let m = /^(?:открой|открыть|откройте|покажи|показать|перейди\s+(?:в|на)|перейти\s+(?:в|на)|зайди\s+в|зайти\s+в|запусти|запустить|иди\s+в|давай\s+в)\s+(.+)$/.exec(t.replace(/[.!?]+$/, ''));
  if (m) { const w = worldOf(m[1]); if (w) return { action: 'open', args: { world: w } }; }

  // a new meeting: «создай встречу», «начни созвон с командой»
  m = rx('^(?:созда[йт][а-я]*|создать|начни|начать|запусти[а-яa-z]*|организуй|организовать|сделай|сделать|устрой|давай|нужн[аo])\\s+(?:нов[а-я]+\\s+|быструю\\s+|быстрый\\s+)?(?:видео)?(встреч[уа]|созвон|видеозвонок|видеосвязь|конференци[юя]|звонок)\\b>', 'd').exec(t);
  if (m && !question) { const title = tidy(o.slice(m.indices[0][1])).replace(/^(на|в)\s+/i, ''); return { action: 'meet.create', args: { title: title.slice(0, 80) } }; }

  // into the brain: «добавь в мозг: …», «запомни, что …», «запиши идею: …»
  m = rx('^(?:добавь|добавить|запиши|записать|занеси|сохрани|сохранить|положи)\\s+(?:в\\s+|во\\s+)?(?:мой\\s+|мою\\s+)?(мозг|память|заметк[а-яa-z]*)\\s*[:,—–-]?\\s*', 'd').exec(t)
    || rx('^(?:запомни|запомнить|запоминай|не\\s+забудь)\\b>\\s*(?:,?\\s*(?:что|это|пожалуйста)\\b>)?\\s*[:,—–-]?\\s*', 'd').exec(t);
  const idea = rx('^(?:запиши|записать|сохрани|добавь)\\s+(идею|мысль|задачу|цель)\\b>\\s*[:,—–-]?\\s*', 'd').exec(t);
  if ((m || idea) && !(idea && parseAmount(t.slice(idea[0].length)) && /^цель/.test(idea[1]))) {
    const head = m || idea, text = tidy(o.slice(head.indices[0][1])).replace(/^(что|о том,? что)\s+/i, '');
    if (text.length >= 3) {
      const cat = idea ? { идею: 'ideas', мысль: 'said', задачу: 'tasks', цель: 'goals' }[idea[1]] : guessBrainCat(text.toLowerCase());
      return { action: 'brain.add', args: { cat, text: cap(text).slice(0, 240) } };
    }
  }

  // a savings goal: «поставь цель накопить 300 тысяч на машину к лету»
  if (!question && rx('\\b<(цел[ьи]|накопить|накоплю|накопим|копить|коплю|откладывать\\s+на|отложить\\s+на|собрать\\s+на|скопить)\\b>').test(t)) {
    const dl = parseDeadline(t, now), rest = dl.cut ? t.replace(dl.cut, ' ') : t, amount = parseAmount(rest);
    if (amount) {
      let title = (/(?:^|\s)на\s+([^,.;!?]+)/.exec(rest.replace(/\d[\d\s.,]*\s*(к|k|тыс\.?|тысяч[аиу]?|млн|миллион[а-яa-z]*|лям[а-яa-z]*|руб[а-яa-z]*|₽|р\.)?/g, ' ')) || [])[1] || '';
      title = tidy(title.replace(/\s+(?:к|до|за|через|в)\s.*$/, '').replace(/\s+(рублей|руб|₽)$/, ''));
      if (!title) title = tidy(rest.replace(rx('\\b<(поставь|поставить|создай|добавь|заведи|новая|новую|моя|мою|хочу|нужно|надо|планирую|цель|накопить|копить|скопить|отложить|откладывать|собрать)\\b>', 'g'), ' ').replace(/[\d.,]+\s*(к|тыс\.?|тысяч[аиу]?|млн|миллион[а-яa-z]*)?/g, ' ').replace(/[:—–-]/g, ' '));
      return { action: 'budget.goal', args: { title: cap(nominative(title) || 'Цель').slice(0, 80), target: amount, deadline: dl.deadline } };
    }
  }

  // how the money goes: «сколько я потратил в этом месяце», «какой у меня баланс»
  if (rx('\\b<(сколько|какой|какая|какие|каков|покажи|выведи|дай|отч[её]т|итог|итоги|сводк|статистик)').test(t)
    && rx('(потрати|потрачен|трат|расход|доход|заработа|получил|баланс|бюджет|осталось|остаток|на счету|денег|деньги)').test(t)
    && rx('\\b<(я|мне|меня|мой|моя|мои|моих|мы|нас|наш|наши)\\b>|отч[её]т|сводк|баланс|итог|в этом месяце|за месяц|за ноябрь').test(t)
    && !rx('(стоит|стоят|стоить|бюджетировани|как вести|сэконом|посоветуй|совет|нужно|надо|нужн|хватит|хватает|откладывать|можно ли)').test(t)) {
    const cat = guessCat(t, 'out');
    return { action: 'budget.report', args: { period: rx('\\b<прошл[а-яa-z]*\\s+месяц').test(t) ? 'prev' : 'month', cat: cat === 'Другое' ? null : cat, focus: /баланс|остаток|осталось|на счету|сколько у меня денег/.test(t) ? 'balance' : 'month' } };
  }

  // a record in the budget: «потратил 500 на такси», «запиши доход 80000 зарплата», «вчера заплатил 1,5к за кафе»
  if (!question) {
    const inRx = rx('\\b<(доход[а-яa-z]*|получил[а-яa-z]*|заработал[а-яa-z]*|пришл[аио]|поступил[а-яa-z]*|поступлени[а-яa-z]*|мне\\s+(?:перевели|заплатили|скинули|вернули|прислали|дали)|кэшб[еэ]к|кешб[еэ]к)\\b>|^\\+\\s*\\d');
    const outRx = rx('\\b<(потратил[а-яa-z]*|потрачено|трат[аы]|расход[а-яa-z]*|заплатил[а-яa-z]*|оплатил[а-яa-z]*|купил[а-яa-z]*|отдал[а-яa-z]*|ушл[оаи]|списал[а-яa-z]*|минус|спустил[а-яa-z]*|закинул[а-яa-z]*|скинул[а-яa-z]*)\\b>|^[-−]\\s*\\d');
    const recRx = rx('^(?:запиши|записать|внеси|внести|добавь|добавить|занеси|учти|отметь)\\b>');
    const isIn = inRx.test(t), isOut = outRx.test(t), isRec = recRx.test(t);
    if (isIn || isOut || isRec) {
      const d = parseDay(t, now), rest = d.cut ? t.replace(d.cut, ' ') : t, amount = parseAmount(rest);
      if (amount && !rx('\\b<(мозг|памят[а-яa-z]*|иде[юя]|мысль|заметк[а-яa-z]*)\\b>').test(t)) {
        const kind = isIn ? 'in' : isOut ? 'out' : rx('\\b<(зарплат|аванс|преми|гонорар)').test(t) ? 'in' : 'out';
        const cat = guessCat(rest, kind);
        // the note: what is left once the verb, the sum and the day are gone («на такси» → «Такси»)
        let note = rest.replace(inRx, ' ').replace(outRx, ' ').replace(recRx, ' ')
          .replace(/(?<![\d])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,]\d+)?\s?(к|k|тыс\.?|тысяч[аиу]?|тыщ[иу]?|млн|миллион[а-яa-z]*)?(?![а-яa-z])/g, ' ')
          .replace(rx(`\\b<(${Object.keys(WORDS).join('|')}|${Object.keys(MULT).join('|')})\\b>`, 'g'), ' ')
          .replace(rx('\\b<(я|мне|у меня|сегодня|рублей|рубля|рубль|руб|р|₽|долларов|евро|в бюджет|в расходы|в доходы|как|это|ещё|еще|всего|уже|тут|вот|пожалуйста|деньги|денег)\\b>', 'g'), ' ')
          .replace(/₽|\$|€/g, ' ');
        note = tidy(note).replace(/^(на|за|в|во|от|с|по|к|для)\s+/, '').replace(/\s+(на|за|в|от)$/, '');
        return { action: 'budget.add', args: { kind, amount, cat, note: cap(tidy(note)).slice(0, 60), day: d.day } };
      }
    }
  }

  // music: «включи радио джаз», «поставь Tenca», «хочу послушать что-нибудь спокойное»
  m = rx('^(?:включи|включить|врубай|вруби|врубить|поставь|поставить|сыграй|сыграть|играй|запусти|запустить|хочу\\s+послушать|давай\\s+послушаем|послушаем|можно\\s+послушать)\\b>\\s*', 'd').exec(t);
  if (m && !question && !NOT_PLAY.test(t)) {
    const isRun = /^запуст/.test(t), musical = rx('\\b<(музык|радио|трек|песн|плейлист|альбом|станци|джаз|рок|поп|классик)').test(t);
    if (!isRun || musical) {
      const radio = rx('\\b<(радио|радиостанци[а-яa-z]*|станци[а-яa-z]*|эфир)').test(t), tag = genreOf(t);
      let query = o.slice(m.indices[0][1]);
      query = tidy(query.replace(MUSIC_FILL, ' '));
      if (tag && rx(`^(?:${GENRES.find((g) => g[0] === tag)[1]})[а-яa-z-]*$`, 'i').test(query)) query = '';           // «джаз» is a genre, not a station's name
      if (VAGUE.test(query)) query = '';
      return { action: 'music.play', args: { query: query.slice(0, 60), radio, tag } };
    }
  }
  return null;
}

/** Words that smell like a command the parser could not read for sure — only then is a model asked. */
export const looksLikeAction = (text) => {
  const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
  return t.length < 220 && !Q.test(t) && rx('\\b<(потрат|заплатил|оплатил|купил|доход|зарплат|расход|запомни|в мозг|в память|накоп|включи|поставь|послушать|радио|музык|открой|создай встречу|созвон|баланс|сколько я)').test(t);
};

/** The prompt for the one small model call when the parser is unsure. */
export const GUESS = `Ты разбираешь короткую команду человека для приложения VITON13. Если человек просит сделать одно из действий ниже — верни его. Иначе верни {"action":"none"}.
Действия и args:
- budget.add — записать трату или доход: {"kind":"out"|"in","category":"Еда|Кафе|Транспорт|Жильё|Связь|Здоровье|Одежда|Развлечения|Подписки|Образование|Подарки|Зарплата|Подработка|Подарок|Другое","note":"на что, 1–3 слова"} — только если сумма есть в тексте;
- budget.goal — цель накопить: {"title":"на что"} — только если сумма есть в тексте;
- budget.report — сколько потрачено или заработано, какой баланс: {};
- brain.add — запомнить мысль: {"cat":"knowledge|people|goals|tasks|ideas|money|emotions|mood|said","text":"что запомнить"};
- music.play — включить музыку или радио: {"query":"исполнитель, трек или станция","radio":true|false};
- open — открыть раздел: {"world":"cinema|budget|music|brain|memory|messages|meet|browser|apps|journal|store|medicine|hub|settings"};
- meet.create — начать видеовстречу: {"title":""}.
Вопросы о ценах и о мире, просьбы объяснить, советы и рассказы о себе — это {"action":"none"}. Сумм и дат не придумывай.
Ответ строго JSON: {"action":"budget.add","args":{}}`;

/** A model's guess, checked: only known actions, only categories that exist, and the sum always from the text itself. */
export function checkGuess(g, text, now = new Date()) {
  if (!g || typeof g !== 'object' || !ACTIONS.includes(g.action)) return null;
  const a = g.args && typeof g.args === 'object' ? g.args : {}, s = (v, n) => tidy(String(v ?? '')).slice(0, n);
  text = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const amount = parseAmount(parseDay(text, now).cut ? String(text).replace(parseDay(text, now).cut, ' ') : text);
  switch (g.action) {
    case 'budget.add': { if (!amount) return null; const kind = a.kind === 'in' ? 'in' : 'out', cat = BUDGET_CATS[kind].includes(a.category) ? a.category : guessCat(text, kind);
      return { action: 'budget.add', args: { kind, amount, cat, note: cap(s(a.note, 60)), day: parseDay(text, now).day } }; }
    case 'budget.goal': { const dl = parseDeadline(text, now), n = parseAmount(dl.cut ? text.replace(dl.cut, ' ') : text); if (!n) return null; return { action: 'budget.goal', args: { title: cap(s(a.title, 80)) || 'Цель', target: n, deadline: dl.deadline } }; }
    case 'budget.report': return { action: 'budget.report', args: { period: /прошл\S*\s+месяц/i.test(text) ? 'prev' : 'month', cat: null, focus: /баланс|остат|осталось/i.test(text) ? 'balance' : 'month' } };
    case 'brain.add': { const tx = s(a.text, 240); if (tx.length < 3) return null; return { action: 'brain.add', args: { cat: BRAIN_CATS.includes(a.cat) ? a.cat : 'knowledge', text: cap(tx) } }; }
    case 'music.play': { let q = tidy(s(a.query, 60).replace(MUSIC_FILL, ' ')); if (VAGUE.test(q)) q = ''; return { action: 'music.play', args: { query: q, radio: !!a.radio, tag: genreOf(text) } }; }
    case 'open': return WORLD_NAMES[a.world] && a.world !== 'vit' ? { action: 'open', args: { world: a.world } } : null;
    case 'meet.create': return { action: 'meet.create', args: { title: s(a.title, 80) } };
  }
  return null;
}

/** A plain command the rules read on their own needs no model: it does not use up VIT's trial answers. The money report does — it is VIT reading your numbers. */
export const isFree = (text) => { const a = detect(text); return !!a && a.action !== 'budget.report'; };
