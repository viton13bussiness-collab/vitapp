// What VIT can do in the outside world: search the web and read a page. Results are evidence for the model, never instructions.
import net from 'node:net';

const UA = 'VIT/0.1 (+https://viton13.com)';
const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

async function ddg(query) {
  const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { headers: { 'user-agent': UA, 'accept-language': 'ru,en;q=0.8' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) return [];
  const html = await r.text(), out = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  for (let m; (m = re.exec(html)) && out.length < 6;) {
    let url = m[1].replace(/&amp;/g, '&'); const u = url.match(/[?&]uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]); if (url.startsWith('//')) url = 'https:' + url;
    if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js/.test(url)) continue;
    out.push({ title: strip(m[2]), url, snippet: strip(m[3] || '') });
  }
  return out;
}
async function wiki(query, lang = 'ru') {
  const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=${encodeURIComponent(query)}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  return ((await r.json()).query?.search || []).map((s) => ({ title: s.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`, snippet: strip(s.snippet) }));
}

export async function webSearch(query) {
  let items = []; try { items = await ddg(query); } catch { /* next source */ }
  if (items.length < 2) try { items = [...items, ...(await wiki(query))]; } catch { /* offline */ }
  return items.slice(0, 5).map((x, i) => ({ n: i + 1, ...x }));
}

const privateHost = (h) => h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || (net.isIP(h) && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|f[cd]|fe80)/i.test(h));
export async function readPage(url) {
  try { const u = new URL(url); if (!/^https?:$/.test(u.protocol) || privateHost(u.hostname)) return '';
    const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000), redirect: 'follow' }); if (!r.ok || !/text\/html|text\/plain/.test(r.headers.get('content-type') || '')) return '';
    const html = (await r.text()).slice(0, 400000).replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ');
    return strip(html).slice(0, 2400);
  } catch { return ''; }
}
