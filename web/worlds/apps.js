// «Приложения» in VITON13: open-source apps for the Mac from GitHub Releases. A visionOS-style window — a frosted sidebar
// with sections and search, a hero, cards with real versions and sizes. Downloads land in ~/Downloads/VITON13 Apps;
// opening is always the person's click, and macOS checks the app as it would after any browser download.
import { styled, reduced } from '/worlds/_ui.js';

const mb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' ГБ' : n >= 1e6 ? Math.round(n / 1e6) + ' МБ' : Math.max(1, Math.round(n / 1e3)) + ' КБ');
const stars = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' тыс.' : String(n || 0));
const day = (s) => (s ? new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const KIND = { dmg: 'образ диска', pkg: 'установщик', zip: 'архив' };
const ARCH = { arm: 'Apple Silicon', intel: 'Intel', universal: 'универсальная', any: 'для Mac' };

export default function view(ctx) {
  const { h, icon, api, css, toast } = ctx; css('/worlds/_ui.css'); css('/worlds/apps.css');
  const ready = Promise.all([styled('/worlds/_ui.css'), styled('/worlds/apps.css')]);
  const guest = ctx.plan === 'guest', vit = ctx.plan === 'vit';
  let data = null, mine = { items: [], jobs: [] }, section = 'all', query = '', found = null, alive = true, poll = 0, detail = null;

  // ── sidebar ──
  const search = h('input', { class: 'ap-search', type: 'search', placeholder: 'Найти приложение', 'aria-label': 'Найти приложение', autocomplete: 'off', spellcheck: 'false' });
  const nav = h('nav', { class: 'ap-nav', 'aria-label': 'Разделы' });
  const foot = h('div', { class: 'ap-foot' });
  const side = h('aside', { class: 'ap-side' }, h('div', { class: 'ap-brand' }, h('span', { class: 'ap-brand-ic' }, icon('apps')), h('b', null, 'Приложения')),
    h('label', { class: 'ap-find' }, icon('search'), search), nav, foot);
  // ── main ──
  const main = h('div', { class: 'ap-main scroll' });
  const dock = h('div', { class: 'ap-dock', 'aria-live': 'polite' });
  const win = h('div', { class: 'ap-win' }, side, h('section', { class: 'ap-pane' }, main, dock));
  const root = h('div', { class: 'view ap' }, win);

  const avatar = (a) => { const el = h('span', { class: 'ap-ic' }, h('span', { class: 'ap-glyph' }, (a.name || '?')[0]));
    if (a.avatar) el.prepend(h('img', { src: a.avatar, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onload: (e) => e.target.classList.add('in'), onerror: (e) => e.target.remove() })); return el; };
  const jobOf = (a) => mine.jobs.find((j) => j.repo === a.repo && j.status === 'run');
  const have = (a) => mine.items.find((x) => x.repo === a.repo && x.here);

  function action(a, big) {
    const rel = a.release, cls = 'btn w-press ' + (big ? '' : 'sm ');
    if (!rel?.asset) return h('span', { class: 'ap-none' }, 'Нет сборки для Mac');
    const job = jobOf(a);
    if (job) { const p = job.total ? job.got / job.total : 0;
      return h('div', { class: 'ap-prog', style: `--p:${p}` }, h('span', { class: 'ap-ring' }), h('small', null, Math.round(p * 100) + '%'),
        h('button', { class: 'ap-x', title: 'Отменить', 'aria-label': 'Отменить загрузку', onclick: (e) => { e.stopPropagation(); api('/api/apps/jobs/' + job.id, { method: 'DELETE' }).then(refresh); } }, '×')); }
    const got = have(a);
    if (got) return h('button', { class: cls + 'ap-open', onclick: (e) => { e.stopPropagation(); open(got.file); } }, 'Открыть');
    return h('button', { class: cls + 'ghost ap-get', onclick: (e) => { e.stopPropagation(); download(a); } }, 'Скачать', !big && h('small', null, mb(rel.asset.size)));
  }

  function card(a, i) {
    const rel = a.release;
    return h('article', { class: 'ap-card w-press', style: `--i:${Math.min(i, 14)}`, tabindex: '0', role: 'button', 'aria-label': `${a.name}: подробнее`, onclick: () => openDetail(a), onkeydown: (e) => { if (e.key === 'Enter') openDetail(a); } },
      avatar(a), h('div', { class: 'ap-txt' }, h('b', null, a.name), h('p', null, a.text || a.description || '')),
      h('div', { class: 'ap-meta' }, a.license && h('span', null, a.license), a.stars != null && h('span', null, '★ ' + stars(a.stars)), rel?.version && h('span', null, 'v' + rel.version)),
      h('div', { class: 'ap-act' }, action(a)));
  }

  function hero(a) {
    const rel = a.release;
    return h('div', { class: 'ap-hero' }, h('div', { class: 'ap-hero-bg', style: a.avatar ? `--img:url("${a.avatar}")` : '' }),
      h('div', { class: 'ap-hero-in' }, h('span', { class: 'cap' }, 'Открытый код · выбор VITON13'), h('div', { class: 'ap-hero-row' }, avatar(a), h('div', null, h('h2', null, a.name), h('p', null, a.text))),
        h('div', { class: 'ap-hero-meta' }, rel?.version && h('span', null, 'Версия ' + rel.version), rel?.date && h('span', null, day(rel.date)), rel?.asset && h('span', null, mb(rel.asset.size)), a.stars != null && h('span', null, '★ ' + stars(a.stars))),
        h('div', { class: 'ap-hero-act' }, action(a, true), h('button', { class: 'btn ghost w-press', onclick: () => openDetail(a) }, 'Подробнее'))));
  }

  function paintNav() {
    const count = (id) => (id === 'all' ? data.items.length : id === 'mine' ? mine.items.filter((x) => x.here).length : data.items.filter((a) => a.cat === id).length);
    const item = (id, label, ic) => h('button', { class: 'ap-nav-i w-press' + (section === id && !found ? ' on' : ''), onclick: () => { section = id; found = null; search.value = ''; query = ''; paint(); } },
      h('span', { class: 'ap-nav-ic' }, icon(ic)), h('span', { class: 'grow' }, label), h('small', null, String(count(id) || '')));
    nav.replaceChildren(item('all', 'Подборка', 'apps'), ...data.cats.map(([id, name]) => item(id, name, { utils: 'settings', media: 'music', create: 'frames', security: 'lock', dev: 'works' }[id] || 'grid')),
      h('div', { class: 'ap-nav-sep' }), item('mine', 'Мои приложения', 'home'));
    foot.replaceChildren(...[
      vit && vitAsk(),
      h('p', { class: 'ap-fine' }, `Сборки для ${data.arch} · в папку ${data.dir}`),
      guest && h('button', { class: 'ap-fine-link', onclick: () => ctx.upgrade('apps') }, 'Скачивание — с VITON ID')].filter(Boolean));
  }
  function vitAsk() {
    const f = h('input', { class: 'ap-vit-in', placeholder: 'VIT, что поставить для…', 'aria-label': 'Спросить VIT, какое приложение поставить' });
    const go = () => { const t = f.value.trim(); if (!t) return f.focus(); ctx.askVit(`Какие открытые приложения для Mac поставить для задачи: «${t}»? Посмотри сначала мой каталог в «Приложениях»: ${data.items.map((a) => a.name).join(', ')}.`); };
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return h('div', { class: 'ap-vit' }, h('span', { class: 'ap-vit-dot' }), f, h('button', { class: 'ap-vit-go', 'aria-label': 'Спросить', onclick: go }, icon('up')));
  }

  function sectionEl(title, list, sub) { return list.length ? h('section', { class: 'ap-sec' }, h('div', { class: 'ap-sec-h' }, h('h3', null, title), sub && h('span', { class: 'cap' }, sub)), h('div', { class: 'ap-grid' }, list.map(card))) : null; }

  function paint() {
    if (!data) return; paintNav();
    const q = query.toLowerCase(), match = (a) => !q || (a.name + ' ' + a.text + ' ' + a.repo).toLowerCase().includes(q);
    const body = [];
    if (found) {
      body.push(h('div', { class: 'ap-title' }, h('h1', null, `«${found.q}» на GitHub`), h('p', null, found.loading ? 'Ищу проекты и проверяю, есть ли у них сборка для Mac…' : found.error ? found.error : found.items.length ? `Со сборкой для Mac: ${found.items.length}. Всего найдено: ${found.total.toLocaleString('ru-RU')}.` : 'Готовых сборок для Mac среди самых популярных не нашлось.')));
      if (found.loading) body.push(h('div', { class: 'ap-grid' }, Array.from({ length: 6 }, (_, i) => h('div', { class: 'ap-card ap-skel', style: `--i:${i}` }))));
      body.push(sectionEl('Можно скачать', found.items || []));
      if (found.web?.length) body.push(h('section', { class: 'ap-sec' }, h('div', { class: 'ap-sec-h' }, h('h3', null, 'Без сборки для Mac'), h('span', { class: 'cap' }, 'сайт проекта — в Meridian')), h('div', { class: 'ap-grid' }, found.web.map((a, i) => h('article', { class: 'ap-card w-press', style: `--i:${i}`, onclick: () => meridian(a.homepage) }, avatar({ ...a, name: a.repo.split('/')[1] }), h('div', { class: 'ap-txt' }, h('b', null, a.repo.split('/')[1]), h('p', null, a.description)), h('div', { class: 'ap-act' }, h('span', { class: 'btn sm ghost' }, 'Открыть в Meridian')))))));
    } else if (section === 'mine') {
      const list = mine.items.filter((x) => x.here);
      body.push(h('div', { class: 'ap-title' }, h('h1', null, 'Мои приложения'), h('p', null, list.length ? `Скачано в ${data.dir}. Установка и запуск — по вашему щелчку, macOS проверит приложение как обычно.` : 'Здесь появится то, что вы скачаете.')));
      body.push(h('div', { class: 'ap-list' }, list.map((x, i) => { const a = data.items.find((y) => y.repo === x.repo) || { name: x.name, repo: x.repo };
        return h('div', { class: 'ap-row', style: `--i:${i}` }, avatar(a), h('div', { class: 'ap-txt' }, h('b', null, x.name, h('small', null, ' v' + x.version)), h('p', null, `${x.file} · ${mb(x.size)} · ${day(x.at)}`), h('code', { class: 'ap-sha', title: 'SHA-256 скачанного файла' }, 'SHA-256 ' + x.sha256.slice(0, 16) + '…')),
          h('div', { class: 'ap-row-act' }, h('button', { class: 'btn sm w-press', onclick: () => open(x.file) }, 'Открыть'), h('button', { class: 'btn sm ghost w-press', onclick: () => reveal(x.file) }, 'В Finder'),
            h('button', { class: 'icon-btn ap-del', title: 'Удалить загрузку', 'aria-label': 'Удалить загрузку', onclick: () => remove(x) }, '×'))); })));
    } else {
      const list = data.items.filter((a) => (section === 'all' || a.cat === section) && match(a));
      if (section === 'all' && !q) {
        const pick = data.items.find((a) => a.repo === 'iina/iina' && a.release?.asset) || data.items.find((a) => a.release?.asset);
        if (pick) body.push(hero(pick));
        for (const [id, name] of data.cats) body.push(sectionEl(name, data.items.filter((a) => a.cat === id)));
      } else {
        const name = section === 'all' ? 'Подборка' : data.cats.find((c) => c[0] === section)?.[1];
        body.push(h('div', { class: 'ap-title' }, h('h1', null, q ? `Найдено: ${list.length}` : name), h('p', null, q ? 'В каталоге VITON13. Нажмите Enter — поищу на всём GitHub.' : 'Проверенные открытые приложения с настоящими релизами на GitHub.')));
        body.push(h('div', { class: 'ap-grid' }, list.map(card)));
        if (q) body.push(h('button', { class: 'btn ghost w-press ap-more', onclick: () => ghSearch(query) }, icon('search'), `Искать «${query}» на GitHub`));
      }
    }
    if (data.note) body.push(h('p', { class: 'ap-note' }, data.note));
    main.replaceChildren(h('div', { class: 'ap-in' }, ...body.filter(Boolean)));
    paintDock(); if (detail) paintDetail();
  }

  function paintDock() {
    const run = mine.jobs.filter((j) => j.status === 'run'), fail = mine.jobs.filter((j) => j.status === 'fail' && !j.seen);
    dock.classList.toggle('on', !!(run.length || fail.length));
    dock.replaceChildren(...run.map((j) => h('div', { class: 'ap-dock-i' }, h('b', null, j.name), h('span', { class: 'ap-bar' }, h('i', { style: `width:${(j.total ? (j.got / j.total) * 100 : 0).toFixed(1)}%` })), h('small', null, `${mb(j.got)} из ${mb(j.total)}`))),
      ...fail.map((j) => h('div', { class: 'ap-dock-i fail' }, h('b', null, j.name), h('small', null, j.error), h('button', { class: 'ap-x', 'aria-label': 'Скрыть', onclick: () => { j.seen = true; paintDock(); } }, '×'))));
  }

  // ── a sheet with everything about one app ──
  const sheet = h('div', { class: 'ap-sheet', role: 'dialog', 'aria-modal': 'true' }); win.append(sheet);
  function openDetail(a) { detail = a; paintDetail(); requestAnimationFrame(() => sheet.classList.add('on')); }
  function closeDetail() { sheet.classList.remove('on'); detail = null; }
  function paintDetail() {
    const a = detail, rel = a.release, got = have(a), job = mine.jobs.find((j) => j.repo === a.repo && j.status === 'done');
    sheet.replaceChildren(h('div', { class: 'ap-sheet-scrim', onclick: closeDetail }), h('div', { class: 'ap-sheet-card' },
      h('button', { class: 'ap-sheet-x', 'aria-label': 'Закрыть', onclick: closeDetail }, '×'),
      h('div', { class: 'ap-hero-row' }, avatar(a), h('div', null, h('h2', null, a.name), h('p', { class: 'ap-sheet-repo' }, a.repo))),
      h('p', { class: 'ap-sheet-text' }, a.text || a.description),
      a.description && a.text !== a.description && h('p', { class: 'ap-sheet-orig' }, a.description),
      h('dl', { class: 'ap-facts' },
        rel?.version && [h('dt', null, 'Версия'), h('dd', null, rel.version + (rel.date ? ' · ' + day(rel.date) : ''))],
        rel?.asset && [h('dt', null, 'Файл'), h('dd', null, `${rel.asset.name} · ${mb(rel.asset.size)}`)],
        rel?.asset && [h('dt', null, 'Сборка'), h('dd', null, `${ARCH[rel.asset.arch]} · ${KIND[rel.asset.kind] || rel.asset.kind}`)],
        a.license && [h('dt', null, 'Лицензия'), h('dd', null, a.license)],
        a.stars != null && [h('dt', null, 'Звёзды'), h('dd', null, stars(a.stars))],
        (got || job) && [h('dt', null, 'SHA-256'), h('dd', null, h('code', null, (got || job).sha256))]),
      h('div', { class: 'ap-sheet-act' }, action(a, true), got && h('button', { class: 'btn ghost w-press', onclick: () => reveal(got.file) }, 'Показать в Finder'),
        a.homepage && h('button', { class: 'btn ghost w-press', onclick: () => meridian(a.homepage) }, 'Сайт в Meridian'),
        h('button', { class: 'btn ghost w-press', onclick: () => meridian(a.url || `https://github.com/${a.repo}`) }, 'GitHub')),
      h('p', { class: 'ap-sheet-fine' }, guest ? 'Скачивание и запуск — с VITON ID. Смотреть каталог можно и гостем.'
        : 'Файл скачивается прямо с GitHub. VITON13 ничего не ставит сам: вы открываете файл, а macOS проверяет приложение, как после загрузки в браузере.')));
  }

  // ── actions ──
  async function download(a) {
    if (guest) { toast('Скачивание — с VITON ID'); return ctx.upgrade('apps'); }
    try { const d = await api('/api/apps/download', { body: { repo: a.repo, asset: a.release?.asset?.name } }); mine.jobs = [...mine.jobs.filter((j) => j.id !== d.job.id), d.job]; paint(); watch(); }
    catch (e) { if (e.status === 402) ctx.upgrade('apps'); else toast(e.message); }
  }
  async function open(file) { if (guest) return ctx.upgrade('apps'); try { const d = await api('/api/apps/open', { body: { file } }); toast(d.dry ? 'Проверка: ' + d.cmd : /\.(dmg|pkg)$/i.test(file) ? 'macOS открывает файл — дальше установка как обычно' : 'Открываю — macOS проверит приложение'); refresh(); } catch (e) { toast(e.message); if (e.status === 402) ctx.upgrade('apps'); } }
  async function reveal(file) { try { const d = await api('/api/apps/reveal', { body: { file } }); if (d.dry) toast('Проверка: ' + d.cmd); } catch (e) { toast(e.message); } }
  async function remove(x) { if (!confirm(`Удалить ${x.file} из папки загрузок?`)) return; try { await api('/api/apps/mine/' + encodeURIComponent(x.file), { method: 'DELETE' }); refresh(); } catch (e) { toast(e.message); } }
  function meridian(url) {                                       // open a site in the built-in browser
    if (!/^https?:\/\//.test(url || '')) return;
    ctx.go('browser', { url });
  }
  async function refresh() {
    try { mine = await api('/api/apps/mine'); } catch { /* keep the last state */ }
    if (alive) paint();
    if (!mine.jobs.some((j) => j.status === 'run')) { clearInterval(poll); poll = 0; }
  }
  const watch = () => { if (!poll) poll = setInterval(refresh, 450); };
  async function ghSearch(q) {
    q = q.trim(); if (q.length < 2) return; found = { q, loading: true, items: [] }; paint();
    try { const d = await api('/api/apps/search?q=' + encodeURIComponent(q)); if (found?.q === q) found = { q, ...d }; }
    catch (e) { if (found?.q === q) found = { q, items: [], error: e.status === 429 ? e.message : 'Поиск по GitHub сейчас недоступен: ' + e.message }; }
    if (alive) paint();
  }
  search.addEventListener('input', () => { query = search.value.trim(); found = null; if (section === 'mine') section = 'all'; paint(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') ghSearch(search.value); if (e.key === 'Escape') { search.value = ''; query = ''; found = null; paint(); } });
  const onKey = (e) => { if (e.key === 'Escape' && detail) closeDetail(); }; window.addEventListener('keydown', onKey);

  main.append(h('div', { class: 'ap-in' }, h('div', { class: 'ap-grid' }, Array.from({ length: 8 }, (_, i) => h('div', { class: 'ap-card ap-skel', style: `--i:${i}` })))));
  ready.then(async () => {
    try { [data, mine] = await Promise.all([api('/api/apps'), api('/api/apps/mine')]); }
    catch (e) { main.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Каталог не загрузился'), e.message)); return; }
    if (!alive) return; paint(); if (mine.jobs.some((j) => j.status === 'run')) watch();
    if (!reduced()) root.classList.add('in');
  });
  return { root, destroy() { alive = false; clearInterval(poll); window.removeEventListener('keydown', onKey); } };
}
