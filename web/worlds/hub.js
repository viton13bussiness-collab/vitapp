// VITON13 HUB in VIT: the ecosystem's services and the public feed of apps, games and experiments from hub.viton13.com.
// Services are doors (some lead to a world inside this app); the feed is a wall of covers. Search filters as you type.
import { head, styled, skeleton, reduced } from '/worlds/_ui.js';

export default function view(ctx) {
  const { h, icon, api, css } = ctx; css('/worlds/_ui.css'); css('/worlds/hub.css');
  const ready = Promise.all([styled('/worlds/_ui.css'), styled('/worlds/hub.css')]);
  const search = h('input', { class: 'field sm hb-search', type: 'search', placeholder: 'Найти приложение или сервис', 'aria-label': 'Поиск по Hub', autocomplete: 'off', spellcheck: 'false' });
  const top = head(h, { title: 'Hub', controls: [h('label', { class: 'hb-find' }, icon('search'), search)] });
  const tabs = h('div', { class: 'hb-tabs', role: 'group', 'aria-label': 'Разделы Hub' }), body = h('div', { class: 'hb-body' });
  const scroll = h('div', { class: 'hb-scroll scroll' }, h('div', { class: 'hb-in' }, h('p', { class: 'hb-lead' }, 'Сервисы экосистемы VITON13 и всё, что в ней собрано с ИИ: приложения, игры, эксперименты.'), tabs, body));
  const root = h('div', { class: 'view hb' }, top.el, scroll);
  let data = null, alive = true, only = '';

  const glyph = (name, i) => h('span', { class: 'hb-glyph', style: `--k:${i % 6}` }, name.replace(/^VITON13\s*/i, '').trim()[0] || 'V');
  const service = (s, i) => h('article', { class: 'hb-tile hb-service glass', style: `--i:${i}` }, glyph(s.name, i), h('div', { class: 'hb-text' }, h('b', null, s.name), h('p', null, s.text)),
    h('div', { class: 'hb-acts' }, s.world && h('button', { class: 'btn sm w-press', onclick: () => ctx.go(s.world) }, 'Открыть здесь'), h('a', { class: 'btn sm w-press ' + (s.world ? 'ghost' : ''), href: s.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${s.name}: открыть на сайте` }, s.world ? 'Сайт' : 'Открыть', icon('out'))));
  const app = (a, i) => { const pic = h('span', { class: 'hb-cover' });
    if (a.cover) pic.append(h('img', { src: a.cover, alt: '', loading: 'lazy', decoding: 'async', onload: (e) => e.target.classList.add('in'), onerror: (e) => { e.target.remove(); pic.append(glyph(a.name, i)); } })); else pic.append(glyph(a.name, i));
    return h('a', { class: 'hb-tile hb-app w-press', style: `--i:${Math.min(i, 12)}`, href: a.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${a.name}: открыть в Hub` }, pic,
      h('span', { class: 'hb-text' }, h('b', null, a.name), h('span', { class: 'hb-desc' }, a.text || a.tagline || ''), a.author && h('span', { class: 'cap hb-by' }, a.author)), h('span', { class: 'hb-go' }, icon('out'))); };

  function paintTabs() { const groups = [['', 'Всё'], ['services', 'Сервисы'], ...data.groups.map((g) => [g.id, g.name])];
    tabs.replaceChildren(...groups.map(([id, name]) => h('button', { class: 'w-pill w-press' + (id === only ? ' on' : ''), 'aria-pressed': String(id === only), onclick: () => { if (id === only) return; only = id; paintTabs(); paint(); scroll.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); } }, name))); }
  function paint() {
    const q = search.value.trim().toLowerCase(), hit = (...t) => !q || t.some((x) => String(x || '').toLowerCase().includes(q));
    const services = !only || only === 'services' ? data.services.filter((s) => hit(s.name, s.text)) : [];
    const groups = data.groups.filter((g) => !only || only === g.id).map((g) => ({ ...g, items: g.items.filter((a) => hit(a.name, a.tagline, a.text, a.author)) })).filter((g) => g.items.length);
    const section = (title, n, tiles, cls = '') => h('section', { class: 'hb-sec' }, h('div', { class: 'hb-sec-head' }, h('h2', null, title), h('span', { class: 'cap' }, String(n))), h('div', { class: 'hb-grid ' + cls }, tiles));
    body.replaceChildren(...(services.length ? [section('Сервисы VITON13', services.length, services.map(service), 'hb-wide')] : []), ...groups.map((g) => section(g.name, g.items.length, g.items.map(app))),
      !data.available && !q && (!only || only !== 'services') && h('div', { class: 'hb-note glass' }, 'Лента приложений с hub.viton13.com сейчас недоступна. Сервисы экосистемы открываются как обычно.'),
      !services.length && !groups.length && h('div', { class: 'empty' }, h('b', null, 'Ничего не нашлось'), q ? `По запросу «${search.value.trim()}» в Hub ничего нет. Попробуйте другое слово.` : 'В этом разделе пока пусто.'));
  }
  search.addEventListener('input', () => data && paint());
  const onKey = (e) => { if (!root.isConnected) return; if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); search.focus(); } else if (e.key === 'Escape' && e.target === search && search.value) { search.value = ''; paint(); } };
  window.addEventListener('keydown', onKey);

  ready.then(() => { if (alive && !data) body.replaceChildren(h('section', { class: 'hb-sec' }, h('div', { class: 'hb-grid hb-wide' }, skeleton(h, 4, 'hb-sk-service'))), h('section', { class: 'hb-sec' }, h('div', { class: 'hb-grid' }, skeleton(h, 8, 'hb-sk-app')))); });
  Promise.all([api('/api/hub'), ready]).then(([d]) => { if (!alive) return; data = d; top.count(d.total ? `${d.services.length} сервисов · ${d.total} в ленте` : `${d.services.length} сервисов`); paintTabs(); paint(); })
    .catch((e) => { if (alive) body.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Hub не открылся'), e.message)); });
  return { root, destroy() { alive = false; window.removeEventListener('keydown', onKey); } };
}
