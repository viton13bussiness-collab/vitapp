// The worlds' marks, VITON13's own: a dark glass disc, one thin geometric line, one point of colour.
// Nothing borrowed from anyone's icon set — each mark is reduced to the idea of its world.
const disc = (p, accent, art) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
  <radialGradient id="${p}d" cx="50%" cy="18%" r="90%"><stop offset="0" stop-color="#3a3a42"/><stop offset=".55" stop-color="#16161b"/><stop offset="1" stop-color="#08080a"/></radialGradient>
  <radialGradient id="${p}a" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${accent}" stop-opacity=".9"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  <linearGradient id="${p}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient></defs>
  <circle cx="50" cy="50" r="50" fill="url(#${p}d)"/>
  <circle cx="50" cy="50" r="49.3" fill="none" stroke="url(#${p}r)" stroke-width="1.4"/>
  <g fill="none" stroke="#f5f5f7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${art(accent, p)}</g></svg>`;
const dot = (x, y, c, p, r = 3.2) => `<circle cx="${x}" cy="${y}" r="${r * 3}" fill="url(#${p}a)" stroke="none" opacity=".55"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="none"/>`;

export const WORLD_ICONS = {
  vit: disc('vi', '#b48cff', (c, p) => `<circle cx="50" cy="50" r="15"/><ellipse cx="50" cy="50" rx="27" ry="9" transform="rotate(-24 50 50)" stroke-opacity=".45"/>${dot(74, 39, c, p)}`),
  brain: disc('br', '#ff7ac6', (c, p) => `<path d="M48 31c-10-2-18 5-17 14-6 3-6 13 1 16 0 7 8 11 16 8z"/><path d="M52 31c10-2 18 5 17 14 6 3 6 13-1 16 0 7-8 11-16 8z"/><path d="M38 47c4 0 6 2 6 6M62 47c-4 0-6 2-6 6" stroke-opacity=".5"/>${dot(60, 40, c, p)}`),
  messages: disc('ms', '#30d158', (c, p) => `<path d="M30 36h40a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H46l-10 8v-8h-6a6 6 0 0 1-6-6V42a6 6 0 0 1 6-6z"/>${dot(62, 50, c, p, 3)}`),
  meet: disc('mt', '#30d158', (c, p) => `<rect x="26" y="34" width="34" height="32" rx="8"/><path d="M60 46l14-8v24l-14-8"/>${dot(43, 50, c, p)}`),
  cinema: disc('cn', '#e9c27a', (c, p) => `<path d="M28 40c14-6 30-6 44 0v20c-14-6-30-6-44 0z"/><path d="M34 70h32" stroke-opacity=".5"/>${dot(50, 50, c, p, 3)}`),
  music: disc('mu', '#ff375f', (c, p) => `<path d="M34 58V42M44 66V34M54 60V40M64 54V46" />${dot(72, 50, c, p, 3)}`),
  browser: disc('mr', '#0a84ff', (c, p) => `<circle cx="50" cy="50" r="22"/><ellipse cx="50" cy="50" rx="9" ry="22" stroke-opacity=".5"/><path d="M28 50h44" stroke-opacity=".5"/>${dot(50, 28, c, p)}`),
  budget: disc('bu', '#34e0a1', (c, p) => `<path d="M30 66h40"/><path d="M36 58v-8M46 58V44M56 58V38" />${dot(66, 32, c, p)}`),
  apps: disc('ap', '#64d2ff', (c, p) => `<rect x="30" y="30" width="18" height="18" rx="5"/><rect x="52" y="30" width="18" height="18" rx="5"/><rect x="30" y="52" width="18" height="18" rx="5"/>${dot(61, 61, c, p, 4)}`),
  journal: disc('jr', '#e8c48a', (c, p) => `<path d="M50 36c-6-4-14-5-20-3v32c6-2 14-1 20 3M50 36c6-4 14-5 20-3v32c-6-2-14-1-20 3M50 36v32"/>${dot(62, 28, c, p, 2.8)}`),
  store: disc('st', '#ff9f0a', (c, p) => `<path d="M32 42h36l-3 26H35z"/><path d="M42 42v-4a8 8 0 0 1 16 0v4"/>${dot(50, 56, c, p, 3)}`),
  medicine: disc('md', '#ff453a', (c, p) => `<path d="M26 52h12l5-10 7 18 5-8h19"/>${dot(74, 52, c, p, 3)}`),
  hub: disc('hb', '#5e5ce6', (c, p) => `<circle cx="38" cy="38" r="6"/><circle cx="62" cy="38" r="6"/><circle cx="38" cy="62" r="6"/>${dot(62, 62, c, p, 6)}`),
  settings: disc('se', '#8e8e93', (c, p) => `<path d="M30 40h40M30 60h40" stroke-opacity=".55"/><circle cx="42" cy="40" r="5" fill="#16161b"/>${dot(60, 60, '#f5f5f7', p, 5)}`),
};

/** worldIcon(id) → an element holding the world's mark (empty when a world has none). */
export function worldIcon(id) { const span = document.createElement('span'); span.className = 'wi'; span.innerHTML = WORLD_ICONS[id] || ''; return span; }
