// VITON13 Store inside VIT: the same offers, prices and photos the store publishes in its public product feed.
const FEED = 'https://www.viton13.com/feeds/store-yandex.xml', TTL = 10 * 60e3, UA = 'VIT/0.1 (+https://viton13.com)';
let cache = { at: 0, data: null }, loading = null;
const un = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const one = (xml, tag) => un((xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1]);
const okUrl = (u) => /^https:\/\/([a-z0-9-]+\.)?viton13\.com\//i.test(u);

function parse(xml) {
  const cats = new Map(); for (const m of xml.matchAll(/<category id="(\d+)"(?: parentId="(\d+)")?>([^<]*)<\/category>/g)) cats.set(m[1], { name: un(m[3]), parent: m[2] || '' });
  const items = [];
  for (const m of xml.matchAll(/<offer id="([^"]+)"(?: available="(true|false)")?[^>]*>([\s\S]*?)<\/offer>/g)) {
    const x = m[3], price = Number(one(x, 'price')), cat = cats.get(one(x, 'categoryId')), url = one(x, 'url'); if (!one(x, 'name') || !okUrl(url)) continue;
    items.push({ id: m[1], available: m[2] !== 'false', name: one(x, 'name'), vendor: one(x, 'vendor'), url, price: Number.isFinite(price) ? price : 0, currency: one(x, 'currencyId'), category: cat?.name || '', description: one(x, 'description'),
      pictures: [...x.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => un(p[1])).filter(okUrl).slice(0, 8), params: [...x.matchAll(/<param name="([^"]+)">([^<]*)<\/param>/g)].map((p) => ({ name: un(p[1]), value: un(p[2]) })).slice(0, 6) });
  }
  const vendors = []; for (const it of items) { let v = vendors.find((q) => q.name === it.vendor); if (!v) vendors.push((v = { name: it.vendor, count: 0 })); v.count++; }
  return { shop: one(xml, 'name') || 'VITON13 Store', url: one(xml.split('<categories>')[0] || '', 'url') || 'https://store.viton13.com/ru', vendors, items };
}
async function feed() {
  if (cache.data && Date.now() - cache.at < TTL) return cache.data;
  loading ||= (async () => {
    try { const r = await fetch(FEED, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('HTTP ' + r.status); const data = parse(await r.text()); if (data.items.length) cache = { at: Date.now(), data }; }
    catch (e) { if (!cache.data) throw e; } finally { loading = null; }
    return cache.data;
  })();
  return loading;
}
export async function handle({ seg, method, json }) {
  if (seg[1] !== 'store' || seg[2] || method !== 'GET') return false;
  try { json(200, { ok: true, available: true, ...(await feed()) }); } catch { json(200, { ok: true, available: false, shop: 'VITON13 Store', url: 'https://store.viton13.com/ru', vendors: [], items: [] }); }
  return true;
}
