// VIT — the app. One page, no build step: the orb, the conversation, memory, works, requests, agents, settings.
import { createOrb } from '/orb.js';
import { createGraph } from '/graph.js';

// ── tiny helpers ────────────────────────────────────────────────────────────
const $ = (sel, el = document) => el.querySelector(sel);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) { if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const ICON = {
  vit: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  memory: '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="8" r="2.2"/><circle cx="12" cy="17.5" r="2.2"/><path d="M8.2 7.2l7.6.6M7.1 8.9l3.8 6.7M16.9 9.9l-3.7 5.8"/>',
  works: '<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  requests: '<path d="M20.5 3.5L3.5 10.2l6.3 2.6 2.6 6.7z"/><path d="M9.8 12.8l4.6-3.8"/>',
  agents: '<circle cx="8" cy="8" r="3"/><circle cx="16.6" cy="9" r="2.4"/><path d="M2.8 19c.6-3.2 2.7-5 5.2-5s4.6 1.8 5.2 5M14.8 14.2c2.5-.3 4.9 1.300 5.700 4.300"/>',
  settings: '<path d="M4 7h8M17 7h3M4 17h3M12 17h8"/><circle cx="14.5" cy="7" r="2.3"/><circle cx="9.500" cy="17" r="2.300"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  mic: '<rect x="9" y="3.500" width="6" height="11" rx="3"/><path d="M5.500 11.500a6.500 6.500 0 0013 0M12 18v2.500"/>',
  up: '<path d="M12 19V5.500M6 11.500l6-6 6 6"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  back: '<path d="M14.500 5.500L8 12l6.500 6.500"/>', out: '<path d="M10 5H6.500A1.500 1.500 0 005 6.500v11A1.500 1.500 0 006.500 19h11a1.500 1.500 0 001.500-1.500V14M13 5h6v6M19 5l-8 8"/>',
};
const icon = (name) => h('span', { html: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`, style: 'display:contents' });
async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: opts.body ? { 'content-type': 'application/json' } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(d.message || 'Что-то пошло не так'); return d;
}
async function stream(path, body, on, signal) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).message || 'Нет связи с VIT');
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('data:')) on(JSON.parse(chunk.slice(5))); } }
}
let toastT = 0;
function toast(text) { $('.toast')?.remove(); document.body.append(h('div', { class: 'toast', role: 'status' }, text)); clearTimeout(toastT); toastT = setTimeout(() => $('.toast')?.remove(), 3600); }
const when = (ms) => { const d = new Date(ms), now = new Date(), same = d.toDateString() === now.toDateString(); return same ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); };

// ── a small, safe Markdown ──────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function inline(s, sources) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[(\d{1,2})\]/g, (m, n) => { const src = sources?.find((x) => x.n === +n); return src ? `<sup><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title)}">${n}</a></sup>` : m; });
}
function md(text, sources) {
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

// ── state ───────────────────────────────────────────────────────────────────
const S = { me: null, conv: null, messages: [], cats: [], agents: [], jobs: new Map(), voice: {}, speak: 'voice', view: 'vit', busy: false, memBadge: 0, reqBadge: 0, version: '' };
const app = $('#app');
if (/Electron/.test(navigator.userAgent)) document.body.classList.add('desktop');
const catOf = (id) => S.cats.find((c) => c.id === id) || { name: id, color: '#86868b' };
const sentProposals = () => { try { return JSON.parse(localStorage.getItem('vit.sent') || '{}'); } catch { return {}; } };

boot();
async function boot() {
  const d = await api('/api/me').catch(() => ({}));
  if (!d.me) return welcome();
  await load(); shell();
}
async function load() {
  const [st, jobs] = await Promise.all([api('/api/state'), api('/api/jobs')]);
  Object.assign(S, { me: st.me, conv: st.conv, messages: st.messages, cats: st.cats, agents: st.agents, voice: st.voice, speak: st.speak, version: st.version });
  S.jobs = new Map(jobs.items.map((j) => [j.id, j]));
}

// ── welcome ─────────────────────────────────────────────────────────────────
function welcome() {
  const canvas = h('canvas'), err = h('div', { class: 'err', role: 'alert' });
  const name = h('input', { class: 'field', placeholder: 'Как к вам обращаться?', autocomplete: 'given-name', maxlength: 40, 'aria-label': 'Ваше имя' });
  const email = h('input', { class: 'field', type: 'email', placeholder: 'Почта VITON ID', autocomplete: 'username', 'aria-label': 'Почта VITON ID' });
  const pass = h('input', { class: 'field', type: 'password', placeholder: 'Пароль', autocomplete: 'current-password', 'aria-label': 'Пароль' });
  let mode = 'local';
  const go = h('button', { class: 'btn lg dark', type: 'submit' }, 'Начать');
  const alt = h('button', { type: 'button', onclick: () => { mode = mode === 'local' ? 'viton' : 'local'; paint(); } });
  const form = h('form', { onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; go.disabled = true;
    try { if (mode === 'local') await api('/api/auth/local', { body: { name: name.value } }); else await api('/api/auth/viton', { body: { email: email.value, password: pass.value } }); orb.stop(); await load(); shell(); }
    catch (ex) { err.textContent = ex.message; go.disabled = false; } } });
  const altLine = h('div', { class: 'alt' });
  function paint() { err.textContent = '';
    form.replaceChildren(...(mode === 'local' ? [name] : [email, pass]), go, err); go.textContent = mode === 'local' ? 'Начать' : 'Войти';
    altLine.replaceChildren(mode === 'local' ? 'Есть аккаунт? ' : 'Без аккаунта? ', alt); alt.textContent = mode === 'local' ? 'Войти через VITON ID' : 'Продолжить без входа';
    (mode === 'local' ? name : email).focus(); }
  app.replaceChildren(h('div', { class: 'welcome' }, h('div', { class: 'welcome-in' }, canvas, h('div', { class: 'wordmark' }, 'VIT'),
    h('h1', null, 'Ваш персональный агент'), h('p', { class: 'lead' }, 'Не чат-бот, который отвечает. Агент, который выполняет.'), form, altLine,
    h('p', { class: 'fine' }, 'Открытый тест · память и диалоги хранятся на вашем компьютере'))));
  const orb = createOrb(canvas); paint();
}

// ── shell ───────────────────────────────────────────────────────────────────
const NAV = [['vit', 'VIT'], ['memory', 'Память'], ['works', 'Работы'], ['requests', 'Заявки'], ['agents', 'Агенты'], ['settings', 'Настройки']];
let main, vitView, current = null, navEls = {};
function shell() {
  navEls = Object.fromEntries(NAV.map(([id, label]) => [id, h('button', { class: 'nav', onclick: () => go(id) }, icon(id), h('span', null, label))]));
  main = h('main', { class: 'main' });
  const me = h('button', { class: 'me', onclick: () => go('settings'), title: 'Профиль и настройки' }, h('span', { class: 'ava' }, (S.me.name || 'V')[0].toUpperCase()),
    h('span', null, h('b', null, S.me.name), h('small', null, S.me.kind === 'viton' ? 'VITON ID' : 'Локальный профиль')));
  app.replaceChildren(h('div', { class: 'shell' }, h('nav', { class: 'side', 'aria-label': 'Разделы' }, h('div', { class: 'brand' }, h('i'), h('span', { class: 'wordmark' }, 'VIT')), Object.values(navEls), h('div', { class: 'grow' }), me), main));
  vitView = buildVit(); main.append(vitView.root);
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'vit', true));
  go(NAV.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'vit', true);
  live(); setTimeout(askFirst, 1800);
}
function badges() { for (const [id, n] of [['memory', S.memBadge], ['requests', S.reqBadge]]) { navEls[id].querySelector('.badge')?.remove(); if (n) navEls[id].append(h('span', { class: 'badge' }, String(n))); } }
function go(view, fromHash, arg) {
  if (!NAV.some(([id]) => id === view)) view = 'vit';
  S.view = view; if (!fromHash && location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  for (const [id, el] of Object.entries(navEls)) { el.classList.toggle('on', id === view); el.setAttribute('aria-current', id === view ? 'page' : 'false'); }
  current?.destroy?.(); current?.root.remove(); current = null;
  vitView.root.classList.toggle('hide', view !== 'vit');
  if (view === 'vit') return vitView.focus();
  current = { memory: viewMemory, works: viewWorks, requests: viewRequests, agents: viewAgents, settings: viewSettings }[view](arg); main.append(current.root);
}
function live() {                                        // request statuses arrive here the moment the team changes them
  const es = new EventSource('/api/events');
  es.onmessage = (e) => { const d = JSON.parse(e.data); if (d.type !== 'request') return; const r = d.request;
    if (r.log.length > 1) { toast(`Заявка №${r.id}: ${r.statusName.toLowerCase()}`); if (S.view !== 'requests') { S.reqBadge++; badges(); } }
    if (S.view === 'requests') go('requests'); };
}
async function askFirst() { if (S.busy) return; try { const d = await api('/api/pulse'); if (d.message && !S.busy) { S.messages.push(d.message); vitView.render(); } } catch { /* quiet */ } }

// ── VIT: the conversation ───────────────────────────────────────────────────
function planEl(job) {
  const done = job.steps.filter((s) => s.status === 'done').length;
  return h('div', { class: 'plan' }, h('div', { class: 'plan-head' }, h('b', null, job.title), h('small', null, `${done} из ${job.steps.length}`)),
    job.steps.map((s) => h('div', { class: 'step ' + s.status }, h('span', { class: 'mark' }, s.status === 'done' ? '✓' : ''),
      h('div', null, h('div', { class: 'who' }, h('i', { style: `background:${s.color}` }), s.name), h('div', { class: 'task' }, s.task)),
      s.file && h('button', { class: 'open', onclick: () => go('works', false, { job: job.id, file: s.file }) }, s.file.endsWith('.html') ? 'Открыть сайт' : 'Открыть'))));
}
const rememberedEl = (items) => h('div', { class: 'remembered' }, items.map((n) => { const c = catOf(n.cat); return h('button', { class: 'tag', title: 'Открыть память', onclick: () => go('memory') }, h('i', { style: `background:${c.color}` }), h('span', null, h('em', null, c.name + ' · '), n.text)); }));
function proposeEl(m) {
  const box = h('div', { class: 'propose' }), sent = sentProposals()[m.id];
  const doneState = (id) => box.replaceChildren(h('div', { class: 'grow' }, h('b', null, `Заявка №${id} создана`), h('small', null, 'Статус обновляется в реальном времени')), h('button', { class: 'btn sm ghost', onclick: () => go('requests') }, 'Открыть заявки'));
  if (sent) { doneState(sent); return box; }
  const yes = h('button', { class: 'btn sm', onclick: async () => { yes.disabled = true;
    try { const d = await api('/api/requests', { body: m.meta.propose }); const map = sentProposals(); map[m.id] = d.request.id; localStorage.setItem('vit.sent', JSON.stringify(map)); doneState(d.request.id); if (!d.channel) toast('Заявка сохранена. Канал команды подключается в Настройках'); }
    catch (e) { toast(e.message); yes.disabled = false; } } }, 'Передать');
  box.append(h('div', { class: 'grow' }, h('b', null, 'Передать команде VITON13?'), h('small', null, m.meta.propose.title)), yes, h('button', { class: 'btn sm ghost', onclick: () => box.remove() }, 'Не нужно'));
  return box;
}
const noticeEl = (s) => h('div', null, h('div', { class: 'notice' }, h('span', { class: 'dot' }), s.to ? `${s.from}: ${s.reason}. Переключился на «${s.to}»` : `${s.from}: ${s.reason}`));
function msgEl(m) {
  if (m.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, m.content));
  const meta = m.meta || {}, job = meta.job && S.jobs.get(meta.job);
  return h('div', { class: 'msg vitm' }, (meta.switches || []).map(noticeEl), job && planEl(job), h('div', { class: 'text md', html: md(m.content, meta.sources) }),
    meta.sources?.length && h('div', { class: 'sources' }, meta.sources.map((s) => h('a', { class: 'source', href: s.url, target: '_blank', rel: 'noopener noreferrer', title: s.title }, h('b', null, String(s.n)), h('span', null, (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.title; } })())))),
    meta.propose && m.id && proposeEl(m), meta.remembered?.length && rememberedEl(meta.remembered),
    h('div', { class: 'meta' }, meta.model && h('span', { class: 'who' }, h('span', { class: 'dot ' + (meta.local ? 'ok' : 'limit') }), `${meta.provider} · ${meta.model}`), meta.proactive && h('span', null, 'VIT спросил сам'), m.created && h('span', null, when(m.created))));
}

function buildVit() {
  const canvas = h('canvas', { 'aria-hidden': 'true' }), stateEl = h('div', { class: 'state', 'aria-live': 'polite' });
  const stage = h('div', { class: 'stage' }, canvas, stateEl), list = h('div', { class: 'list' });
  const SUGGEST = ['Хочу запустить арт-студию современной живописи', 'Найди свежие новости об ИИ-агентах', 'Сделай план продвижения сайта', 'Что ты обо мне помнишь?'];
  const hello = h('div', { class: 'hello' }, h('h1', null, `Привет, ${S.me.name}.`), h('p', null, 'Поставьте цель — я доведу её до результата.'), h('div', { class: 'chips' }, SUGGEST.map((s) => h('button', { class: 'chip', onclick: () => send(s) }, s))));
  const thread = h('div', { class: 'thread scroll' }, h('div', { class: 'thread-in' }, stage, hello, list));
  const input = h('textarea', { rows: 1, placeholder: matchMedia('(max-width: 480px)').matches ? 'Вопрос или цель' : 'Спросите VIT или поставьте цель', 'aria-label': 'Сообщение для VIT' });
  const mic = h('button', { class: 'round mic', title: 'Сказать голосом', 'aria-label': 'Сказать голосом', onclick: () => toggleMic() }, icon('mic'));
  const sendBtn = h('button', { class: 'round send', title: 'Отправить', 'aria-label': 'Отправить', onclick: () => (S.busy ? stop() : send(input.value)) }, icon('up'));
  const root = h('div', { class: 'view vit' }, h('div', { class: 'vit-top' },
      h('button', { class: 'icon-btn', title: 'История', 'aria-label': 'История диалогов', onclick: (e) => { e.stopPropagation(); historyPop(); } }, icon('clock')),
      h('button', { class: 'icon-btn', title: 'Новый диалог', 'aria-label': 'Новый диалог', onclick: newConv }, icon('plus'))),
    thread, h('div', { class: 'composer-wrap' }, h('div', { class: 'composer' }, input, mic, sendBtn), h('div', { class: 'foot' }, 'VIT может ошибаться. Важное проверяйте.')));
  const orb = createOrb(canvas); let abort = null, pop = null;
  const setState = (t) => { stateEl.textContent = t || ''; };
  const bottom = (force) => { if (force || thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160) thread.scrollTop = thread.scrollHeight; };
  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; };
  const busyUI = () => { sendBtn.className = 'round ' + (S.busy ? 'stop' : 'send'); sendBtn.replaceChildren(icon(S.busy ? 'stop' : 'up')); sendBtn.title = S.busy ? 'Остановить' : 'Отправить'; sendBtn.setAttribute('aria-label', sendBtn.title); };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!S.busy) send(input.value); } });
  document.addEventListener('click', () => { pop?.remove(); pop = null; });

  function render() { const talk = S.messages.length > 0; root.classList.toggle('talk', talk); hello.classList.toggle('hide', talk); list.replaceChildren(...S.messages.map(msgEl)); requestAnimationFrame(() => bottom(true)); }
  async function newConv() { if (S.busy) return; const d = await api('/api/convs', { method: 'POST', body: {} }); S.conv = d.conv; S.messages = []; render(); input.focus(); }
  async function historyPop() { pop?.remove(); const d = await api('/api/convs');
    pop = h('div', { class: 'pop scroll', onclick: (e) => e.stopPropagation() }, d.items.length ? d.items.map((c) => h('button', { onclick: async () => { if (S.busy) return; const r = await api('/api/convs/' + c.id); S.conv = r.conv; S.messages = r.messages; pop.remove(); pop = null; render(); } }, c.title, h('small', null, when(c.updated)))) : h('div', { class: 'none' }, 'Пока нет диалогов'));
    root.append(pop); }
  function stop() { abort?.abort(); }

  async function send(text, opt = {}) {
    text = String(text || '').trim(); if (!text || S.busy) return;
    S.busy = true; busyUI(); window.speechSynthesis?.cancel(); input.value = ''; grow();
    S.messages.push({ role: 'user', content: text, meta: {} }); list.append(msgEl(S.messages.at(-1)));
    const notices = h('div'), planSlot = h('div'), textEl = h('div', { class: 'text md' }, h('span', { class: 'typing' }, h('i'), h('i'), h('i')));
    let liveEl = h('div', { class: 'msg vitm' }, notices, planSlot, textEl); list.append(liveEl);
    root.classList.add('talk'); hello.classList.add('hide'); bottom(true); orb.state('think'); setState('Думаю');
    let acc = '', job = null, sources = null, raf = 0, final = null; abort = new AbortController();
    const paint = () => { raf = 0; textEl.innerHTML = md(acc, sources); bottom(); };
    try {
      await stream('/api/chat', { conv: S.conv, text }, (e) => {
        if (e.type === 'route') setState({ chat: 'Думаю', search: 'Ищу в интернете', goal: 'Собираю команду агентов', human: 'Думаю' }[e.kind]);
        else if (e.type === 'status') setState(e.text);
        else if (e.type === 'token') { if (!acc) { orb.state('speak'); setState(''); } acc += e.t; raf ||= requestAnimationFrame(paint); }
        else if (e.type === 'reset') { acc = ''; raf ||= requestAnimationFrame(paint); }
        else if (e.type === 'switch') { notices.append(noticeEl(e)); bottom(); }
        else if (e.type === 'sources') sources = e.items;
        else if (e.type === 'plan') { job = e.job; S.jobs.set(job.id, job); planSlot.replaceChildren(planEl(job)); bottom(true); }
        else if (e.type === 'step' && job) { const s = job.steps[e.i]; s.status = e.status; if (e.file) s.file = e.file; planSlot.replaceChildren(planEl(job)); setState(e.status === 'run' ? `${s.name} работает` : ''); bottom(); }
        else if (e.type === 'final') { final = e.message; S.messages.push(final); const el = msgEl(final); liveEl.replaceWith(el); liveEl = el; orb.state('idle'); setState(''); S.busy = false; busyUI(); bottom();
          if (S.speak === 'always' || (S.speak === 'voice' && opt.voice)) speak(final.content); }
        else if (e.type === 'memory') { final && (final.meta.remembered = e.nodes); liveEl.querySelector('.meta')?.before(rememberedEl(e.nodes)); e.nodes.forEach((n, i) => setTimeout(() => orb.burst(S.cats.findIndex((c) => c.id === n.cat)), i * 380));
          if (S.view !== 'memory') { S.memBadge += e.nodes.length; badges(); } bottom(); }
        else if (e.type === 'error') { textEl.textContent = e.message; }
      }, abort.signal);
    } catch (err) { if (!final) { textEl.textContent = err.name === 'AbortError' ? (acc ? acc + ' …' : job ? 'Остановил работу. То, что агенты успели сделать, лежит в разделе «Работы».' : 'Остановлено.') : 'Нет связи с VIT. Проверьте, что приложение запущено.';
      if (job) { for (const s of job.steps) if (s.status === 'run') s.status = 'fail'; planSlot.replaceChildren(planEl(job)); } } }
    if (!final && job) api('/api/jobs').then((d) => { S.jobs = new Map(d.items.map((j) => [j.id, j])); }).catch(() => {});
    S.busy = false; busyUI(); if (!window.speechSynthesis?.speaking) orb.state('idle'); setState(''); abort = null;
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/\[\d+\]/g, '').replace(/[*_#`]/g, '')), ru = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('ru'));
    u.lang = 'ru-RU'; u.voice = ru.find((v) => /Yuri|Milena|Google/.test(v.name)) || ru[0] || null; u.rate = 1.05;
    u.onstart = () => orb.state('speak'); u.onend = u.onerror = () => orb.state('idle'); speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  // voice in: record → whisper on this computer → text. The orb listens with you.
  let rec = null;
  async function toggleMic() {
    if (rec) return rec.stop(); if (S.busy) return;
    if (!S.voice.stt) return browserSpeech();
    let media; try { media = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('Нет доступа к микрофону'); }
    const ctx = new AudioContext(), an = ctx.createAnalyser(), buf = new Float32Array(1024), chunks = []; ctx.createMediaStreamSource(media).connect(an); an.fftSize = 1024;
    rec = new MediaRecorder(media); let spoke = false, quiet = 0, t0 = performance.now(), loop = 0;
    const tick = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; const rms = Math.sqrt(s / buf.length); orb.amp(Math.min(1, rms * 9));
      if (rms > 0.03) { spoke = true; quiet = performance.now(); } if ((spoke && performance.now() - quiet > 1500) || performance.now() - t0 > 45000) return rec?.stop(); loop = requestAnimationFrame(tick); };
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => { cancelAnimationFrame(loop); media.getTracks().forEach((t) => t.stop()); ctx.close(); rec = null; mic.classList.remove('live'); orb.amp(0);
      if (!spoke) { orb.state('idle'); return setState(''); } orb.state('think'); setState('Распознаю');
      try { const res = await fetch('/api/stt', { method: 'POST', body: new Blob(chunks, { type: 'audio/webm' }) }), d = await res.json(); setState(''); orb.state('idle'); if (d.text) send(d.text, { voice: true }); else toast(d.message || 'Не расслышал. Попробуйте ещё раз'); }
      catch { setState(''); orb.state('idle'); toast('Не получилось распознать речь'); } };
    rec.start(); mic.classList.add('live'); orb.state('listen'); setState('Слушаю'); quiet = performance.now(); tick();
  }
  function browserSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return toast('Голос не настроен. Подробности — в Настройках');
    const r = new SR(); r.lang = 'ru-RU'; r.interimResults = false; mic.classList.add('live'); orb.state('listen'); setState('Слушаю');
    r.onresult = (e) => send(e.results[0][0].transcript, { voice: true }); r.onerror = () => toast('Не получилось распознать речь'); r.onend = () => { mic.classList.remove('live'); if (!S.busy) { orb.state('idle'); setState(''); } }; r.start();
  }
  render();
  return { root, render, focus: () => { if (matchMedia('(min-width: 761px)').matches) input.focus(); requestAnimationFrame(() => bottom(true)); } };
}

// ── memory ──────────────────────────────────────────────────────────────────
function viewMemory() {
  S.memBadge = 0; badges();
  const canvas = h('canvas'), hint = h('div', { class: 'hint' }), cats = h('div', { class: 'cats' }), space = h('div', { class: 'space' }, canvas, hint);
  const root = h('div', { class: 'view mem' }, h('div', { class: 'mem-head' }, h('div', { class: 'grow' }, h('h1', null, 'Память'), h('p', null, 'Каждая мысль — узел. Каждая связь — смысл. Хранится только на этом компьютере.')), cats), space);
  const hidden = new Set(); let graph = null, card = null, data = { nodes: [], edges: [] };
  const select = (n) => { card?.remove(); card = null; if (!n) return; const c = catOf(n.cat);
    card = h('div', { class: 'node-card' }, h('span', { class: 'tag' }, h('i', { style: `background:${c.color}` }), c.name), h('p', null, n.text), n.quote && h('blockquote', null, 'Вы сказали: «' + n.quote + '»'),
      h('div', { class: 'row' }, h('small', null, when(n.created)), h('button', { onclick: async () => { await api('/api/memory/' + n.id, { method: 'DELETE' }); card.remove(); card = null; graph.clear(); refresh(); } }, 'Забыть')));
    space.append(card); };
  function paintCats() { cats.replaceChildren(...S.cats.map((c) => { const n = data.nodes.filter((x) => x.cat === c.id).length;
    return h('button', { class: 'cat' + (hidden.has(c.id) ? ' off' : ''), 'aria-pressed': String(!hidden.has(c.id)), onclick: () => { hidden.has(c.id) ? hidden.delete(c.id) : hidden.add(c.id); graph.filter(hidden); paintCats(); } }, h('i', { style: `background:${c.color}` }), c.name, h('small', null, String(n))); })); }
  async function refresh() { data = await api('/api/memory'); graph.set(data.nodes, data.edges); paintCats();
    hint.textContent = data.nodes.length ? 'Нажмите на узел, чтобы увидеть мысль и откуда она' : 'Здесь появится карта вашей памяти. Расскажите VIT о себе, целях и планах.'; }
  requestAnimationFrame(() => { graph = createGraph(canvas, { cats: S.cats, onSelect: select }); refresh(); });
  return { root, destroy: () => graph?.destroy() };
}

// ── works: what the agents produced ─────────────────────────────────────────
function viewWorks(arg) {
  const list = h('div', { class: 'works-list scroll' }), viewer = h('div', { class: 'viewer' }), root = h('div', { class: 'view works' }, list, viewer);
  let picked = arg || null;
  async function open(job, file) { picked = { job: job.id, file }; root.classList.add('open'); paint();
    const url = `/workspace/job-${job.id}/${file}`, step = job.steps.find((s) => s.file === file);
    const bar = h('div', { class: 'viewer-bar' }, h('button', { class: 'icon-btn back', 'aria-label': 'Назад', onclick: () => { root.classList.remove('open'); } }, icon('back')), h('span', null, step?.name || file), h('span', { class: 'grow' }), h('a', { class: 'icon-btn', href: url, target: '_blank', rel: 'noopener', title: 'Открыть в новой вкладке', 'aria-label': 'Открыть в новой вкладке' }, icon('out')));
    if (file.endsWith('.html')) { const frame = h('iframe', { sandbox: '', title: 'Сайт, собранный агентами' }); viewer.replaceChildren(bar, frame); try { frame.srcdoc = await (await fetch(url)).text(); } catch { /* stays empty */ } return; }
    const body = h('div', { class: 'viewer-body scroll' }); viewer.replaceChildren(bar, body);
    try { body.append(h('div', { class: 'md', html: md(await (await fetch(url)).text()) })); } catch { body.textContent = 'Не получилось открыть файл'; } }
  function paint() { const jobs = [...S.jobs.values()].sort((a, b) => b.id - a.id);
    list.replaceChildren(h('h1', null, 'Работы'), ...(jobs.length ? jobs.map((j) => h('div', { class: 'job' }, h('b', null, j.title), h('small', null, `${when(j.created)} · ${j.steps.filter((s) => s.status === 'done').length} из ${j.steps.length} шагов`),
      h('div', { class: 'files' }, j.steps.filter((s) => s.file).map((s) => h('button', { class: 'file' + (picked?.job === j.id && picked?.file === s.file ? ' on' : ''), onclick: () => open(j, s.file) }, h('i', { style: `background:${s.color}` }), s.name, h('span', null, s.file.endsWith('.html') ? 'сайт' : 'текст')))))) : [h('div', { class: 'empty' }, h('b', null, 'Пока пусто'), 'Поставьте VIT цель — например, «хочу запустить арт-студию». Команда агентов соберёт материалы, и они появятся здесь.')])); }
  api('/api/jobs').then((d) => { S.jobs = new Map(d.items.map((j) => [j.id, j])); paint();
    const j = picked ? S.jobs.get(picked.job) : matchMedia('(min-width: 761px)').matches ? [...S.jobs.values()].sort((a, b) => b.id - a.id)[0] : null, f = picked?.file || j?.steps.find((s) => s.file)?.file;
    if (j && f) open(j, f); else viewer.replaceChildren(h('div', { class: 'empty' }, 'Выберите материал слева')); });
  paint();
  return { root };
}

// ── requests to the team ────────────────────────────────────────────────────
function viewRequests() {
  S.reqBadge = 0; badges();
  const body = h('div', { class: 'stack' }), root = h('div', { class: 'view' }, h('div', { class: 'page scroll' }, h('div', { class: 'page-in' }, h('h1', null, 'Заявки'), h('p', { class: 'sub' }, 'Когда задаче нужен человек, VIT передаёт её команде VITON13. Статус меняется здесь в реальном времени.'), body)));
  api('/api/requests').then((d) => { body.replaceChildren(
    !d.channel && h('div', { class: 'card soft' }, h('h3', null, 'Канал команды не подключён'), h('p', { class: 'hint' }, 'Заявки сохраняются в приложении. Чтобы они мгновенно уходили исполнителям, подключите Telegram в Настройках. Для проверки есть ', h('a', { href: '/team', target: '_blank', rel: 'noopener' }, 'пульт команды'), '.')),
    ...(d.items.length ? d.items.map((r) => h('div', { class: 'card req' }, h('div', { class: 'req-top' }, h('div', { class: 'grow' }, h('b', null, `№${r.id} · ${r.title}`)), h('span', { class: 'tag ' + r.status }, r.statusName)), r.detail && h('p', null, r.detail),
      h('div', { class: 'log' }, r.log.map((l) => h('div', null, h('time', null, when(l.at)), h('span', null, l.note)))))) : [h('div', { class: 'empty' }, h('b', null, 'Заявок нет'), 'Попросите VIT о том, что требует человека: оформить заказ, созвониться, сделать проект командой.')])); });
  return { root };
}

// ── agents ──────────────────────────────────────────────────────────────────
function viewAgents() {
  const count = {}; for (const j of S.jobs.values()) for (const s of j.steps) if (s.status === 'done') count[s.agent] = (count[s.agent] || 0) + 1;
  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'шаг' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'шага' : 'шагов');
  return { root: h('div', { class: 'view' }, h('div', { class: 'page scroll' }, h('div', { class: 'page-in' }, h('h1', null, 'Агенты'), h('p', { class: 'sub' }, 'Тринадцать ролей, которым VIT раздаёт шаги вашей цели. Модели — это двигатели; VIT решает, кто и что делает, и собирает результат.'),
    h('div', { class: 'agents' }, S.agents.map((a) => h('div', { class: 'agent' }, h('span', { class: 'glyph', style: `background:${a.color}` }, a.name[0]), h('b', null, a.name), h('p', null, a.about), h('small', null, count[a.id] ? `${count[a.id]} ${plural(count[a.id])} выполнено` : 'Ждёт задачу'))))))) };
}

// ── settings ────────────────────────────────────────────────────────────────
function viewSettings() {
  const body = h('div', { class: 'stack' }), root = h('div', { class: 'view' }, h('div', { class: 'page scroll' }, h('div', { class: 'page-in', style: 'max-width:720px' }, h('h1', null, 'Настройки'), h('p', { class: 'sub' }, 'Модели, голос, данные и связь с командой.'), body)));
  const seg = (items, value, onPick) => { const el = h('div', { class: 'seg', role: 'group' }); const paint = (v) => el.replaceChildren(...items.map(([id, label]) => h('button', { class: id === v ? 'on' : '', 'aria-pressed': String(id === v), onclick: () => { paint(id); onPick(id); } }, label))); paint(value); return el; };
  const toggle = (on, onFlip) => { const el = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), onclick: () => { on = !on; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); onFlip(on); } }); return el; };
  const models = h('div');
  const WHY = { eco: 'Всё делает локальная модель — бесплатно. Облако подключается, только если она не отвечает.', balanced: 'Разговор — на локальной модели, сложная работа агентов — в облаке.', cloud: 'Всё идёт в облако; локальная модель — запасная.' };
  function paintModels(d) {
    const why = h('p', { class: 'hint' }, WHY[d.policy]);
    models.replaceChildren(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('div', { class: 'grow' }, h('h3', null, 'Модели'), why), seg([['eco', 'Экономно'], ['balanced', 'Баланс'], ['cloud', 'Облако']], d.policy, async (p) => { why.textContent = WHY[p]; await api('/api/models', { body: { policy: p } }); })),
      h('div', { style: 'margin-top:12px' }, d.items.map((m) => {
        const stateText = m.state === 'ok' ? (m.local ? 'Готова' : 'Подключена') : m.state === 'limit' ? m.reason[0].toUpperCase() + m.reason.slice(1) : m.local ? 'Ollama не найдена' : 'Нет ключа';
        const model = m.local ? h('select', { class: 'field sm', 'aria-label': 'Модель' }, (m.models.length ? m.models : ['']).map((n) => h('option', { value: n, selected: n === m.model }, n || 'нет моделей'))) : h('input', { class: 'field sm', value: m.model, placeholder: 'Модель', 'aria-label': 'Модель' });
        const key = !m.local && h('input', { class: 'field sm', type: 'password', placeholder: m.key ? `Ключ ${m.key}` : 'Ключ API', autocomplete: 'off', 'aria-label': 'Ключ API' });
        const base = m.base !== undefined && h('input', { class: 'field sm', value: m.base, placeholder: 'Адрес API', 'aria-label': 'Адрес API', style: 'grid-column:1/-1' });
        const save = async () => { const b = { id: m.id, model: model.value }; if (key && key.value) b.key = key.value; if (base) b.base = base.value; paintModels(await api('/api/models', { body: b })); toast('Сохранено'); };
        const check = h('button', { class: 'btn sm ghost', onclick: async () => { check.disabled = true; check.textContent = 'Проверяю…'; const r = await api('/api/models/test', { body: { id: m.id } }); toast(r.result.ok ? `${m.name}: отвечает за ${(r.result.ms / 1000).toFixed(1)} с` : `${m.name}: ${r.result.reason}`); paintModels({ ...d, items: r.items }); } }, 'Проверить');
        return h('div', { class: 'model' }, h('div', null, h('div', { class: 'name' }, h('span', { class: 'dot ' + m.state }), m.name, h('small', null, m.where)), h('div', { class: 'why' }, stateText)),
          h('div', { class: 'acts' }, m.ready && check, toggle(m.on, async (on) => { await api('/api/models', { body: { id: m.id, on } }); })),
          h('div', { class: 'inputs' }, model, key || h('button', { class: 'btn sm ghost', onclick: save }, 'Сохранить'), base, key && h('button', { class: 'btn sm ghost', style: 'grid-column:1/-1;justify-self:start', onclick: save }, 'Сохранить')));
      })));
  }
  Promise.all([api('/api/models'), api('/api/settings')]).then(([m, s]) => {
    paintModels(m);
    const tgToken = h('input', { class: 'field sm', type: 'password', placeholder: s.telegram.set ? 'Токен бота сохранён' : 'Токен бота', autocomplete: 'off', 'aria-label': 'Токен Telegram-бота' }), tgChat = h('input', { class: 'field sm', value: s.telegram.chat, placeholder: 'ID чата команды', 'aria-label': 'ID чата' });
    body.replaceChildren(
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'me', style: 'padding:0;width:auto;pointer-events:none' }, h('span', { class: 'ava' }, S.me.name[0].toUpperCase())), h('div', { class: 'grow' }, h('h3', null, S.me.name), h('p', { class: 'hint' }, S.me.kind === 'viton' ? `VITON ID · ${S.me.email}` : 'Локальный профиль — без аккаунта')),
        h('button', { class: 'btn sm ghost', onclick: async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); location.hash = ''; location.reload(); } }, 'Выйти'))),
      h('div', { class: 'card' }, models),
      h('div', { class: 'card' }, h('h3', null, 'Голос'), h('p', { class: 'hint' }, s.voice.stt ? `Речь распознаётся на этом компьютере (${s.voice.model}).` : 'Распознавание речи на компьютере не настроено: нужны whisper.cpp, ffmpeg и модель ggml (см. README). Текстом всё работает.'),
        h('div', { class: 'row', style: 'margin-top:14px;flex-wrap:wrap' }, h('div', { class: 'grow' }, 'Озвучивать ответы'), seg([['always', 'Всегда'], ['voice', 'На голос'], ['never', 'Никогда']], s.speak, async (v) => { S.speak = v; await api('/api/settings', { body: { speak: v } }); }))),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', null, 'Инициатива'), h('p', { class: 'hint' }, 'VIT может сам задать вопрос, когда видит, что это поможет вашей цели. Не чаще раза в шесть часов.')), toggle(s.proactive, async (on) => { await api('/api/settings', { body: { proactive: on } }); }))),
      h('div', { class: 'card' }, h('h3', null, 'Связь с командой'), h('p', { class: 'hint' }, s.telegram.set ? 'Заявки уходят в Telegram-чат команды.' : 'Подключите Telegram-бота, и заявки будут мгновенно приходить исполнителям.'),
        h('div', { class: 'model', style: 'border:0;padding-bottom:0' }, h('div', { class: 'inputs' }, tgToken, tgChat), h('div', { class: 'acts', style: 'grid-column:1/-1' }, h('button', { class: 'btn sm ghost', onclick: async () => { const t = { chat: tgChat.value }; if (tgToken.value) t.token = tgToken.value; await api('/api/settings', { body: { telegram: t } }); toast('Сохранено'); } }, 'Сохранить'), h('a', { href: '/team', target: '_blank', rel: 'noopener', style: 'font-size:13px' }, 'Пульт команды')))),
      h('div', { class: 'card' }, h('h3', null, 'Ваши данные'), h('p', { class: 'hint' }, 'Диалоги, память и работы лежат в одном файле на этом компьютере. Их можно выгрузить или удалить в любой момент.'),
        h('div', { style: 'margin-top:8px' }, h('div', { class: 'kv' }, h('span', null, 'Сообщений'), String(s.stats.messages)), h('div', { class: 'kv' }, h('span', null, 'Узлов памяти'), String(s.stats.nodes)), h('div', { class: 'kv' }, h('span', null, 'Работ'), String(s.stats.jobs))),
        h('div', { class: 'row', style: 'margin-top:12px;flex-wrap:wrap' }, h('a', { class: 'btn sm ghost', href: '/api/export', download: '' }, 'Выгрузить всё'), h('button', { class: 'btn sm danger', onclick: async () => { if (!confirm('Удалить все диалоги, память, работы и заявки? Это нельзя отменить.')) return; await api('/api/data', { method: 'DELETE' }); location.hash = ''; location.reload(); } }, 'Удалить всё'))),
      h('div', { class: 'card soft' }, h('h3', null, `VIT ${s.version} · открытый тест`), h('p', { class: 'hint' }, 'Ядро VITON13 OS. В тесте всё бесплатно; вход по VITON ID или без аккаунта.')));
  }).catch((e) => body.replaceChildren(h('div', { class: 'empty' }, e.message)));
  return { root };
}
