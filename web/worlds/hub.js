// VITON13 HUB in VIT: the ecosystem's services and the public feed of apps, games and experiments from hub.viton13.com.
export default function view(ctx) {
  const { h, icon, api, css } = ctx; css('/worlds/hub.css');
  const search = h('input', { class: 'field hb-search', type: 'search', placeholder: 'Найти приложение или сервис', 'aria-label': 'Поиск по Hub', autocomplete: 'off' });
  const body = h('div', { class: 'hb-body' }), count = h('span', { class: 'cap' });
  const root = h('div', { class: 'view hb' }, h('div', { class: 'hb-scroll scroll' }, h('div', { class: 'hb-in' },
    h('header', { class: 'hb-head' }, h('div', null, h('h1', null, 'Hub'), h('p', null, 'Сервисы экосистемы VITON13 и всё, что в ней собрано с ИИ: приложения, игры, эксперименты.')), count), search, body)));
  let data = null, alive = true;

  const glyph = (name, i) => h('span', { class: 'hb-glyph', style: `--k:${i % 6}` }, name.replace(/^VITON13\s*/i, '').trim()[0] || 'V');
  const service = (s, i) => h('article', { class: 'hb-tile glass' }, glyph(s.name, i), h('div', { class: 'hb-text' }, h('b', null, s.name), h('p', null, s.text)),
    h('div', { class: 'hb-acts' }, s.world && h('button', { class: 'btn sm', onclick: () => ctx.go(s.world) }, 'Открыть здесь'), h('a', { class: 'btn sm ' + (s.world ? 'ghost' : ''), href: s.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${s.name}: открыть на сайте` }, s.world ? 'Сайт' : 'Открыть', icon('out'))));
  const app = (a, i) => { const pic = h('span', { class: 'hb-cover' }); if (a.cover) pic.append(h('img', { src: a.cover, alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => { e.target.remove(); pic.append(glyph(a.name, i)); } })); else pic.append(glyph(a.name, i));
    return h('article', { class: 'hb-tile hb-app glass' }, pic, h('div', { class: 'hb-text' }, h('b', null, a.name), h('p', null, a.text || a.tagline)),
      h('div', { class: 'hb-acts' }, h('a', { class: 'btn sm', href: a.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${a.name}: открыть` }, 'Открыть', icon('out')))); };

  function paint() {
    const q = search.value.trim().toLowerCase(), hit = (...t) => !q || t.some((x) => String(x || '').toLowerCase().includes(q));
    const services = data.services.filter((s) => hit(s.name, s.text)), groups = data.groups.map((g) => ({ ...g, items: g.items.filter((a) => hit(a.name, a.tagline, a.text)) })).filter((g) => g.items.length);
    const section = (title, n, tiles, cls = '') => h('section', { class: 'hb-sec' }, h('div', { class: 'hb-sec-head' }, h('h2', null, title), h('span', { class: 'cap' }, String(n))), h('div', { class: 'hb-grid ' + cls }, tiles));
    body.replaceChildren(...(services.length ? [section('Сервисы VITON13', services.length, services.map(service), 'hb-wide')] : []), ...groups.map((g) => section(g.name, g.items.length, g.items.map(app))),
      !data.available && !q && h('div', { class: 'hb-note glass' }, 'Лента приложений с hub.viton13.com сейчас недоступна. Сервисы экосистемы открываются как обычно.'),
      !services.length && !groups.length && h('div', { class: 'empty' }, h('b', null, 'Ничего не нашлось'), 'Попробуйте другое слово.'));
  }
  search.addEventListener('input', () => data && paint());
  body.append(h('div', { class: 'empty' }, 'Открываю Hub…'));
  api('/api/hub').then((d) => { if (!alive) return; data = d; count.textContent = d.total ? `${d.services.length} сервисов · ${d.total} в ленте` : `${d.services.length} сервисов`; paint(); })
    .catch((e) => { if (alive) body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Hub не открылся'), e.message)); });
  return { root, destroy() { alive = false; } };
}
