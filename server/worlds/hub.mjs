// VITON13 HUB inside VIT: the ecosystem's own services plus the public feed of apps from hub.viton13.com.
const HUB = 'https://hub.viton13.com', TTL = 10 * 60e3, UA = 'VIT/0.1 (+https://viton13.com)';
// The sections of VITON13 and where each one lives (hosts as the site itself lists them).
const SERVICES = [
  { id: 'studio', name: 'VITON13 Studio', text: 'Услуги студии: дизайн, разработка, маркетинг, видео и работа с ИИ.', url: 'https://studio.viton13.com/ru' },
  { id: 'journal', name: 'VJOURNAL', text: 'Журнал экосистемы: новости, бизнес, технологии, дизайн и люди.', url: 'https://journal.viton13.com/ru', world: 'journal' },
  { id: 'store', name: 'VITON13 Store', text: 'Собственный мультибрендовый магазин: одежда и парфюмерия.', url: 'https://store.viton13.com/ru', world: 'store' },
  { id: 'market', name: 'VIT MARKET', text: 'Каталоги товаров и персональный подбор под запрос.', url: 'https://market.viton13.com/ru' },
  { id: 'medicine', name: 'VITON13 MEDICINE', text: 'Медицинский раздел: анатомия, состояния и маршруты проверки.', url: 'https://medicine.viton13.com/ru', world: 'medicine' },
  { id: 'school', name: 'VITON13 SCHOOL', text: 'Онлайн-курсы школы VITON13.', url: 'https://school.viton13.com/ru' },
  { id: 'hub', name: 'VITON13 HUB', text: 'Лента приложений, игр и сайтов, сделанных с ИИ.', url: 'https://hub.viton13.com/ru' },
  { id: 'support', name: 'Поддержка', text: 'Справка и ответы на вопросы по экосистеме.', url: 'https://support.viton13.com/ru' },
];
const GROUPS = [['app', 'Приложения'], ['game', 'Игры'], ['art', 'Арт и эксперименты'], ['site', 'Сайты']];
let cache = { at: 0, apps: null }, loading = null;
const firstSentence = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(), m = t.match(/^.{20,180}?[.!?](?=\s|$)/); return (m ? m[0] : t.slice(0, 160)).trim(); };
const shape = (a) => { const ru = a.i18n?.ru || {}, full = String(ru.title || a.title || '').trim(), [name, ...rest] = full.split(/\s[-–—:]\s/);
  return { id: a.id, name: name.trim(), tagline: rest.join(' — ').trim(), text: firstSentence(ru.description || a.description), category: a.category || 'app', cover: /^https:\/\//.test(a.coverUrl || '') ? a.coverUrl : '', url: `${HUB}/ru/a/${a.id}`,
    author: a.author?.name || '', likes: a.likeCount || 0 }; };
async function apps() {
  if (cache.apps && Date.now() - cache.at < TTL) return cache.apps;
  loading ||= (async () => {
    try { const list = []; let cursor = '';
      for (let page = 0; page < 3; page++) { const r = await fetch(`${HUB}/api/apps?sort=new${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error('HTTP ' + r.status); const d = await r.json(); for (const a of d.items || []) if (a && /^[a-z0-9]{6,20}$/.test(a.id || '') && a.status === 'published') list.push(shape(a)); cursor = d.next; if (!cursor) break; }
      if (list.length) cache = { at: Date.now(), apps: list.filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i) };
    } catch (e) { if (!cache.apps) throw e; } finally { loading = null; }
    return cache.apps;
  })();
  return loading;
}
export async function handle({ seg, method, json }) {
  if (seg[1] !== 'hub' || seg[2] || method !== 'GET') return false;
  let list = [], available = true; try { list = (await apps()) || []; } catch { available = false; }
  json(200, { ok: true, available, services: SERVICES, groups: [...GROUPS.map(([id, name]) => ({ id, name, items: list.filter((a) => a.category === id) })), { id: 'other', name: 'Другое', items: list.filter((a) => !GROUPS.some(([id]) => id === a.category)) }].filter((g) => g.items.length), total: list.length, url: HUB + '/ru' });
  return true;
}
