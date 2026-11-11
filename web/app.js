// VIT — the app of the VITON13 ecosystem. One page, no build step. This file is the shell and VIT's own screens
// (conversation, memory, works, requests, agents, settings); the worlds live in /worlds and plug in by file.
import { createOrb } from '/orb.js';
import { createGraph } from '/graph.js';
import { $, h, icon, api, stream, toast, when, md, css, esc } from '/kit.js';
import { viewHome, runIntro, themeSheet, initTheme, getTheme } from '/home.js';

// ── state ───────────────────────────────────────────────────────────────────
const S = { me: null, conv: null, messages: [], cats: [], agents: [], jobs: new Map(), voice: {}, speak: 'voice', view: 'home', busy: false, memBadge: 0, reqBadge: 0, version: '' };
const app = $('#app');
if (/Electron/.test(navigator.userAgent)) document.body.classList.add('desktop');
const catOf = (id) => S.cats.find((c) => c.id === id) || { name: id, color: '#86868b' };
const sentProposals = () => { try { return JSON.parse(localStorage.getItem('vit.sent') || '{}'); } catch { return {}; } };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

boot();
async function boot() {
  initTheme();
  const d = await api('/api/me').catch(() => ({}));
  let played = false; try { played = !!sessionStorage.getItem('vit.intro'); sessionStorage.setItem('vit.intro', '1'); } catch { /* no storage */ }
  if (!played) runIntro({ short: !!store.get('vit.seen') && !!d.me });                 // the full welcome once, a short one on later launches
  store.set('vit.seen', '1');
  if (!d.me) return welcome();
  await load(); shell();
}
async function load() {
  const [st, jobs] = await Promise.all([api('/api/state'), api('/api/jobs')]);
  Object.assign(S, { me: st.me, conv: st.conv, messages: st.messages, cats: st.cats, agents: st.agents, voice: st.voice, speak: st.speak, version: st.version });
  S.jobs = new Map(jobs.items.map((j) => [j.id, j])); if (st.theme) initTheme(st.theme);
}
const brand = () => h('span', { class: 'wordmark' }, 'VITON', h('sup', null, '13'));

// ── sign-in ─────────────────────────────────────────────────────────────────
function welcome() {
  const err = h('div', { class: 'err', role: 'alert' });
  const name = h('input', { class: 'field', placeholder: 'Как к вам обращаться?', autocomplete: 'given-name', maxlength: 40, 'aria-label': 'Ваше имя' });
  const email = h('input', { class: 'field', type: 'email', placeholder: 'Почта VITON ID', autocomplete: 'username', 'aria-label': 'Почта VITON ID' });
  const pass = h('input', { class: 'field', type: 'password', placeholder: 'Пароль', autocomplete: 'current-password', 'aria-label': 'Пароль' });
  let mode = 'local';
  const goBtn = h('button', { class: 'btn lg', type: 'submit' }, 'Войти');
  const alt = h('button', { type: 'button', onclick: () => { mode = mode === 'local' ? 'viton' : 'local'; paint(); } });
  const form = h('form', { onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; goBtn.disabled = true;
    try { if (mode === 'local') await api('/api/auth/local', { body: { name: name.value } }); else await api('/api/auth/viton', { body: { email: email.value, password: pass.value } }); await load(); shell(); }
    catch (ex) { err.textContent = ex.message; goBtn.disabled = false; } } });
  const altLine = h('div', { class: 'alt' });
  function paint() { err.textContent = '';
    form.replaceChildren(...(mode === 'local' ? [name] : [email, pass]), goBtn, err); goBtn.textContent = mode === 'local' ? 'Начать' : 'Войти';
    altLine.replaceChildren(mode === 'local' ? 'Есть аккаунт? ' : 'Без аккаунта? ', alt); alt.textContent = mode === 'local' ? 'Войти через VITON ID' : 'Продолжить без входа'; }
  app.replaceChildren(h('div', { class: 'welcome' }, h('div', { class: 'welcome-in glass' }, h('img', { class: 'mark', src: '/logo-mark.png', alt: '' }), brand(),
    h('h1', null, 'Вход в экосистему'), h('p', { class: 'lead' }, 'VIT, VJOURNAL, Store, Медицина и Hub — под одним входом.'), form, altLine,
    h('p', { class: 'fine' }, 'Открытый тест · память и диалоги хранятся на вашем компьютере'))));
  paint();
}

// ── shell ───────────────────────────────────────────────────────────────────
const WORLD_TABS = [['home', 'Главная'], ['vit', 'VIT'], ['journal', 'VJOURNAL'], ['store', 'Store'], ['medicine', 'Медицина'], ['hub', 'Hub']];
const VIT_TABS = [['vit', 'Диалог'], ['memory', 'Память'], ['works', 'Работы'], ['requests', 'Заявки'], ['agents', 'Агенты']];
const WORLDS = new Set(['journal', 'store', 'medicine', 'hub']), VIT_GROUP = new Set(VIT_TABS.map(([id]) => id));
const KNOWN = new Set(['home', 'settings', ...VIT_GROUP, ...WORLDS]);
let main, sub, vitView, current = null, tabEls = {}, subEls = {};
const ctx = () => ({ h, icon, api, toast, when, md, css, esc, me: S.me, theme: getTheme, go: (v, arg) => go(v, false, arg), askVit: (text) => { go('vit'); vitView.send(text); } });

function shell() {
  tabEls = Object.fromEntries(WORLD_TABS.map(([id, label]) => [id, h('button', { class: 'tab', onclick: () => go(id) }, icon(id), h('span', null, label))]));
  subEls = Object.fromEntries(VIT_TABS.map(([id, label]) => [id, h('button', { class: 'subtab', onclick: () => go(id) }, label)]));
  main = h('main', { class: 'main' }); sub = h('div', { class: 'sub hide', 'aria-label': 'Разделы VIT' }, Object.values(subEls));
  app.replaceChildren(h('div', { class: 'shell' },
    h('header', { class: 'top' }, h('button', { class: 'logo', onclick: () => go('home'), 'aria-label': 'VITON13 — на главную' }, h('img', { src: '/logo-mark.png', alt: '' }), brand()),
      h('nav', { class: 'tabs glass', 'aria-label': 'Миры' }, Object.values(tabEls)),
      h('div', { class: 'top-right' }, h('button', { class: 'icon-btn', title: 'Тематика', 'aria-label': 'Тематика', onclick: themeSheet }, icon('frames')),
        h('button', { class: 'ava', title: `${S.me.name} · настройки`, 'aria-label': 'Профиль и настройки', onclick: () => go('settings') }, (S.me.name || 'V')[0].toUpperCase()))),
    sub, main));
  vitView = buildVit(); main.append(vitView.root);
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'home', true));
  window.addEventListener('vit:theme', () => { if (S.view === 'home') go('home'); });
  go(KNOWN.has(location.hash.slice(1)) ? location.hash.slice(1) : 'home', true);
  live(); setTimeout(askFirst, 1800);
}
function badges() {
  for (const [id, n] of [['memory', S.memBadge], ['requests', S.reqBadge]]) { subEls[id].querySelector('.badge')?.remove(); if (n) subEls[id].append(h('span', { class: 'badge' }, String(n))); }
  tabEls.vit.querySelector('.badge')?.remove(); const all = S.memBadge + S.reqBadge; if (all && !VIT_GROUP.has(S.view)) tabEls.vit.append(h('span', { class: 'badge' }, String(all)));
}
function go(view, fromHash, arg) {
  if (!KNOWN.has(view)) view = 'home';
  S.view = view; if (!fromHash && location.hash.slice(1) !== view) history.replaceState(null, '', '#' + view);
  const inVit = VIT_GROUP.has(view);
  for (const [id, el] of Object.entries(tabEls)) { const on = id === view || (id === 'vit' && inVit); el.classList.toggle('on', on); el.setAttribute('aria-current', on ? 'page' : 'false'); }
  for (const [id, el] of Object.entries(subEls)) el.classList.toggle('on', id === view);
  sub.classList.toggle('hide', !inVit); badges();
  current?.destroy?.(); current?.root.remove(); current = null;
  vitView.root.classList.toggle('hide', view !== 'vit'); if (view === 'vit') { vitView.resume(); return vitView.focus(); } vitView.pause();
  if (WORLDS.has(view)) return openWorld(view, arg);
  current = { home: () => viewHome(ctx()), memory: viewMemory, works: viewWorks, requests: viewRequests, agents: viewAgents, settings: viewSettings }[view](arg); main.append(current.root);
}
async function openWorld(id, arg) {                       // a world is a file in /worlds — loaded the first time it is opened
  const wait = (current = { root: h('div', { class: 'view loading' }, h('i')) }); main.append(wait.root);
  try { const mod = await import(`/worlds/${id}.js`); if (current !== wait) return; const view = mod.default(ctx(), arg); wait.root.remove(); current = view; main.append(view.root); }
  catch (e) { console.error(e); if (current === wait) wait.root.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Этот мир ещё собирается'), 'Загляните чуть позже.')); }
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
  const thread = h('div', { class: 'thread scroll' }, h('div', { class: 'thread-in' }, hello, list));
  const input = h('textarea', { rows: 1, placeholder: matchMedia('(max-width: 480px)').matches ? 'Вопрос или цель' : 'Спросите VIT или поставьте цель', 'aria-label': 'Сообщение для VIT' });
  const mic = h('button', { class: 'round mic', title: 'Сказать голосом', 'aria-label': 'Сказать голосом', onclick: () => toggleMic() }, icon('mic'));
  const sendBtn = h('button', { class: 'round send', title: 'Отправить', 'aria-label': 'Отправить', onclick: () => (S.busy ? stop() : send(input.value)) }, icon('up'));
  const root = h('div', { class: 'view vit' }, h('div', { class: 'vit-top' },
      h('button', { class: 'icon-btn', title: 'История', 'aria-label': 'История диалогов', onclick: (e) => { e.stopPropagation(); historyPop(); } }, icon('clock')),
      h('button', { class: 'icon-btn', title: 'Новый диалог', 'aria-label': 'Новый диалог', onclick: newConv }, icon('plus'))),
    stage, thread, h('div', { class: 'composer-wrap' }, h('div', { class: 'composer glass' }, input, mic, sendBtn), h('div', { class: 'foot' }, 'VIT может ошибаться. Важное проверяйте.')));
  const orb = createOrb(canvas, { size: 760 }); let abort = null, pop = null;
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
    pop = h('div', { class: 'pop glass scroll', onclick: (e) => e.stopPropagation() }, d.items.length ? d.items.map((c) => h('button', { onclick: async () => { if (S.busy) return; const r = await api('/api/convs/' + c.id); S.conv = r.conv; S.messages = r.messages; pop.remove(); pop = null; render(); } }, c.title, h('small', null, when(c.updated)))) : h('div', { class: 'none' }, 'Пока нет диалогов'));
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
  return { root, render, send, pause: () => orb.pause(), resume: () => orb.resume(), focus: () => { if (matchMedia('(min-width: 861px)').matches) input.focus(); requestAnimationFrame(() => bottom(true)); } };
}

// ── memory: the console ─────────────────────────────────────────────────────
const seg = (items, value, onPick) => { const el = h('div', { class: 'seg', role: 'group' }); const paint = (v) => el.replaceChildren(...items.map(([id, label]) => h('button', { class: id === v ? 'on' : '', 'aria-pressed': String(id === v), onclick: () => { paint(id); onPick(id); } }, label))); paint(value); return el; };
const toggle = (on, onFlip) => { const el = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), onclick: () => { on = !on; el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); onFlip(on); } }); return el; };
function viewMemory() {
  S.memBadge = 0; badges();
  const canvas = h('canvas'), hint = h('div', { class: 'hint' }), cats = h('div', { class: 'cats' }), space = h('div', { class: 'space' }, canvas, cats, hint);
  const stats = h('div', { class: 'mem-stats' }), list = h('div', { class: 'mem-list scroll' }), detail = h('div');
  const search = h('input', { class: 'field sm', type: 'search', placeholder: 'Найти в памяти', 'aria-label': 'Найти в памяти' });
  const hidden = new Set(); let graph = null, data = { nodes: [], edges: [] }, picked = null, order = 'new';
  const side = h('div', { class: 'glass mem-side' }, h('div', { class: 'head' }, search, h('div', { class: 'row' }, seg([['new', 'Новые'], ['strong', 'Важные']], order, (v) => { order = v; paintList(); }), h('span', { class: 'grow' }), h('a', { class: 'btn sm ghost', href: '/api/export', download: '' }, 'Выгрузить'))), list, detail);
  const root = h('div', { class: 'view mem' }, stats, space, side);
  const shown = () => { const q = search.value.trim().toLowerCase(); return data.nodes.filter((n) => !hidden.has(n.cat) && (!q || n.text.toLowerCase().includes(q) || (n.quote || '').toLowerCase().includes(q))); };
  const neighbours = (id) => data.edges.filter((e) => e.a === id || e.b === id).map((e) => data.nodes.find((n) => n.id === (e.a === id ? e.b : e.a))).filter(Boolean);

  function paintStats() {
    const day = 864e5, now = Date.now(), week = data.nodes.filter((n) => now - n.created < 7 * day).length, per = S.cats.map((c) => [c, data.nodes.filter((n) => n.cat === c.id).length]).sort((a, b) => b[1] - a[1])[0];
    const days = Array.from({ length: 14 }, (_, i) => data.nodes.filter((n) => Math.floor((now - n.created) / day) === 13 - i).length), top = Math.max(1, ...days);
    stats.replaceChildren(h('div', { class: 'glass stat title' }, h('h1', null, 'Память'), h('p', null, 'Каждая мысль — узел, каждая связь — смысл. Хранится только на этом компьютере.')),
      h('div', { class: 'glass stat' }, h('span', { class: 'cap' }, 'Узлов'), h('b', null, String(data.nodes.length))),
      h('div', { class: 'glass stat' }, h('span', { class: 'cap' }, 'Связей'), h('b', null, String(data.edges.length))),
      h('div', { class: 'glass stat' }, h('span', { class: 'cap' }, 'За 7 дней'), h('div', { class: 'row' }, h('b', null, '+' + week), h('div', { class: 'spark grow', title: 'Новые узлы по дням, две недели' }, days.map((v) => h('i', { class: v ? 'hit' : '', style: `height:${Math.max(7, (v / top) * 100)}%` }))))),
      h('div', { class: 'glass stat' }, h('span', { class: 'cap' }, 'Больше всего'), h('b', { style: 'font-size:22px;letter-spacing:-.02em' }, per && per[1] ? per[0].name : '—', per && per[1] ? h('small', null, String(per[1])) : null)));
  }
  function paintCats() { cats.replaceChildren(...S.cats.map((c) => { const n = data.nodes.filter((x) => x.cat === c.id).length;
    return h('button', { class: 'cat' + (hidden.has(c.id) ? ' off' : ''), 'aria-pressed': String(!hidden.has(c.id)), onclick: () => { hidden.has(c.id) ? hidden.delete(c.id) : hidden.add(c.id); graph.filter(hidden); paintCats(); paintList(); } }, h('i', { style: `background:${c.color}` }), c.name, h('small', null, String(n))); })); }
  function paintList() {
    const items = shown().sort((a, b) => (order === 'strong' ? b.weight - a.weight || b.id - a.id : b.id - a.id)), top = Math.max(1, ...data.nodes.map((n) => n.weight));
    graph?.match(search.value.trim() ? new Set(items.map((n) => n.id)) : null);
    list.replaceChildren(...(items.length ? items.map((n) => { const c = catOf(n.cat); return h('button', { class: 'mem-item' + (picked === n.id ? ' on' : ''), 'data-id': n.id, onclick: () => select(n) }, h('i', { style: `background:${c.color}` }), h('p', null, n.text),
      h('span', { class: 'cap' }, c.name, h('span', null, when(n.created)), h('span', { class: 'bar', title: 'Насколько часто это всплывает' }, h('u', { style: `width:${Math.max(18, (n.weight / top) * 100)}%` })))); })
      : [h('div', { class: 'empty', style: 'padding:36px 14px' }, data.nodes.length ? 'Ничего не нашлось.' : h('span', null, h('b', null, 'Память пока пуста'), 'Расскажите VIT о себе, своих целях и людях рядом — он запомнит главное.'))]));
  }
  function select(n, fromGraph) {
    picked = n?.id ?? null; if (!fromGraph) graph.focus(picked);
    list.querySelectorAll('.mem-item').forEach((el) => el.classList.toggle('on', Number(el.dataset.id) === picked)); if (fromGraph && n) list.querySelector(`[data-id="${n.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!n) return detail.replaceChildren(); const c = catOf(n.cat), near = neighbours(n.id);
    detail.replaceChildren(h('div', { class: 'mem-detail' }, h('div', { class: 'row' }, h('span', { class: 'tag' }, h('i', { style: `background:${c.color}` }), c.name), h('span', { class: 'grow' }), h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', style: 'width:28px;height:28px', onclick: () => select(null) }, '✕')),
      h('p', null, n.text), n.quote && h('blockquote', null, 'Вы сказали: «' + n.quote + '»'),
      near.length ? h('div', { class: 'links' }, h('span', { class: 'cap' }, 'Связано'), near.map((m) => h('button', { onclick: () => select(m) }, h('i', { style: `background:${catOf(m.cat).color}` }), m.text))) : null,
      h('div', { class: 'row' }, h('span', { class: 'cap grow' }, when(n.created)), h('button', { class: 'btn sm danger', onclick: async () => { await api('/api/memory/' + n.id, { method: 'DELETE' }); select(null); refresh(); } }, 'Забыть'))));
  }
  async function refresh() { data = await api('/api/memory'); graph.set(data.nodes, data.edges); paintStats(); paintCats(); paintList();
    hint.textContent = data.nodes.length ? 'Нажмите на узел — мысль, её источник и связи' : 'Здесь появится карта вашей памяти'; }
  search.addEventListener('input', paintList);
  requestAnimationFrame(() => { graph = createGraph(canvas, { cats: S.cats, onSelect: (n) => select(n, true) }); refresh(); });
  return { root, destroy: () => graph?.destroy() };
}

// ── works: what the agents produced ─────────────────────────────────────────
function viewWorks(arg) {
  const list = h('div', { class: 'works-list glass scroll' }), viewer = h('div', { class: 'viewer glass' }), root = h('div', { class: 'view works' }, list, viewer);
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
    const j = picked ? S.jobs.get(picked.job) : matchMedia('(min-width: 861px)').matches ? [...S.jobs.values()].sort((a, b) => b.id - a.id)[0] : null, f = picked?.file || j?.steps.find((s) => s.file)?.file;
    if (j && f) open(j, f); else viewer.replaceChildren(h('div', { class: 'empty' }, 'Выберите материал слева')); });
  paint();
  return { root };
}

// ── requests to the team ────────────────────────────────────────────────────
function viewRequests() {
  S.reqBadge = 0; badges();
  const body = h('div', { class: 'stack' }), root = h('div', { class: 'view' }, h('div', { class: 'page scroll' }, h('div', { class: 'page-in' }, h('h1', null, 'Заявки'), h('p', { class: 'sub-line' }, 'Когда задаче нужен человек, VIT передаёт её команде VITON13. Статус меняется здесь в реальном времени.'), body)));
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
  return { root: h('div', { class: 'view' }, h('div', { class: 'page scroll' }, h('div', { class: 'page-in' }, h('h1', null, 'Агенты'), h('p', { class: 'sub-line' }, 'Тринадцать ролей, которым VIT раздаёт шаги вашей цели. Модели — это двигатели; VIT решает, кто и что делает, и собирает результат.'),
    h('div', { class: 'agents' }, S.agents.map((a) => h('div', { class: 'agent glass' }, h('span', { class: 'glyph', style: `background:${a.color}` }, a.name[0]), h('b', null, a.name), h('p', null, a.about), h('small', null, count[a.id] ? `${count[a.id]} ${plural(count[a.id])} выполнено` : 'Ждёт задачу'))))))) };
}

// ── settings ────────────────────────────────────────────────────────────────
const FAQ = [
  ['Чем VIT отличается от чат-бота?', 'Чат-бот отвечает. VIT доводит до результата: сам решает, ответить ли сразу, найти данные в интернете, провести цель через команду агентов или передать задачу человеку.'],
  ['Как поставить цель?', 'Напишите или скажите, что нужно сделать: «сделай план продвижения сайта», «хочу запустить студию». VIT составит план, раздаст шаги агентам и сложит материалы в раздел «Работы».'],
  ['Что VIT запоминает?', 'Только то, что вы сами рассказали о себе, своих делах и людях. Каждая мысль видна в «Памяти» вместе с фразой, из которой она взята, и удаляется одной кнопкой.'],
  ['Где хранятся мои данные?', 'На этом компьютере, в одном файле. В облако уходит только текст запроса — и только если вы подключили облачную модель и до неё дошла очередь.'],
  ['Синхронизируется ли аккаунт между устройствами?', 'Пока нет. Вход по VITON ID уже работает, но перенос памяти и диалогов между устройствами появится вместе с сервером VITON13 OS. Сейчас данные можно выгрузить одним файлом в разделе «Данные».'],
  ['Почему ответы иногда слабые?', 'Маленькая локальная модель ошибается чаще облачной. В разделе «Модели» можно поставить модель сильнее — бесплатно, если хватает памяти компьютера, — или подключить облачную.'],
  ['Может ли VIT купить или заказать что-то сам?', 'Нет. Покупки, оплату и всё, что требует человека, VIT передаёт заявкой команде VITON13 — только с вашего согласия.'],
  ['Как работает голос?', 'Нажмите на микрофон и говорите; после паузы VIT распознает речь прямо на компьютере и ответит. Озвучку ответов настраивает раздел «Поведение».'],
];
function viewSettings(arg) {
  const body = h('div', { class: 'stack' }); let tab = arg?.tab || 'profile';
  const root = h('div', { class: 'view' }, h('div', { class: 'page scroll' }, h('div', { class: 'page-in', style: 'max-width:860px' }, h('h1', null, 'Настройки'), h('p', { class: 'sub-line' }, 'Профиль, модели, поведение, данные и помощь.'),
    h('div', { class: 'set-tabs' }, seg([['profile', 'Профиль'], ['models', 'Модели'], ['behave', 'Поведение'], ['data', 'Данные'], ['help', 'Помощь']], tab, (t) => { tab = t; paint(); })), body)));
  const WHY = { eco: 'Всё делает локальная модель — бесплатно. Облако подключается, только если она не отвечает.', balanced: 'Разговор — на локальной модели, сложная работа агентов — в облаке.', cloud: 'Всё идёт в облако; локальная модель — запасная.' };

  function ladder(box, d) {
    const why = h('p', { class: 'hint' }, WHY[d.policy]);
    box.replaceChildren(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('div', { class: 'grow' }, h('h3', null, 'Лестница моделей'), why), seg([['eco', 'Экономно'], ['balanced', 'Баланс'], ['cloud', 'Облако']], d.policy, async (p) => { why.textContent = WHY[p]; await api('/api/models', { body: { policy: p } }); })),
      h('div', { style: 'margin-top:12px' }, d.items.map((m) => {
        const stateText = m.state === 'ok' ? (m.local ? 'Готова' : 'Подключена') : m.state === 'limit' ? m.reason[0].toUpperCase() + m.reason.slice(1) : m.local ? 'Ollama не найдена' : 'Нет ключа';
        const model = m.local ? h('select', { class: 'field sm', 'aria-label': 'Модель' }, (m.models.length ? m.models : ['']).map((n) => h('option', { value: n, selected: n === m.model }, n || 'нет моделей'))) : h('input', { class: 'field sm', value: m.model, placeholder: 'Модель', 'aria-label': 'Модель' });
        const key = !m.local && h('input', { class: 'field sm', type: 'password', placeholder: m.key ? `Ключ ${m.key}` : 'Ключ API', autocomplete: 'off', 'aria-label': 'Ключ API' });
        const base = m.base !== undefined && h('input', { class: 'field sm', value: m.base, placeholder: 'Адрес API', 'aria-label': 'Адрес API', style: 'grid-column:1/-1' });
        const save = async () => { const b = { id: m.id, model: model.value }; if (key && key.value) b.key = key.value; if (base) b.base = base.value; ladder(box, await api('/api/models', { body: b })); toast('Сохранено'); };
        const check = h('button', { class: 'btn sm ghost', onclick: async () => { check.disabled = true; check.textContent = 'Проверяю…'; const r = await api('/api/models/test', { body: { id: m.id } }); toast(r.result.ok ? `${m.name}: отвечает за ${(r.result.ms / 1000).toFixed(1)} с` : `${m.name}: ${r.result.reason}`); ladder(box, { ...d, items: r.items }); } }, 'Проверить');
        return h('div', { class: 'model' }, h('div', null, h('div', { class: 'name' }, h('span', { class: 'dot ' + m.state }), m.name, h('small', null, m.where)), h('div', { class: 'why' }, stateText)),
          h('div', { class: 'acts' }, m.ready && check, toggle(m.on, async (on) => { await api('/api/models', { body: { id: m.id, on } }); })),
          h('div', { class: 'inputs' }, model, key || h('button', { class: 'btn sm ghost', onclick: save }, 'Сохранить'), base, key && h('button', { class: 'btn sm ghost', style: 'grid-column:1/-1;justify-self:start', onclick: save }, 'Сохранить')));
      })));
  }
  // open models: free weights that run on this computer; what the machine can run comes first
  async function catalog(box, ladderBox, kind = 'chat') {
    const d = await api('/api/catalog'), grid = h('div', { class: 'cat-grid' });
    const card = (m) => { const el = h('div', { class: 'om' + (m.have ? ' have' : '') }), acts = h('div', { class: 'acts' }), prog = h('div', { class: 'prog', style: 'width:0' });
      const install = h('button', { class: 'btn sm', onclick: async () => { install.disabled = true; install.textContent = 'Скачиваю…'; let failed = '';
        try { await stream('/api/catalog/pull', { id: m.id }, (e) => { if (e.type === 'progress') { prog.style.width = e.pct + '%'; install.textContent = `${e.pct}%`; } else if (e.type === 'error') failed = e.message; }); } catch { failed = 'Нет связи'; }
        if (failed) { toast(`${m.name}: ${failed}`); install.disabled = false; install.textContent = 'Установить'; prog.style.width = '0'; return; }
        toast(`${m.name} установлена`); catalog(box, ladderBox, kind); ladder(ladderBox, await api('/api/models')); } }, 'Установить');
      if (m.have) acts.append(h('span', { class: 'tag', style: 'color:var(--ok)' }, '✓ Установлена'), m.kind !== 'embed' && h('button', { class: 'btn sm ghost', onclick: async () => { ladder(ladderBox, await api('/api/models', { body: { id: 'local', model: m.id } })); toast(`VIT теперь работает на ${m.name}`); } }, 'Выбрать'),
        h('button', { class: 'btn sm ghost', onclick: async () => { if (!confirm(`Удалить ${m.name} с компьютера?`)) return; await api('/api/catalog/' + encodeURIComponent(m.id), { method: 'DELETE' }); catalog(box, ladderBox, kind); ladder(ladderBox, await api('/api/models')); } }, 'Удалить'));
      else if (!d.ollama) acts.append(h('span', { class: 'cap' }, 'Нужна Ollama'));
      else if (m.fits) acts.append(install); else acts.append(h('span', { class: 'cap' }, `Нужно ${m.need} ГБ памяти`));
      el.append(h('div', { class: 'head' }, h('b', null, m.name), h('span', { class: 'by' }, m.by)), h('p', null, m.note), h('div', { class: 'cap' }, h('span', null, `${m.gb} ГБ`), h('span', null, m.license)), acts, prog); return el; };
    const paintGrid = () => grid.replaceChildren(...d.items.filter((m) => m.kind === kind).map(card));
    box.replaceChildren(h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('div', { class: 'grow', style: 'min-width:240px' }, h('h3', null, 'Открытые модели'),
        h('p', { class: 'hint' }, d.ollama ? `Свободно распространяемые модели — ${d.items.length} проверенных. Работают на этом компьютере (${d.ram} ГБ памяти) бесплатно и без интернета; сверху те, что ему по силам.` : h('span', null, 'Чтобы ставить модели, нужна ', h('a', { href: 'https://ollama.com', target: '_blank', rel: 'noopener noreferrer' }, 'Ollama'), ' — бесплатная программа, которая запускает их на вашем компьютере.'))),
      seg(d.kinds, kind, (k) => { kind = k; paintGrid(); })), grid); paintGrid();
  }

  async function paint() {
    body.replaceChildren(h('div', { class: 'loading', style: 'min-height:160px' }, h('i')));
    try {
      if (tab === 'profile') body.replaceChildren(
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'ava', style: 'width:46px;height:46px;font-size:17px' }, S.me.name[0].toUpperCase()), h('div', { class: 'grow' }, h('h3', null, S.me.name), h('p', { class: 'hint' }, S.me.kind === 'viton' ? `VITON ID · ${S.me.email}` : 'Локальный профиль — без аккаунта')),
          h('button', { class: 'btn sm ghost', onclick: async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); location.hash = ''; location.reload(); } }, 'Выйти'))),
        h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', null, 'Тематика'), h('p', { class: 'hint' }, 'Пять обликов приложения. Меняется главная и все экраны.')), h('button', { class: 'btn sm', onclick: themeSheet }, 'Выбрать'))),
        h('div', { class: 'card soft' }, h('h3', null, `VIT ${S.version} · открытый тест`), h('p', { class: 'hint' }, 'Приложение экосистемы VITON13. В тесте всё бесплатно; вход по VITON ID или без аккаунта.')));
      else if (tab === 'models') { const a = h('div', { class: 'card' }), b = h('div', { class: 'card' }); body.replaceChildren(a, b); ladder(a, await api('/api/models')); await catalog(b, a); }
      else if (tab === 'behave') { const s = await api('/api/settings');
        const tgToken = h('input', { class: 'field sm', type: 'password', placeholder: s.telegram.set ? 'Токен бота сохранён' : 'Токен бота', autocomplete: 'off', 'aria-label': 'Токен Telegram-бота' }), tgChat = h('input', { class: 'field sm', value: s.telegram.chat, placeholder: 'ID чата команды', 'aria-label': 'ID чата' });
        body.replaceChildren(
          h('div', { class: 'card' }, h('h3', null, 'Голос'), h('p', { class: 'hint' }, s.voice.stt ? `Речь распознаётся на этом компьютере (${s.voice.model}).` : 'Распознавание речи на компьютере не настроено: нужны whisper.cpp, ffmpeg и модель ggml (см. README). Текстом всё работает.'),
            h('div', { class: 'row', style: 'margin-top:14px;flex-wrap:wrap' }, h('div', { class: 'grow' }, 'Озвучивать ответы'), seg([['always', 'Всегда'], ['voice', 'На голос'], ['never', 'Никогда']], s.speak, async (v) => { S.speak = v; await api('/api/settings', { body: { speak: v } }); }))),
          h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', null, 'Инициатива'), h('p', { class: 'hint' }, 'VIT может сам задать вопрос, когда видит, что это поможет вашей цели. Не чаще раза в шесть часов.')), toggle(s.proactive, async (on) => { await api('/api/settings', { body: { proactive: on } }); }))),
          h('div', { class: 'card' }, h('h3', null, 'Связь с командой'), h('p', { class: 'hint' }, s.telegram.set ? 'Заявки уходят в Telegram-чат команды.' : 'Подключите Telegram-бота, и заявки будут мгновенно приходить исполнителям.'),
            h('div', { class: 'model', style: 'border:0;padding-bottom:0' }, h('div', { class: 'inputs' }, tgToken, tgChat), h('div', { class: 'acts', style: 'grid-column:1/-1' }, h('button', { class: 'btn sm ghost', onclick: async () => { const t = { chat: tgChat.value }; if (tgToken.value) t.token = tgToken.value; await api('/api/settings', { body: { telegram: t } }); toast('Сохранено'); } }, 'Сохранить'), h('a', { href: '/team', target: '_blank', rel: 'noopener', style: 'font-size:13px' }, 'Пульт команды'))))); }
      else if (tab === 'data') { const s = await api('/api/settings');
        body.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Ваши данные'), h('p', { class: 'hint' }, 'Диалоги, память и работы лежат в одном файле на этом компьютере. Их можно выгрузить или удалить в любой момент.'),
          h('div', { style: 'margin-top:8px' }, h('div', { class: 'kv' }, h('span', null, 'Сообщений'), String(s.stats.messages)), h('div', { class: 'kv' }, h('span', null, 'Узлов памяти'), String(s.stats.nodes)), h('div', { class: 'kv' }, h('span', null, 'Работ'), String(s.stats.jobs))),
          h('div', { class: 'row', style: 'margin-top:12px;flex-wrap:wrap' }, h('a', { class: 'btn sm ghost', href: '/api/export', download: '' }, 'Выгрузить всё'), h('button', { class: 'btn sm danger', onclick: async () => { if (!confirm('Удалить все диалоги, память, работы и заявки? Это нельзя отменить.')) return; await api('/api/data', { method: 'DELETE' }); location.hash = ''; location.reload(); } }, 'Удалить всё')))); }
      else body.replaceChildren(
        h('div', { class: 'card faq' }, h('h3', { style: 'margin-bottom:6px' }, 'Вопросы и ответы'), FAQ.map(([q, a]) => h('details', null, h('summary', null, q), h('p', null, a)))),
        h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:12px' }, 'Клавиши'), h('div', { class: 'keys' }, h('kbd', null, 'Enter'), 'Отправить сообщение', h('kbd', null, 'Shift + Enter'), 'Новая строка', h('kbd', null, '← →'), 'Листать миры на ленте и статьи на полке', h('kbd', null, 'Esc'), 'Закрыть окно или пропустить приветствие')),
        h('div', { class: 'card' }, h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('div', { class: 'grow' }, h('h3', null, 'Приветствие'), h('p', { class: 'hint' }, '«Добро пожаловать в экосистему VITON13» на пяти языках.')), h('button', { class: 'btn sm ghost', onclick: () => runIntro() }, 'Показать ещё раз'))),
        h('div', { class: 'card soft' }, h('h3', null, 'Нужна помощь человека?'), h('p', { class: 'hint' }, 'Напишите VIT, что случилось, — он передаст заявку команде VITON13. Справка экосистемы: ', h('a', { href: 'https://www.viton13.com/help', target: '_blank', rel: 'noopener noreferrer' }, 'viton13.com/help'), '.')));
    } catch (e) { body.replaceChildren(h('div', { class: 'empty' }, e.message)); }
  }
  paint();
  return { root };
}
