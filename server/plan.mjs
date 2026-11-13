// Who may use what.
//   guest — a trial on this computer: every world opens, VIT answers a few times so you can feel it.
//   id    — a VITON ID account: every world and tool, you keep track yourself; the VIT assistant is not included.
//   vit   — VITON ID with the VIT subscription: VIT talks, counts the budget for you and fills the brain on its own.
// The subscription comes from the owner list (VIT_OWNER_EMAILS) or from a grant the VITON13 team gives in /team.
import { all, getSetting, setSetting } from './db.mjs';

export const GUEST_TRIAL = 5;                                  // messages to VIT a guest may send (the owner can change it)
const RANK = { guest: 0, id: 1, vit: 2 };
/** Everything that can be opened or closed per level. `def` is the level it needs out of the box; the owner overrides it in Settings → Управление. */
export const FEATURES = [
  { id: 'vit', name: 'Ассистент VIT', def: 'vit', note: 'Гостю — пробные ответы' },
  { id: 'budget.advice', name: 'Разбор бюджета ассистентом', def: 'vit' },
  { id: 'messages', name: 'Сообщения', def: 'id' },
  { id: 'circles', name: 'Кружки в сообщениях', def: 'id' },
  { id: 'meet', name: 'Встречи и совместный просмотр', def: 'id' },
  { id: 'cinema', name: 'Кинотеатр — прийти по билету', def: 'id' },
  { id: 'cinema.host', name: 'Кинотеатр — проводить сеансы', def: 'vit' },
  { id: 'music.cloud', name: 'VIT Music в облаке', def: 'vit' },
  { id: 'apps', name: 'Скачивание приложений с GitHub', def: 'id' },
  { id: 'ai', name: 'Нейросети на этом Mac', def: 'id' },
  { id: 'ai.cloud', name: 'Облачные модели в Нейросетях', def: 'vit' },
];
const access = () => getSetting('access', {});
export const guestTrial = () => { const n = Number(getSetting('guestTrial', GUEST_TRIAL)); return Number.isFinite(n) ? Math.max(0, Math.min(n, 100)) : GUEST_TRIAL; };
export const needs = (feature) => access()[feature] || FEATURES.find((f) => f.id === feature)?.def || 'vit';
/** May this person use this feature? The owner may use everything. */
export function can(user, feature) {
  if (!user) return false; if (isOwner(user)) return true;
  return RANK[planOf(user)] >= RANK[needs(feature)];
}
export const isOwner = (user) => user?.kind === 'viton' && owners().has(String(user.email || '').toLowerCase());
export function setAccess(feature, plan) { if (!FEATURES.some((f) => f.id === feature) || !(plan in RANK)) return false; const a = access(); a[feature] = plan; setSetting('access', a); return true; }
export function setGuestTrial(n) { n = Math.round(Number(n)); if (!Number.isFinite(n) || n < 0 || n > 100) return false; setSetting('guestTrial', n); return true; }
export const ownerList = () => [...owners()];
export const PLANS = {
  guest: { id: 'guest', name: 'Гость', line: 'Пробный режим на этом компьютере' },
  id: { id: 'id', name: 'VITON ID', line: 'Все миры и инструменты, учёт ведёте сами' },
  vit: { id: 'vit', name: 'VITON ID · VIT', line: 'Ассистент VIT считает и думает за вас' },
};
const owners = () => new Set(['viton13bussiness@gmail.com', ...String(process.env.VIT_OWNER_EMAILS || '').split(',')].map((s) => s.trim().toLowerCase()).filter(Boolean));
const grants = () => getSetting('grants', {});

export function planOf(user) {
  if (!user) return null;
  if (user.kind !== 'viton') return 'guest';
  const email = String(user.email || '').toLowerCase();
  if (owners().has(email)) return 'vit';
  const g = grants()[email];
  return g && (!g.until || g.until > Date.now()) ? 'vit' : 'id';
}
export function subscription(user) {
  const plan = planOf(user), email = String(user?.email || '').toLowerCase(), g = grants()[email];
  return { plan, ...PLANS[plan], owner: isOwner(user), until: plan === 'vit' && g?.until ? g.until : null, trialLeft: plan === 'guest' ? trialLeft(user) : null, trial: guestTrial(),
    can: Object.fromEntries(FEATURES.map((f) => [f.id, can(user, f.id)])) };
}
export function trialLeft(user) {
  const n = all("SELECT COUNT(*) AS n FROM msgs m JOIN convs c ON c.id = m.conv WHERE c.user = ? AND m.role = 'user' AND m.meta NOT LIKE '%\"act\":1%'", user.id)[0]?.n || 0;   // plain commands («потратил 500 на такси») are not VIT answers
  return Math.max(0, guestTrial() - n);
}
/** What VIT may do for this person right now: null when allowed, otherwise the reason to show. */
export function vitBlocked(user) {
  const plan = planOf(user);
  if (can(user, 'vit')) return null;
  if (plan === 'guest') return trialLeft(user) > 0 ? null : { code: 'trial', message: 'Пробные сообщения закончились. Войдите через VITON ID и подключите VIT.' };
  return { code: 'subscribe', message: 'Ассистент VIT входит в подписку. Всё остальное доступно с VITON ID.' };
}

// grants, managed by the team console
export const listGrants = () => Object.entries(grants()).map(([email, g]) => ({ email, ...g })).sort((a, b) => (b.at || 0) - (a.at || 0));
export function setGrant(email, days) {
  const e = String(email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return false;
  const g = grants();
  if (days === 0) delete g[e]; else g[e] = { at: Date.now(), until: days > 0 ? Date.now() + days * 864e5 : null };
  setSetting('grants', g); return true;
}
