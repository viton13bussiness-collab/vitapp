// «Нейросети» — a studio of models on this Mac: chat with any model, an arena of two, one-click text tools, voice, vision and pictures.
// Everything runs here for free; Claude (when a key is set) is the paid part, and Pollinations is the one outside service — for pictures only.

const SVG = {
  chat: '<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-5.3L7 19.5V16h0a2.5 2.5 0 0 1-2-2.5z"/>',
  arena: '<rect x="3.5" y="5" width="7.5" height="14" rx="2"/><rect x="13" y="5" width="7.5" height="14" rx="2"/>',
  tools: '<path d="M12 4.5l1.6 4.3 4.4 1.7-4.4 1.7L12 16.5l-1.6-4.3L6 10.5l4.4-1.7z"/><path d="M18 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  voice: '<path d="M5 10v4M8.5 7.5v9M12 5v14M15.5 8v8M19 10.5v3"/>',
  vision: '<path d="M2.8 12S6 6 12 6s9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.8"/>',
  image: '<rect x="4" y="4.5" width="16" height="15" rx="3"/><circle cx="9" cy="9.5" r="1.7"/><path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/>',
  models: '<path d="M12 3.8l7.5 4.2v8L12 20.2 4.5 16V8z"/><path d="M4.8 8.2L12 12.3l7.2-4.1M12 12.3v7.6"/>',
  send: '<path d="M12 19V5.5M6 11.5l6-6 6 6"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  vit: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  finder: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3.2l2 2h5.8A2.5 2.5 0 0 1 20 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/>',
  down: '<path d="M12 5v10.5M7.5 11 12 15.5l4.5-4.5M5 19h14"/>', mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>', plus: '<path d="M12 5v14M5 12h14"/>', cloud: '<path d="M7.5 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17.6 9.3 4.35 4.35 0 0 1 17 18z"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>', right: '<path d="M5 12h14M13 6l6 6-6 6"/>', trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
};
const SECTIONS = [['chat', 'Чат'], ['arena', 'Арена'], ['tools', 'Инструменты'], ['voice', 'Голос'], ['vision', 'Зрение'], ['image', 'Картинки'], ['models', 'Модели']];
const TOOLS = [['short', 'Сократить'], ['translate', 'Перевести RU↔EN'], ['pretty', 'Переписать красиво'], ['threads', 'Пост для Threads'], ['fix', 'Исправить ошибки'], ['explain', 'Объяснить просто'], ['ideas', 'Идеи (10 штук)']];
const VISION_OFFER = [['gemma3:4b', 'Хорошо говорит по-русски, понимает фото и скриншоты.'], ['moondream:1.8b', 'Самая маленькая: быстро опишет картинку, отвечает по-английски.']];
const MAX = 5000;
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const GB = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} ГБ` : n >= 1e6 ? `${Math.round(n / 1e6)} МБ` : `${Math.max(1, Math.round(n / 1e3))} КБ`);
const sec = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
const PREF = ['qwen3:4b-instruct', 'qwen3:8b', 'qwen3:4b', 'gemma3:4b'];

/** POST and read server-sent events; a non-OK answer becomes an error with its status and code. */
async function sse(path, body, on, signal, raw) {
  const res = await fetch(path, { method: 'POST', headers: raw ? { 'content-type': raw.type } : { 'content-type': 'application/json' }, body: raw ? raw.body : JSON.stringify(body), signal });
  if (!res.ok || !res.body) { const d = await res.json().catch(() => ({})); throw Object.assign(new Error(d.message || 'Нет связи с сервером'), { status: res.status, code: d.code }); }
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, i); buf = buf.slice(i + 2); if (c.startsWith('data:')) on(JSON.parse(c.slice(5))); } }
}

export default function view(ctx) {
  const { h, api, toast, css } = ctx;
  css('/worlds/ai.css');
  const ic = (name, cls = '') => h('span', { class: 'ai-ic ' + cls, html: `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>` });
  const btn = (label, onclick, cls = '', icon) => h('button', { class: 'ai-btn ' + cls, onclick }, icon && ic(icon), label && h('span', null, label));
  const later = []; let alive = true, S = null, sect = store.get('vit.ai.sect', 'chat');
  if (!SECTIONS.some(([id]) => id === sect)) sect = 'chat';
  const paints = new Set();                                         // streaming re-renders, one per frame
  const frame = (fn) => { if (paints.has(fn)) return; paints.add(fn); requestAnimationFrame(() => { paints.delete(fn); if (alive) fn(); }); };
  const mdInto = (el, text) => { el.innerHTML = ctx.md(text); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch { toast('Не получилось скопировать'); } };
  const reveal = async (kind, name) => { try { await api('/api/ai/reveal', { body: { kind, name } }); } catch (e) { toast(e.message); } };
  const onErr = (e, el) => { if (e.name === 'AbortError') return; if (e.status === 402) { ctx.upgrade?.(e.code === 'ai' ? 'ai' : 'ai-cloud'); } if (el) el.replaceChildren(h('p', { class: 'ai-err' }, e.message)); else toast(e.message); };
  const autosize = (ta) => { const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; }; ta.addEventListener('input', fit); requestAnimationFrame(fit); return ta; };
  const area = (ph, key, rows = 4) => { const ta = h('textarea', { class: 'ai-area', rows, maxlength: MAX, placeholder: ph }); if (key) { ta.value = store.get(key, ''); ta.addEventListener('input', () => store.set(key, ta.value)); } return ta; };
  const counter = (ta) => { const c = h('small', { class: 'ai-count' }); const f = () => { c.textContent = ta.value.length > MAX * 0.8 ? `${ta.value.length} / ${MAX}` : ''; }; ta.addEventListener('input', f); f(); return c; };
  /** Reasoning-only models think before they answer: the thinking folds into a quiet line above the answer. */
  const thinker = () => { let txt = '', on = false; const sum = h('summary', null, 'Думает…'), body = h('div', { class: 'ai-think-t' }), el = h('details', { class: 'ai-think' }, sum, body);
    return { el, add(t) { txt += t; if (!on) { on = true; el.classList.add('on'); } sum.textContent = `Думает… ${txt.length} зн.`; frame(this.draw ||= () => { body.textContent = txt; }); },
      done() { if (on) sum.textContent = `Размышления · ${txt.length} зн.`; } }; };
  const local = () => S.models.map((m) => m.id);
  const defLocal = () => PREF.find((p) => local().includes(p)) || local()[0] || '';

  /** The model picker: models on this Mac first, Claude below marked as part of the subscription. */
  function picker(key, { cloud = true, vision = false, fallback } = {}) {
    const list = vision ? S.models.filter((m) => m.vision) : S.models;
    let val = store.get(key, ''); if (!list.some((m) => m.id === val) && !(cloud && S.cloud.some((c) => c.id === val && S.cloudOk))) val = fallback || (vision ? list[0]?.id : defLocal()) || '';
    const sel = h('select', { class: 'ai-sel', 'aria-label': 'Модель' },
      h('optgroup', { label: 'На этом Mac · бесплатно' }, list.map((m) => h('option', { value: m.id, selected: m.id === val }, m.id + (m.params ? ` · ${m.params}` : '') + (m.reasoner ? ' · рассуждает' : '')))),
      cloud && S.cloud.length && h('optgroup', { label: 'Облако · по подписке VIT' }, S.cloud.map((c) => h('option', { value: c.id, selected: c.id === val }, c.name + (S.cloudOk ? ' · облако' : ' · нужна подписка VIT')))));
    sel.value = val; let prev = val;
    sel.addEventListener('change', () => { if (sel.value.startsWith('cloud:') && !S.cloudOk) { sel.value = prev; ctx.upgrade?.('ai-cloud'); return; } prev = sel.value; store.set(key, sel.value); });
    return sel;
  }
  const nameOf = (id) => S.cloud.find((c) => c.id === id)?.name || id;
  const noModels = () => h('div', { class: 'ai-empty' }, h('b', null, S.ollama ? 'На этом Mac пока нет моделей' : 'Ollama не запущена'),
    h('p', null, S.ollama ? 'Поставьте любую открытую модель — бесплатно, она будет работать без интернета.' : 'Откройте Ollama — и модели этого Mac появятся здесь.'),
    btn('Открыть каталог моделей', () => ctx.go('settings', { tab: 'models' }), 'solid', 'models'));

  // ── layout ──
  const nav = h('nav', { class: 'ai-nav', 'aria-label': 'Разделы' }), pane = h('main', { class: 'ai-pane' });
  const brand = h('div', { class: 'ai-brand' }, h('span', { class: 'ai-mark', 'aria-hidden': 'true' }, h('i')), h('b', null, 'Нейросети'));
  const foot = h('p', { class: 'ai-foot' }, 'Модели работают на этом Mac — бесплатно и без интернета.');
  const root = h('div', { class: 'view ai' }, h('div', { class: 'ai-win' }, h('aside', { class: 'ai-side' }, brand, nav, foot), pane));
  function paintNav() { nav.replaceChildren(...SECTIONS.map(([id, label]) => h('button', { class: 'ai-link' + (sect === id ? ' on' : ''), 'aria-current': sect === id ? 'page' : null, onclick: () => open(id) }, ic(id === 'image' ? 'image' : id), h('span', null, label)))); }
  let stopCur = null;
  function open(id, arg) { if (stopCur) { try { stopCur(); } catch { /* already gone */ } stopCur = null; } sect = id; store.set('vit.ai.sect', id); paintNav(); paint(arg); pane.scrollTop = 0; }
  const head = (title, line, ...right) => h('header', { class: 'ai-head' }, h('div', { class: 'ai-head-t' }, h('h1', null, title), line && h('p', null, line)), right.length ? h('div', { class: 'ai-head-r' }, right) : null);
  function paint(arg) {
    if (!S) { pane.replaceChildren(h('div', { class: 'ai-load' }, h('span', { class: 'ai-spin' }))); return; }
    pane.replaceChildren(({ chat, arena, tools, voice, vision, image, models })[sect](arg));
  }

  // ── 1. chat ──
  function chat(arg) {
    const list = h('div', { class: 'ai-msgs', role: 'log', 'aria-live': 'polite' }), sel = picker('vit.ai.model'), ta = autosize(area('Спросите модель о чём угодно', null, 1));
    if (arg?.text) ta.value = arg.text;
    const send = h('button', { class: 'ai-send', 'aria-label': 'Отправить' }, ic('send'));
    let ac = null;
    const bubble = (m) => m.role === 'user' ? h('div', { class: 'ai-msg me' }, h('div', { class: 'ai-bub' }, m.content))
      : h('div', { class: 'ai-msg' }, h('div', { class: 'ai-who' }, ic(String(m.model).startsWith('cloud:') ? 'cloud' : 'models'), nameOf(m.model), m.ms ? h('small', null, sec(m.ms)) : null), h('div', { class: 'ai-md', html: ctx.md(m.content) }));
    const empty = () => h('div', { class: 'ai-hello' }, h('b', null, 'Разговор с моделью напрямую'), h('p', null, 'Без памяти и агентов VIT — чистая модель. Выберите её сверху и спросите что-нибудь.'),
      h('div', { class: 'ai-chips' }, ['Объясни, как работает нейросеть, в трёх предложениях', 'Придумай название для кофейни', 'Напиши хайку про Москву'].map((t) => h('button', { class: 'ai-chip', onclick: () => { ta.value = t; ta.dispatchEvent(new Event('input')); ta.focus(); } }, t))));
    const fill = () => { list.replaceChildren(...(S.history.length ? S.history.map(bubble) : [empty()])); list.scrollTop = list.scrollHeight; };
    fill();
    const busy = (on) => { send.replaceChildren(ic(on ? 'stop' : 'send')); send.setAttribute('aria-label', on ? 'Остановить' : 'Отправить'); send.classList.toggle('on', on); };
    async function go() {
      if (ac) { ac.abort(); return; }
      const text = ta.value.trim(); if (!text || !sel.value) return;
      ta.value = ''; ta.dispatchEvent(new Event('input'));
      if (!S.history.length) list.replaceChildren();
      const um = { role: 'user', content: text }; S.history.push(um); list.append(bubble(um));
      const body = h('div', { class: 'ai-md' }, h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i'))), time = h('small'), model = sel.value, th = thinker();
      list.append(h('div', { class: 'ai-msg' }, h('div', { class: 'ai-who' }, ic(model.startsWith('cloud:') ? 'cloud' : 'models'), nameOf(model), time), th.el, body)); list.scrollTop = list.scrollHeight;
      let out = ''; ac = new AbortController(); busy(true); stopCur = () => ac?.abort();
      const draw = () => { mdInto(body, out); const near = list.scrollHeight - list.scrollTop - list.clientHeight < 140; if (near) list.scrollTop = list.scrollHeight; };
      try {
        await sse('/api/ai/chat', { model, text }, (d) => {
          if (d.type === 'think') th.add(d.t);
          if (d.type === 'token') { if (!out) th.done(); out += d.t; frame(draw); }
          if (d.type === 'first') time.textContent = 'первый токен ' + sec(d.ms);
          if (d.type === 'done') { th.done(); time.textContent = sec(d.ms); S.history.push({ role: 'assistant', content: out, model, ms: d.ms }); }
          if (d.type === 'error') body.replaceChildren(h('p', { class: 'ai-err' }, d.message));
        }, ac.signal);
        if (!out && !body.querySelector('.ai-err')) body.replaceChildren(h('p', { class: 'ai-err' }, 'Модель ничего не ответила.'));
      } catch (e) { if (e.name === 'AbortError') { if (out) S.history.push({ role: 'assistant', content: out, model }); else body.replaceChildren(h('p', { class: 'ai-fine' }, 'Остановлено.')); } else { S.history.pop(); onErr(e, body); } }
      ac = null; stopCur = null; if (alive) busy(false);
    }
    send.onclick = go;
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
    const clear = btn('Новый разговор', async () => { if (ac) ac.abort(); try { await api('/api/ai/chat', { method: 'DELETE' }); S.history = []; fill(); } catch (e) { toast(e.message); } }, 'ghost sm', 'plus');
    if (!S.models.length && !S.cloud.length) return h('section', { class: 'ai-sec' }, head('Чат', null), noModels());
    return h('section', { class: 'ai-sec ai-chat' }, head('Чат', 'Отдельно от VIT: модель как она есть.', sel, clear), list,
      h('div', { class: 'ai-composer' }, ta, send), h('p', { class: 'ai-fine ai-under' }, sel.value.startsWith('cloud:') ? 'Облачная модель: текст уходит в Anthropic, расход — по подписке VIT.' : 'Ответы считаются на этом Mac. Ничего не уходит в интернет.'));
  }

  // ── 2. arena ──
  function arena() {
    if (S.models.length + (S.cloudOk ? S.cloud.length : 0) < 2) return h('section', { class: 'ai-sec' }, head('Арена', 'Одно задание — две модели рядом.'), S.models.length ? h('div', { class: 'ai-empty' }, h('b', null, 'Нужны две модели'), h('p', null, 'На этом Mac пока одна. Поставьте вторую в каталоге — бесплатно.'), btn('Каталог моделей', () => ctx.go('settings', { tab: 'models' }), 'solid', 'models')) : noModels());
    const second = S.models.find((m) => m.id !== defLocal() && !m.reasoner)?.id || local().find((m) => m !== defLocal()) || defLocal();
    const A = picker('vit.ai.arenaA'), B = picker('vit.ai.arenaB', { fallback: second });
    if (A.value === B.value && second !== A.value) { B.value = second; store.set('vit.ai.arenaB', second); }
    const ta = autosize(area('Одно задание для обеих моделей', 'vit.ai.arenaText', 2)), run = btn('Сравнить', null, 'solid', 'arena');
    const cols = h('div', { class: 'ai-cols' }), votes = h('div', { class: 'ai-vote' }), score = h('div', { class: 'ai-score' });
    const paintScore = () => { const rows = Object.entries(S.score || {}).sort((a, b) => b[1].wins - a[1].wins || b[1].games - a[1].games);
      score.replaceChildren(...(rows.length ? [h('div', { class: 'ai-cap' }, 'Счёт на этом Mac'), ...rows.map(([m, s]) => h('div', { class: 'ai-score-r' }, h('span', null, nameOf(m)), h('i', { style: `--w:${s.games ? (s.wins / s.games) * 100 : 0}%` }), h('small', null, `${s.wins} из ${s.games}`)))] : [])); };
    paintScore();
    const col = (side, id) => { const stat = h('small', { class: 'ai-stat' }, 'ждёт'), body = h('div', { class: 'ai-md' }), th = thinker(); const el = h('article', { class: 'ai-col' }, h('div', { class: 'ai-col-h' }, h('span', { class: 'ai-side-l' }, side.toUpperCase()), h('b', null, nameOf(id)), stat), th.el, body); return { el, stat, body, th, out: '', t: 0 }; };
    let ac = null;
    run.onclick = async () => {
      if (ac) { ac.abort(); return; }
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const a = A.value, b = B.value, C = { a: col('a', a), b: col('b', b) }; cols.replaceChildren(C.a.el, C.b.el); votes.replaceChildren();
      for (const c of Object.values(C)) c.body.append(h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i')));
      ac = new AbortController(); stopCur = () => ac?.abort(); run.querySelector('span:last-child').textContent = 'Остановить'; let ok = 0;
      try {
        await sse('/api/ai/arena', { a, b, text }, (d) => { const c = C[d.side]; if (!c) return;
          if (d.type === 'first') c.stat.textContent = `первый токен ${sec(d.ms)}`;
          if (d.type === 'think') c.th.add(d.t);
          if (d.type === 'token') { if (!c.out) c.th.done(); c.out += d.t; frame(c.draw ||= () => mdInto(c.body, c.out)); }
          if (d.type === 'done') { ok++; c.th.done(); c.stat.textContent = `первый токен ${sec(d.first)} · всего ${sec(d.ms)} · ${c.out.length} зн.`; c.el.classList.add('done'); }
          if (d.type === 'error') { c.body.replaceChildren(h('p', { class: 'ai-err' }, d.message)); c.stat.textContent = 'не ответила'; } }, ac.signal);
        if (ok === 2) votes.replaceChildren(h('span', { class: 'ai-cap' }, 'Какой ответ лучше?'), ...[['a', 'A лучше'], ['tie', 'Ничья'], ['b', 'B лучше']].map(([w, l]) => btn(l, async () => {
          try { await api('/api/ai/vote', { body: { a, b, winner: w, prompt: text } }); for (const m of [a, b]) { S.score[m] ||= { wins: 0, games: 0 }; S.score[m].games++; } if (w !== 'tie') S.score[w === 'a' ? a : b].wins++;
            C.a.el.classList.toggle('win', w === 'a'); C.b.el.classList.toggle('win', w === 'b'); votes.replaceChildren(h('span', { class: 'ai-cap' }, 'Голос сохранён на этом Mac')); paintScore(); } catch (e) { toast(e.message); } }, 'ghost sm')));
      } catch (e) { onErr(e, e.name === 'AbortError' ? null : votes); }
      ac = null; stopCur = null; if (alive) run.querySelector('span:last-child').textContent = 'Сравнить';
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run.click(); });
    return h('section', { class: 'ai-sec' }, head('Арена', 'Одно задание — две модели рядом. Скорость видно сразу, качество решаете вы.'),
      h('div', { class: 'ai-pair' }, h('label', null, h('span', { class: 'ai-cap' }, 'A'), A), h('span', { class: 'ai-vs' }, 'vs'), h('label', null, h('span', { class: 'ai-cap' }, 'B'), B)),
      h('div', { class: 'ai-box' }, ta, h('div', { class: 'ai-row' }, counter(ta), h('span', { class: 'ai-grow' }), run)), cols, votes, score);
  }

  // ── 3. tools ──
  function tools() {
    if (!S.models.length) return h('section', { class: 'ai-sec' }, head('Инструменты', null), noModels());
    let tool = store.get('vit.ai.tool', 'short'); if (!TOOLS.some(([id]) => id === tool)) tool = 'short';
    const chips = h('div', { class: 'ai-chips ai-tools' }), sel = picker('vit.ai.toolModel', { cloud: false }), ta = autosize(area('Вставьте текст или тему', 'vit.ai.toolText', 5)), out = h('div', { class: 'ai-result' });
    const paintChips = () => chips.replaceChildren(...TOOLS.map(([id, l]) => h('button', { class: 'ai-chip' + (id === tool ? ' on' : ''), 'aria-pressed': String(id === tool), onclick: () => { tool = id; store.set('vit.ai.tool', id); paintChips(); } }, l)));
    paintChips();
    let ac = null; const run = btn('Сделать', null, 'solid', 'tools');
    run.onclick = async () => {
      if (ac) { ac.abort(); return; }
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const body = h('div', { class: 'ai-md' }, h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i'))), meta = h('small', { class: 'ai-stat' }), acts = h('div', { class: 'ai-acts' }), label = TOOLS.find(([id]) => id === tool)[1];
      const th = thinker(); out.replaceChildren(h('article', { class: 'ai-card' }, h('div', { class: 'ai-col-h' }, h('b', null, label), meta), th.el, body, acts));
      let res = ''; ac = new AbortController(); stopCur = () => ac?.abort(); run.querySelector('span:last-child').textContent = 'Остановить';
      try {
        await sse('/api/ai/tool', { tool, text, model: sel.value }, (d) => { if (d.type === 'think') th.add(d.t); if (d.type === 'token') { if (!res) th.done(); res += d.t; frame(body.draw ||= () => mdInto(body, res)); } if (d.type === 'done') meta.textContent = `${sel.value} · ${sec(d.ms)}`; if (d.type === 'error') body.replaceChildren(h('p', { class: 'ai-err' }, d.message)); }, ac.signal);
        if (res) acts.replaceChildren(btn('Копировать', () => copy(res), 'ghost sm', 'copy'), btn('Спросить VIT об этом', () => ctx.askVit(`${label}: вот результат модели ${sel.value}.\n\n${res}`.slice(0, 4000)), 'ghost sm', 'vit'));
      } catch (e) { onErr(e, e.name === 'AbortError' ? null : body); }
      ac = null; stopCur = null; if (alive) run.querySelector('span:last-child').textContent = 'Сделать';
    };
    return h('section', { class: 'ai-sec' }, head('Инструменты', 'В один клик на модели этого Mac.', sel), chips,
      h('div', { class: 'ai-box' }, ta, h('div', { class: 'ai-row' }, counter(ta), h('span', { class: 'ai-grow' }), run)), out);
  }

  // ── 4. voice ──
  function voice() {
    const ta = autosize(area('Текст, который прочитает голос macOS', 'vit.ai.sayText', 4)), vsel = h('select', { class: 'ai-sel', 'aria-label': 'Голос' },
      h('option', { value: '' }, 'Голос: по языку текста'), S.voices.ru.length && h('optgroup', { label: 'Русские' }, S.voices.ru.map((v) => h('option', { value: v }, v))), S.voices.en.length && h('optgroup', { label: 'Английские' }, S.voices.en.map((v) => h('option', { value: v }, v))));
    vsel.value = store.get('vit.ai.voice', ''); vsel.onchange = () => store.set('vit.ai.voice', vsel.value);
    const player = h('div', { class: 'ai-player' }), files = h('div', { class: 'ai-files' });
    const showFile = (f, autoplay) => { const au = h('audio', { controls: true, src: f.url, preload: 'metadata' });
      player.replaceChildren(h('div', { class: 'ai-card' }, h('div', { class: 'ai-col-h' }, h('b', null, f.name), f.voice && h('small', { class: 'ai-stat' }, f.voice)), au,
        h('div', { class: 'ai-acts' }, btn('Показать в Finder', () => reveal('voice', f.name), 'ghost sm', 'finder'), h('a', { class: 'ai-btn ghost sm', href: f.url + '?dl=1', download: f.name }, ic('down'), h('span', null, 'Скачать')))));
      if (autoplay) au.play().catch(() => {}); };
    const paintFiles = () => files.replaceChildren(...(S.voiceFiles.length ? [h('div', { class: 'ai-cap' }, 'Недавние'), ...S.voiceFiles.map((f) => h('button', { class: 'ai-file', onclick: () => showFile(f, true) }, ic('play'), h('span', null, f.name), h('small', null, GB(f.size))))] : []));
    paintFiles();
    const go = btn('Озвучить', async () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; } go.disabled = true; go.querySelector('span:last-child').textContent = 'Озвучиваю…';
      try { const d = await api('/api/ai/say', { body: { text, voice: vsel.value } }); S.voiceFiles.unshift({ ...d.file, at: Date.now() }); S.voiceFiles = S.voiceFiles.slice(0, 6); showFile(d.file, true); paintFiles(); }
      catch (e) { toast(e.message); }
      if (alive) { go.disabled = false; go.querySelector('span:last-child').textContent = 'Озвучить'; }
    }, 'solid', 'voice');

    // speech → text: the same whisper the VIT conversation uses
    const sttBox = h('div', { class: 'ai-stt' });
    if (!S.stt) sttBox.append(h('p', { class: 'ai-fine' }, 'Распознавание речи на этом Mac пока не настроено — для него нужны whisper.cpp и модель. Всё остальное в «Нейросетях» работает и без него.'));
    else {
      const mic = h('button', { class: 'ai-mic', 'aria-label': 'Записать голос' }, ic('mic')), state = h('small', { class: 'ai-stat' }, 'Нажмите и говорите'), result = h('div', { class: 'ai-result' });
      let rec = null, media = null, chunks = [], t0 = 0, tick = 0;
      const stopRec = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
      mic.onclick = async () => {
        if (rec) return stopRec();
        try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('Нет доступа к микрофону'); return; }
        chunks = []; rec = new MediaRecorder(media); rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = async () => { media.getTracks().forEach((t) => t.stop()); clearInterval(tick); mic.classList.remove('on'); rec = null; state.textContent = 'Распознаю…';
          try { const res = await fetch('/api/stt', { method: 'POST', body: new Blob(chunks, { type: 'audio/webm' }) }), d = await res.json();
            if (!res.ok) throw new Error(d.message || 'Не получилось распознать речь');
            state.textContent = d.text ? 'Готово' : 'Не расслышал — попробуйте ещё раз';
            if (d.text) result.replaceChildren(h('article', { class: 'ai-card' }, h('p', { class: 'ai-said' }, d.text), h('div', { class: 'ai-acts' }, btn('Копировать', () => copy(d.text), 'ghost sm', 'copy'), btn('В чат', () => open('chat', { text: d.text }), 'ghost sm', 'chat'), btn('Озвучить', () => { ta.value = d.text; ta.dispatchEvent(new Event('input')); go.click(); }, 'ghost sm', 'voice'))));
          } catch (e) { state.textContent = e.message; } };
        rec.start(); t0 = Date.now(); mic.classList.add('on'); state.textContent = 'Запись 0 с · нажмите, чтобы закончить';
        tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); state.textContent = `Запись ${s} с · нажмите, чтобы закончить`; if (s >= 120) stopRec(); }, 500);
      };
      later.push(() => { clearInterval(tick); stopRec(); media?.getTracks().forEach((t) => t.stop()); });
      sttBox.append(h('div', { class: 'ai-row' }, mic, state), result);
    }
    return h('section', { class: 'ai-sec' }, head('Голос', 'Голоса macOS и распознавание речи — на этом Mac.'),
      h('div', { class: 'ai-grid2' },
        h('article', { class: 'ai-panel' }, h('h2', null, 'Озвучить'), h('p', { class: 'ai-fine' }, `Файл сохранится в ${S.folders.voice}.`), h('div', { class: 'ai-box' }, ta, h('div', { class: 'ai-row' }, vsel, h('span', { class: 'ai-grow' }), go)), player, files),
        h('article', { class: 'ai-panel' }, h('h2', null, 'Распознать речь'), h('p', { class: 'ai-fine' }, 'Запись остаётся на этом Mac: её слушает whisper, а не облако.'), sttBox)));
  }

  // ── 5. vision ──
  function vision() {
    const vis = S.models.filter((m) => m.vision);
    if (!vis.length) {
      const box = h('div', { class: 'ai-offer' }, h('span', { class: 'ai-spin' }));
      (async () => {
        let cat; try { cat = await api('/api/catalog'); } catch { box.replaceChildren(h('p', { class: 'ai-err' }, 'Каталог моделей сейчас недоступен.')); return; }
        if (!cat.ollama) { box.replaceChildren(h('p', { class: 'ai-fine' }, 'Ollama не запущена — откройте её, чтобы поставить модель.')); return; }
        box.replaceChildren(...VISION_OFFER.map(([id, why]) => { const m = cat.items.find((x) => x.id === id); if (!m) return null;
          const bar = h('i'), prog = h('span', { class: 'ai-prog' }, bar), status = h('small', { class: 'ai-stat' }, m.fits ? `${GB(m.gb * 1e9)} · бесплатно` : `${GB(m.gb * 1e9)} · памяти может не хватить`);
          const inst = btn(`Установить · ${GB(m.gb * 1e9)}`, async () => {
            inst.disabled = true; prog.classList.add('on'); status.textContent = 'Скачиваю…'; const ac = new AbortController(); later.push(() => ac.abort());
            try { await sse('/api/catalog/pull', { id }, (d) => { if (d.type === 'progress') { bar.style.width = d.pct + '%'; status.textContent = `${d.pct}%`; } if (d.type === 'error') throw new Error(d.message); if (d.type === 'done') status.textContent = 'Готово'; }, ac.signal);
              await reload(); } catch (e) { if (e.name !== 'AbortError') { status.textContent = e.message; inst.disabled = false; } }
          }, 'solid sm', 'down');
          return h('div', { class: 'ai-offer-i' }, h('div', null, h('b', null, m.name), h('p', null, why), status, prog), inst); }).filter(Boolean),
          h('p', { class: 'ai-fine' }, 'Модель скачается с Ollama один раз, дальше картинки описываются без интернета. Ничего не ставится без вашего нажатия.'));
      })();
      return h('section', { class: 'ai-sec' }, head('Зрение', 'Опишет фото, скриншот или документ — на этом Mac.'), h('article', { class: 'ai-panel' }, h('h2', null, 'Нужна модель, которая видит'), h('p', { class: 'ai-fine' }, 'Сейчас на этом Mac нет модели, понимающей картинки. Поставьте маленькую:'), box));
    }
    const sel = picker('vit.ai.visionModel', { cloud: false, vision: true }), q = h('input', { class: 'ai-input', maxlength: 500, placeholder: 'Что спросить о картинке? (необязательно)' });
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true }), prev = h('div', { class: 'ai-prev' }), out = h('div', { class: 'ai-result' });
    let img = null;
    const take = (f) => { if (!f || !/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast('Нужна картинка: PNG, JPG или WebP'); if (f.size > 15 * 1024 * 1024) return toast('Картинка больше 15 МБ');
      img = f; const u = URL.createObjectURL(f); later.push(() => URL.revokeObjectURL(u)); prev.replaceChildren(h('img', { src: u, alt: 'Выбранная картинка' })); drop.classList.add('has'); };
    file.onchange = () => take(file.files[0]);
    const drop = h('button', { class: 'ai-drop', onclick: () => file.click() }, prev, h('span', { class: 'ai-drop-t' }, ic('image'), h('b', null, 'Перетащите картинку'), h('small', null, 'или нажмите, чтобы выбрать')));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
    let ac = null; const run = btn('Описать', async () => {
      if (ac) { ac.abort(); return; } if (!img) { file.click(); return; }
      const body = h('div', { class: 'ai-md' }, h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i'))), meta = h('small', { class: 'ai-stat' }), acts = h('div', { class: 'ai-acts' });
      const th = thinker(); out.replaceChildren(h('article', { class: 'ai-card' }, h('div', { class: 'ai-col-h' }, h('b', null, sel.value), meta), th.el, body, acts));
      let res = ''; ac = new AbortController(); stopCur = () => ac?.abort(); run.querySelector('span:last-child').textContent = 'Остановить';
      try { await sse(`/api/ai/vision?model=${encodeURIComponent(sel.value)}&q=${encodeURIComponent(q.value.trim())}`, null, (d) => { if (d.type === 'think') th.add(d.t); if (d.type === 'token') { if (!res) th.done(); res += d.t; frame(body.draw ||= () => mdInto(body, res)); } if (d.type === 'done') meta.textContent = sec(d.ms); if (d.type === 'error') body.replaceChildren(h('p', { class: 'ai-err' }, d.message)); }, ac.signal, { type: img.type, body: img });
        if (res) acts.replaceChildren(btn('Копировать', () => copy(res), 'ghost sm', 'copy'), btn('Спросить VIT об этом', () => ctx.askVit(`Модель описала картинку так:\n\n${res}`.slice(0, 4000)), 'ghost sm', 'vit'));
      } catch (e) { onErr(e, e.name === 'AbortError' ? null : body); }
      ac = null; stopCur = null; if (alive) run.querySelector('span:last-child').textContent = 'Описать';
    }, 'solid', 'vision');
    return h('section', { class: 'ai-sec' }, head('Зрение', 'Опишет фото, скриншот или документ — на этом Mac.', sel), file, drop, h('div', { class: 'ai-row ai-askrow' }, q, run), out);
  }

  // ── 6. pictures (Pollinations) ──
  function image() {
    if (!S.images) return h('section', { class: 'ai-sec' }, head('Картинки', 'Картинка по описанию.'), h('article', { class: 'ai-panel ai-locked' }, ic('lock'), h('h2', null, 'Картинки — с VITON ID'), h('p', { class: 'ai-fine' }, 'Войдите через VITON ID — и рисуйте бесплатно. Всё остальное в «Нейросетях» доступно и гостю.'), btn('Что входит', () => ctx.upgrade?.('ai'), 'solid')));
    const ta = autosize(area('Опишите картинку: что, где, какой свет и настроение. Лучше по-английски.', 'vit.ai.imgText', 3)), out = h('div', { class: 'ai-result' }), gal = h('div', { class: 'ai-gal' });
    let size = store.get('vit.ai.imgSize', 'square');
    const seg = h('div', { class: 'ai-seg', role: 'group', 'aria-label': 'Формат' }); const paintSeg = () => seg.replaceChildren(...[['square', 'Квадрат'], ['portrait', 'Портрет'], ['landscape', 'Альбом']].map(([id, l]) => h('button', { class: id === size ? 'on' : '', 'aria-pressed': String(id === size), onclick: () => { size = id; store.set('vit.ai.imgSize', id); paintSeg(); } }, l))); paintSeg();
    const show = (f) => out.replaceChildren(h('figure', { class: 'ai-pic' }, h('img', { src: f.url, alt: f.name }), h('figcaption', null, h('span', null, f.name),
      h('div', { class: 'ai-acts' }, btn('Показать в Finder', () => reveal('image', f.name), 'ghost sm', 'finder'), h('a', { class: 'ai-btn ghost sm', href: f.url + '?dl=1', download: f.name }, ic('down'), h('span', null, 'Скачать'))))));
    const paintGal = () => gal.replaceChildren(...(S.pictures.length ? [h('div', { class: 'ai-cap' }, 'Недавние'), h('div', { class: 'ai-thumbs' }, S.pictures.map((f) => h('button', { class: 'ai-thumb', onclick: () => show(f), title: f.name }, h('img', { src: f.url, alt: '', loading: 'lazy' }))))] : []));
    paintGal();
    let timer = 0; const label = (t) => { go.querySelector('span:last-child').textContent = t; };
    const cool = (s) => { clearInterval(timer); go.disabled = true; const end = Date.now() + s * 1000; const f = () => { const left = Math.ceil((end - Date.now()) / 1000); if (left <= 0 || !alive) { clearInterval(timer); go.disabled = false; label('Нарисовать'); } else label(`Можно через ${left} с`); }; f(); timer = setInterval(f, 500); };
    later.push(() => clearInterval(timer));
    const go = btn('Нарисовать', async () => {
      const prompt = ta.value.trim(); if (!prompt) { ta.focus(); return; } go.disabled = true; label('Рисую…');
      out.replaceChildren(h('div', { class: 'ai-pic-wait ' + size }, h('span', { class: 'ai-spin' }), h('small', null, 'Pollinations рисует — обычно 10–30 секунд')));
      try { const d = await api('/api/ai/image', { body: { prompt, size } }); show(d.file); S.pictures.unshift(d.file); paintGal(); cool(45); }
      catch (e) { out.replaceChildren(h('p', { class: 'ai-err' }, e.message)); if (e.status === 402) ctx.upgrade?.('ai'); const m = /(\d+) с/.exec(e.message); if (m) cool(Number(m[1])); else { go.disabled = false; label('Нарисовать'); } }
    }, 'solid', 'image');
    return h('section', { class: 'ai-sec' }, head('Картинки', 'Картинка по описанию — бесплатно.'),
      h('p', { class: 'ai-note' }, ic('cloud'), h('span', null, 'Это единственное, что уходит в интернет: описание отправляется в бесплатный сервис Pollinations (pollinations.ai), картинка сохраняется в ', h('b', null, S.folders.image), '.')),
      h('div', { class: 'ai-box' }, ta, h('div', { class: 'ai-row' }, seg, h('span', { class: 'ai-grow' }), go)), out, gal);
  }

  // ── 7. models ──
  function models() {
    const rows = S.all.slice().sort((a, b) => Number(a.embed) - Number(b.embed) || b.size - a.size);
    return h('section', { class: 'ai-sec' }, head('Модели', S.ollama ? `На этом Mac: ${rows.length}` : 'Ollama не запущена'),
      h('div', { class: 'ai-models' }, rows.map((m) => h('div', { class: 'ai-model' }, ic(m.vision ? 'vision' : m.embed ? 'models' : 'chat'), h('div', null, h('b', null, m.id), h('small', null, [m.params, m.embed ? 'память VIT, не для разговора' : m.vision ? 'понимает картинки' : m.reasoner ? 'рассуждает перед ответом' : 'разговор и текст'].filter(Boolean).join(' · '))), h('span', { class: 'ai-size' }, GB(m.size)))),
        S.cloud.map((c) => h('div', { class: 'ai-model' }, ic('cloud'), h('div', null, h('b', null, c.name), h('small', null, `${c.model} · облако · по подписке VIT`)), h('span', { class: 'ai-size' }, S.cloudOk ? 'подключена' : 'подписка')))),
      h('button', { class: 'ai-more', onclick: () => ctx.go('settings', { tab: 'models' }) }, h('span', null, h('b', null, 'Все открытые модели'), h('small', null, 'Каталог, установка и удаление — в Настройках → Модели')), ic('right')));
  }

  async function reload() { try { S = await api('/api/ai/state'); } catch (e) { if (!S) pane.replaceChildren(h('div', { class: 'ai-empty' }, h('b', null, 'Нейросети не открылись'), h('p', null, e.message))); return; } if (alive) paint(); }
  paintNav(); paint(); reload();
  return { root, destroy() { alive = false; stopCur?.(); later.forEach((f) => { try { f(); } catch { /* gone */ } }); } };
}
