// VJOURNAL inside VIT. Everything here is what journal.viton13.com already publishes: the public card list and the article pages.
const SITE = 'https://www.viton13.com', HOST = 'https://journal.viton13.com/ru', TTL = 10 * 60e3, UA = 'VIT/0.1 (+https://viton13.com)';
const NAMES = { 'Top News': 'Главное', 'World News': 'Мир', Business: 'Бизнес', AI: 'ИИ', Innovation: 'Инновации', Design: 'Дизайн', Marketing: 'Маркетинг', Sport: 'Спорт', Style: 'Стиль', People: 'Люди',
  'Company News': 'Новости VITON13', Beauty: 'Красота', Travel: 'Путешествия', SMART: 'SMART', 'Real Estate': 'Недвижимость' };
let cache = { at: 0, cards: [], bySlug: new Map() }, loading = null;
const articles = new Map();          // slug → { at, data }

const card = (c) => ({ id: c.id, slug: c.slug, title: c.title, excerpt: c.excerpt || '', category: c.category || '', categoryName: NAMES[c.category] || c.category || '', author: c.author || '', publishedAt: c.publishedAt || '',
  readingTime: c.readingTime || '', cover: c.coverImage ? (c.coverImage.startsWith('http') ? c.coverImage : SITE + c.coverImage) : '', url: `${HOST}/${c.slug}`, featured: !!c.featured, priority: c.featuredPriority || 0 });

async function cards() {
  if (Date.now() - cache.at < TTL && cache.cards.length) return cache;
  loading ||= (async () => {
    try {
      const r = await fetch(`${SITE}/api/journal/cards?locale=ru`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const list = ((await r.json()).cards || []).filter((c) => c && c.slug && /^[\w-]+$/.test(c.slug) && c.title).map(card).sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
      if (list.length) cache = { at: Date.now(), cards: list, bySlug: new Map(list.map((c) => [c.slug, c])) };
    } catch (e) { if (!cache.cards.length) throw e; }                       // keep the last good copy when the site is briefly away
    finally { loading = null; }
    return cache;
  })();
  return loading;
}

// ── article text: only text tags survive ────────────────────────────────────
const KEEP = new Set(['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'strong', 'b', 'em', 'i', 'a', 'br']);
const DROP_WHOLE = /<(script|style|svg|button|form|nav|aside|figure|iframe|video|audio|noscript|template|table|select|picture)\b[\s\S]*?<\/\1>/gi;
function clean(html) {
  let out = '', last = 0; const src = html.replace(DROP_WHOLE, ' ').replace(/<!--[\s\S]*?-->/g, ''), re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  for (let m; (m = re.exec(src));) {
    out += src.slice(last, m.index).replace(/</g, '&lt;'); last = re.lastIndex; const tag = m[2].toLowerCase();
    if (!KEEP.has(tag)) continue;
    if (m[1]) { out += `</${tag}>`; continue; }
    if (tag === 'a') { const href = (m[3].match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1] || ''; out += /^https?:\/\//i.test(href) ? `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">` : '<a>'; }
    else out += `<${tag}>`;
  }
  return (out + src.slice(last).replace(/</g, '&lt;')).replace(/\s+\n/g, '\n').trim();
}
function bodyOf(page) {                                                        // the div whose class starts with JournalArticle_body__, up to its matching close
  const start = page.search(/<div[^>]+class="[^"]*JournalArticle_body__/); if (start < 0) return '';
  const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = start; let depth = 0;
  for (let m; (m = re.exec(page));) { depth += m[1] ? -1 : 1; if (depth === 0) return page.slice(page.indexOf('>', start) + 1, m.index); }
  return '';
}
function ldBody(page) {
  for (const m of page.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); for (const x of Array.isArray(j) ? j : [j]) if (x && typeof x.articleBody === 'string' && x.articleBody.length > 200) return x.articleBody; } catch { /* not this one */ }
  }
  return '';
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function article(c) {
  const hit = articles.get(c.slug); if (hit && Date.now() - hit.at < TTL) return hit.data;
  let html = '';
  try {
    const r = await fetch(c.url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (r.ok) { const page = (await r.text()).slice(0, 1500000), body = bodyOf(page); html = body ? clean(body) : '';
      if (html.replace(/<[^>]+>/g, '').trim().length < 200) { const text = ldBody(page); html = text ? text.split(/\n{2,}|\r\n\r\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('') : ''; } }
  } catch { /* the reader falls back to the site */ }
  const data = { ...c, html };
  if (html) { articles.set(c.slug, { at: Date.now(), data }); if (articles.size > 80) articles.delete(articles.keys().next().value); }
  return data;
}

export async function handle({ url, seg, method, json, fail }) {
  if (seg[1] !== 'journal' || method !== 'GET') return false;
  let data; try { data = await cards(); } catch { json(200, { ok: true, available: false, total: 0, categories: [], featured: null, latest: [], rows: [] }); return true; }
  const all = data.cards;
  if (!seg[2]) {
    const count = {}; for (const c of all) count[c.category] = (count[c.category] || 0) + 1;
    const order = Object.keys(NAMES).filter((k) => count[k]).concat(Object.keys(count).filter((k) => !NAMES[k] && k));
    const featured = all.slice(0, 120).filter((c) => c.featured && c.cover).sort((a, b) => b.priority - a.priority)[0] || all.find((c) => c.cover) || all[0] || null;
    json(200, { ok: true, available: true, total: all.length, categories: order.map((id) => ({ id, name: NAMES[id] || id, count: count[id] })), featured, latest: all.slice(0, 48),
      rows: order.map((id) => ({ id, name: NAMES[id] || id, count: count[id], items: all.filter((c) => c.category === id).slice(0, 14) })) });
    return true;
  }
  if (seg[2] === 'list') { const cat = url.searchParams.get('cat') || '', limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit')) || 48));
    json(200, { ok: true, items: (cat ? all.filter((c) => c.category === cat) : all).slice(0, limit) }); return true; }
  if (seg[2] === 'article') { const c = data.bySlug.get(url.searchParams.get('slug') || ''); if (!c) { fail(404, 'Материал не найден'); return true; } json(200, { ok: true, article: await article(c) }); return true; }
  return false;
}
