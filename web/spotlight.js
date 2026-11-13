// «Поиск по системе» — ⌘K on the Mac, the search button in the bar on a phone. Worlds, settings, the person's thoughts, budget,
// tracks and conversations in one list; Enter opens the first result, and the last two rows always offer «Спросить VIT» and Meridian.
import { h, icon, api, css } from '/kit.js';
import { worldIcon } from '/world-icons.js';
css('/spotlight.css');

const SETTINGS = [['Модели', 'models'], ['Подписка и доступ', 'profile'], ['iPhone и iPad', 'profile'], ['Тематика', 'profile'], ['Данные и экспорт', 'data'], ['Помощь', 'help'], ['Поведение и голос', 'behave']];
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');

/** openSpotlight({ worlds: [[id, name]], go, askVit }) — one at a time; Esc or a click outside closes it. */
export function openSpotlight({ worlds, go, askVit }) {
  if (document.querySelector('.sl')) return document.querySelector('.sl-in')?.focus();
  const input = h('input', { class: 'sl-in', placeholder: 'Поиск по VITON13', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Поиск по системе', enterkeyhint: 'go' });
  const list = h('div', { class: 'sl-list', role: 'listbox' });
  const el = h('div', { class: 'sl', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Поиск', onclick: (e) => { if (e.target === el) close(); } },
    h('div', { class: 'sl-box' }, h('div', { class: 'sl-row' }, icon('search'), input, h('kbd', { class: 'sl-esc' }, 'esc')), list));
  let rows = [], sel = 0, seq = 0, timer = 0;
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 200); window.removeEventListener('keydown', key, true); };
  const pick = (r) => { close(); r.run(); };

  function paint(groups) {
    rows = []; const out = [];
    for (const g of groups) {
      if (!g.items.length) continue;
      out.push(h('div', { class: 'sl-h' }, g.title));
      for (const it of g.items) {
        const i = rows.length; rows.push(it);
        out.push(h('button', { class: 'sl-item' + (i === sel ? ' on' : ''), role: 'option', onmouseenter: () => { sel = i; mark(); }, onclick: () => pick(it) },
          h('span', { class: 'sl-ic' }, it.ic || worldIcon(it.world || 'vit')), h('span', { class: 'sl-t' }, h('b', null, it.title), it.sub && h('small', null, it.sub))));
      }
    }
    list.replaceChildren(...out);
  }
  const mark = () => list.querySelectorAll('.sl-item').forEach((b, i) => { b.classList.toggle('on', i === sel); if (i === sel) b.scrollIntoView({ block: 'nearest' }); });

  async function search() {
    const q = input.value.trim(), n = norm(q), my = ++seq; sel = 0;
    const W = worlds.filter(([, name]) => !n || norm(name).includes(n)).slice(0, n ? 6 : 12)
      .map(([id, name]) => ({ world: id, title: name, sub: 'Открыть', run: () => go(id) }));
    const S = n ? SETTINGS.filter(([t]) => norm(t).includes(n)).map(([t, tab]) => ({ world: 'settings', title: t, sub: 'Настройки', run: () => go('settings', { tab }) })) : [];
    const tail = q ? [
      { world: 'vit', title: `Спросить VIT: «${q}»`, sub: 'Ассистент ответит в разговоре', run: () => askVit(q) },
      { world: 'browser', title: `Искать в Meridian: «${q}»`, sub: 'Весь интернет', run: () => go('browser', { url: 'https://www.google.com/search?q=' + encodeURIComponent(q) }) },
    ] : [];
    paint([{ title: n ? 'Миры' : 'Все миры', items: W }, { title: 'Настройки', items: S }, { title: 'Действия', items: tail }]);
    if (q.length < 2) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      let d = { groups: [] }; try { d = await api('/api/search?q=' + encodeURIComponent(q)); } catch { /* offline: worlds and actions still work */ }
      if (my !== seq) return;
      const mine = d.groups.map((g) => ({ title: g.title, items: g.items.map((it) => ({ world: it.go, title: it.title, sub: it.sub, run: () => go(it.go, it.arg) })) }));
      paint([{ title: 'Миры', items: W }, ...mine, { title: 'Настройки', items: S }, { title: 'Действия', items: tail }]);
    }, 140);
  }
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); pick(rows[sel]); }
  };
  input.addEventListener('input', search);
  window.addEventListener('keydown', key, true);
  document.body.append(el); search();
  requestAnimationFrame(() => { el.classList.add('in'); input.focus(); });
}
