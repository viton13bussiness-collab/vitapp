// Who may use what.
//   guest — a trial on this computer: every world opens, VIT answers a few times so you can feel it.
//   id    — a VITON ID account: every world and tool, you keep track yourself; the VIT assistant is not included.
//   vit   — VITON ID with the VIT subscription: VIT talks, counts the budget for you and fills the brain on its own.
// The subscription comes from the owner list (VIT_OWNER_EMAILS) or from a grant the VITON13 team gives in /team.
import { all, getSetting, setSetting } from './db.mjs';

export const GUEST_TRIAL = 5;                                  // messages to VIT a guest may send
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
  return { plan, ...PLANS[plan], owner: owners().has(email), until: plan === 'vit' && g?.until ? g.until : null, trialLeft: plan === 'guest' ? trialLeft(user) : null, trial: GUEST_TRIAL };
}
export function trialLeft(user) {
  const n = all("SELECT COUNT(*) AS n FROM msgs m JOIN convs c ON c.id = m.conv WHERE c.user = ? AND m.role = 'user'", user.id)[0]?.n || 0;
  return Math.max(0, GUEST_TRIAL - n);
}
/** What VIT may do for this person right now: null when allowed, otherwise the reason to show. */
export function vitBlocked(user) {
  const plan = planOf(user);
  if (plan === 'vit') return null;
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
