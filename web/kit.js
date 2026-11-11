// Shared kit for the app and every world: DOM helper, icons, API calls, toast, dates, safe Markdown.
// ── tiny helpers ────────────────────────────────────────────────────────────
export const $ = (sel, el = document) => el.querySelector(sel);
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
export const ICON = {
  vit: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  memory: '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="8" r="2.2"/><circle cx="12" cy="17.5" r="2.2"/><path d="M8.2 7.2l7.6.6M7.1 8.9l3.8 6.7M16.9 9.9l-3.7 5.8"/>',
  works: '<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  requests: '<path d="M20.5 3.5L3.5 10.2l6.3 2.6 2.6 6.7z"/><path d="M9.8 12.8l4.6-3.8"/>',
  agents: '<circle cx="8" cy="8" r="3"/><circle cx="16.6" cy="9" r="2.4"/><path d="M2.8 19c.6-3.2 2.7-5 5.2-5s4.6 1.8 5.2 5M14.8 14.2c2.5-.3 4.9 1.300 5.700 4.300"/>',
  settings: '<path d="M4 7h8M17 7h3M4 17h3M12 17h8"/><circle cx="14.5" cy="7" r="2.3"/><circle cx="9.500" cy="17" r="2.300"/>',
  home: '<path d="M4.500 11.300L12 5l7.500 6.300V18.500a1 1 0 01-1 1H14.500v-5h-5v5H5.500a1 1 0 01-1-1z"/>',
  journal: '<path d="M6 4.500h9.500a2 2 0 012 2V19.500H8a2 2 0 01-2-2z"/><path d="M6 17.500a2 2 0 012-2h9.500M9.500 8.500h4.500"/>',
  store: '<path d="M5.500 8.500h13l-1 11h-11z"/><path d="M9 8.500V7.500a3 3 0 016 0v1"/>',
  medicine: '<path d="M12 19.500s-7-4.200-7-9.400a4.100 4.100 0 017-2.900 4.100 4.100 0 017 2.900c0 5.200-7 9.400-7 9.400z"/><path d="M8 12.300h2l1.200-2 1.600 3.800 1.200-1.800h2"/>',
  hub: '<rect x="4.500" y="4.500" width="6" height="6" rx="1.800"/><rect x="13.500" y="4.500" width="6" height="6" rx="1.800"/><rect x="4.500" y="13.500" width="6" height="6" rx="1.800"/><rect x="13.500" y="13.500" width="6" height="6" rx="1.800"/>',
  frames: '<rect x="3.500" y="5" width="11.500" height="14" rx="2.500"/><path d="M18 7.500h1a1.500 1.500 0 011.500 1.500v6a1.500 1.500 0 01-1.500 1.500h-1"/>',
  help: '<circle cx="12" cy="12" r="8.500"/><path d="M9.700 9.700a2.400 2.400 0 114 1.800c-.900.700-1.700 1.200-1.700 2.300M12 16.700v.2"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>', search: '<circle cx="11" cy="11" r="6.500"/><path d="M16 16l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  mic: '<rect x="9" y="3.500" width="6" height="11" rx="3"/><path d="M5.500 11.500a6.500 6.500 0 0013 0M12 18v2.500"/>',
  up: '<path d="M12 19V5.500M6 11.500l6-6 6 6"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  back: '<path d="M14.500 5.500L8 12l6.500 6.500"/>', out: '<path d="M10 5H6.500A1.500 1.500 0 005 6.500v11A1.500 1.500 0 006.500 19h11a1.500 1.500 0 001.500-1.500V14M13 5h6v6M19 5l-8 8"/>',
};
export const icon = (name) => h('span', { html: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`, style: 'display:contents' });
export async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: opts.body ? { 'content-type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.message || 'Что-то пошло не так'); return d;
}
export async function stream(path, body, on, signal) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).message || 'Нет связи с VIT');
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('data:')) on(JSON.parse(chunk.slice(5))); } }
}
let toastT = 0;
export function toast(text) { $('.toast')?.remove(); document.body.append(h('div', { class: 'toast', role: 'status' }, text)); clearTimeout(toastT); toastT = setTimeout(() => $('.toast')?.remove(), 3600); }
export const when = (ms) => { const d = new Date(ms), now = new Date(), same = d.toDateString() === now.toDateString(); return same ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };

// ── a small, safe Markdown ──────────────────────────────────────────────────
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function inline(s, sources) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[(\d{1,2})\]/g, (m, n) => { const src = sources?.find((x) => x.n === +n); return src ? `<sup><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title)}">${n}</a></sup>` : m; });
}
export function md(text, sources) {
  const out = []; let list = null, para = [], code = null;
  const flushP = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.t}>`); list = null; } };
  for (const raw of String(text).split('\n')) {
    if (code) { if (/^```/.test(raw.trim())) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(raw); continue; }
    const line = raw.trim(); let m;
    if (/^```/.test(line)) { flushP(); flushL(); code = []; continue; }
    if (!line) { flushP(); flushL(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flushP(); flushL(); const lv = Math.min(4, m[1].length); out.push(`<h${lv}>${inline(m[2], sources)}</h${lv}>`); continue; }
    if ((m = line.match(/^[-*•]\s+(.*)/)) || (m = line.match(/^(\d+)[.)]\s+(.*)/))) { flushP(); const t = m.length === 3 ? 'ol' : 'ul'; if (list?.t !== t) { flushL(); list = { t, items: [] }; } list.items.push(inline(m[m.length - 1], sources)); continue; }
    flushL(); para.push(inline(line, sources));
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); flushP(); flushL();
  return out.join('');
}


/** Load a stylesheet once (worlds bring their own CSS). */
export function css(href) { if (!document.querySelector(`link[href="${href}"]`)) document.head.append(h('link', { rel: 'stylesheet', href })); }
