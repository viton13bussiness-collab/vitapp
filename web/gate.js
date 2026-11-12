// The way into VITON13, like switching on a new phone: dust drifts in the dark, one calm question — VITON ID or a guest trial.
// And the plans sheet: what a guest, a VITON ID and the VIT subscription each get, with the one step that moves you up.
import { h, icon, api, css, toast } from '/kit.js';
import { createOrb } from '/orb.js';
css('/gate.css');

const SITE = 'https://www.viton13.com/ru';
const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* no storage */ } } };

/** gate({ onIn }) — shows the sign-in until the person is in, then calls onIn() and leaves. */
export function gate({ onIn }) {
  const canvas = h('canvas', { class: 'g-cosmos', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'g-stage' });
  const el = h('div', { class: 'gate', role: 'main' }, canvas, h('div', { class: 'g-glow', 'aria-hidden': 'true' }), stage);
  document.body.append(el);
  const orb = createOrb(canvas, { size: 1400, points: 14000, interactive: false, fit: 0.32, shape: 'scatter' });
  let cur = null;

  function show(step, dir = 1) {
    const next = STEPS[step](); next.classList.add(dir > 0 ? 'g-from-right' : 'g-from-left');
    const prev = cur; cur = next; stage.append(next);
    requestAnimationFrame(() => requestAnimationFrame(() => { next.classList.remove('g-from-right', 'g-from-left'); prev?.classList.add(dir > 0 ? 'g-to-left' : 'g-to-right'); }));
    if (prev) setTimeout(() => prev.remove(), 520);
    setTimeout(() => next.querySelector('[autofocus]')?.focus(), 380);
  }
  async function enter(promise, btn, err) {
    err.textContent = ''; btn.disabled = true; btn.classList.add('wait');
    try { const d = await promise(); store.set('vit.gate', ''); el.classList.add('g-out'); setTimeout(() => { orb.stop(); el.remove(); }, 900); await onIn();
      if (d?.moved) setTimeout(() => toast('Память, диалоги и бюджет гостевого профиля теперь в вашем VITON ID'), 1200); }
    catch (e) { err.textContent = e.message; btn.disabled = false; btn.classList.remove('wait'); }
  }
  const back = () => h('button', { class: 'g-back', onclick: () => show('hello', -1) }, icon('back'), 'Назад');

  const STEPS = {
    hello: () => h('section', { class: 'g-step g-hello' },
      h('img', { class: 'g-mark', src: '/logo-mark.png', alt: '' }),
      h('h1', { class: 'g-word' }, 'VITON', h('sup', null, '13')),
      h('p', { class: 'g-lead' }, 'Операционная система вашей жизни'),
      h('div', { class: 'g-actions' },
        h('button', { class: 'g-btn primary', onclick: () => show('id') }, 'Войти с VITON ID'),
        h('button', { class: 'g-btn', onclick: () => show('guest') }, 'Гостевой режим')),
      h('button', { class: 'g-link', onclick: () => plansSheet({ me: null }) }, 'Что входит в VITON ID и VIT')),

    id: () => {
      const email = h('input', { type: 'email', placeholder: 'Почта', autocomplete: 'username', autofocus: true, 'aria-label': 'Почта VITON ID' });
      const pass = h('input', { type: 'password', placeholder: 'Пароль', autocomplete: 'current-password', 'aria-label': 'Пароль' });
      const err = h('div', { class: 'g-err', role: 'alert' }), go = h('button', { class: 'g-btn primary', type: 'submit', disabled: true }, 'Войти');
      const ready = () => { go.disabled = !(email.value.includes('@') && pass.value.length >= 6); };
      email.oninput = ready; pass.oninput = ready;
      return h('section', { class: 'g-step' }, back(),
        h('img', { class: 'g-mark sm', src: '/logo-mark.png', alt: '' }),
        h('h2', null, 'Войдите с VITON ID'), h('p', { class: 'g-lead sm' }, 'Один аккаунт для всей экосистемы VITON13.'),
        h('form', { class: 'g-form', onsubmit: (e) => { e.preventDefault(); if (!go.disabled) enter(() => api('/api/auth/viton', { body: { email: email.value, password: pass.value } }), go, err); } },
          h('div', { class: 'g-group' }, email, pass), go, err),
        h('div', { class: 'g-links' }, h('a', { href: `${SITE}/recover`, target: '_blank', rel: 'noopener' }, 'Забыли пароль?'), h('a', { href: `${SITE}/register`, target: '_blank', rel: 'noopener' }, 'Создать VITON ID')),
        h('p', { class: 'g-fine' }, 'Пароль уходит только в VITON ID и нигде не хранится.'));
    },

    guest: () => {
      const name = h('input', { placeholder: 'Как к вам обращаться?', autocomplete: 'given-name', maxlength: 40, autofocus: true, 'aria-label': 'Ваше имя' });
      const err = h('div', { class: 'g-err', role: 'alert' }), go = h('button', { class: 'g-btn primary', type: 'submit' }, 'Продолжить как гость');
      const row = (ic, b, s) => h('li', null, h('span', { class: 'g-ic' }, icon(ic)), h('div', null, h('b', null, b), h('small', null, s)));
      return h('section', { class: 'g-step' }, back(),
        h('h2', null, 'Гостевой режим'), h('p', { class: 'g-lead sm' }, 'Попробуйте систему без аккаунта.'),
        h('ul', { class: 'g-list' },
          row('hub', 'Все миры открыты', 'Бюджет, мозг, браузер Meridian, журнал, магазин'),
          row('vit', 'VIT ответит пять раз', 'Чтобы почувствовать ассистента'),
          row('home', 'Только на этом компьютере', 'Профиль, память и бюджет хранятся здесь')),
        h('form', { class: 'g-form', onsubmit: (e) => { e.preventDefault(); enter(() => api('/api/auth/local', { body: { name: name.value } }), go, err); } },
          h('div', { class: 'g-group' }, name), go, err));
    },
  };
  show(store.get('vit.gate') === 'id' ? 'id' : 'hello');
}

// ── plans ───────────────────────────────────────────────────────────────────
const WHY = {
  vit: 'Ассистент VIT входит в подписку.', budget: 'Разбор бюджета делает ассистент VIT.', brain: 'С подпиской VIT мозг растёт сам — из разговоров и бюджета.',
  browser: 'Спросить VIT о странице можно с подпиской.', trial: 'Пробные сообщения закончились.', messages: 'Сообщения доступны с VITON ID.', meet: 'Встречи доступны с VITON ID.', apps: 'Скачивание приложений — с VITON ID.', music: 'Подбор музыки делает ассистент VIT.',
};
const PLAN_CARDS = [
  { id: 'guest', name: 'Гость', price: 'Попробовать', items: ['Все миры открыты', 'Бюджет, мозг и Meridian', 'VIT — пять пробных ответов', 'Данные только на этом компьютере'] },
  { id: 'id', name: 'VITON ID', price: 'Аккаунт экосистемы', items: ['Всё, что у гостя', 'Один вход для всех миров', 'Бюджет и цели ведёте сами', 'Мозг наполняете сами'] },
  { id: 'vit', name: 'VIT', price: 'Подписка', items: ['Всё из VITON ID', 'Ассистент VIT без ограничений', 'Сам считает бюджет и ведёт цели', 'Сам наполняет мозг', 'Агенты делают сайты и проекты'] },
];

/** plansSheet({ me, reason }) — what each level gives and the next step for this person. */
export function plansSheet({ me, reason } = {}) {
  document.querySelector('.plans')?.remove();
  const plan = me?.plan || null, close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); window.removeEventListener('keydown', key); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  const note = h('p', { class: 'p-note', role: 'status' });
  let cta = null;
  if (plan === 'guest') cta = h('button', { class: 'g-btn primary', onclick: async () => { store.set('vit.gate', 'id'); await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {}); location.hash = ''; location.reload(); } }, 'Войти с VITON ID');
  else if (plan === 'id') cta = h('button', { class: 'g-btn primary', onclick: async () => {
    cta.disabled = true;
    try { const d = await api('/api/requests', { body: { title: 'Подключить подписку VIT', detail: `Аккаунт: ${me.email}. Откуда: ${reason || 'настройки'}.` } });
      cta.textContent = `Заявка №${d.request.id} отправлена`; note.textContent = 'Подписка включится, как только команда VITON13 её подтвердит. Статус — в разделе «Заявки».'; }
    catch (e) { cta.disabled = false; note.textContent = e.message; } } }, 'Подключить VIT');
  else if (plan === 'vit') note.textContent = 'Подписка VIT активна. Ассистент работает без ограничений.';
  const el = h('div', { class: 'plans', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Что входит в VITON13', onclick: (e) => { if (e.target === el) close(); } },
    h('div', { class: 'p-sheet' },
      h('button', { class: 'p-x', 'aria-label': 'Закрыть', onclick: close }, '×'),
      h('h2', null, 'Что входит'), h('p', { class: 'p-why' }, WHY[reason] || 'Три уровня доступа к системе VITON13.'),
      h('div', { class: 'p-cards' }, PLAN_CARDS.map((c) => h('div', { class: 'p-card' + (c.id === plan ? ' on' : '') + (c.id === 'vit' ? ' best' : '') },
        h('div', { class: 'p-top' }, h('b', null, c.name), c.id === plan && h('span', { class: 'p-now' }, 'Сейчас')), h('small', null, c.price),
        h('ul', null, c.items.map((t) => h('li', null, t)))))),
      h('div', { class: 'p-foot' }, cta, note)));
  document.body.append(el); window.addEventListener('keydown', key);
  requestAnimationFrame(() => el.classList.add('in'));
}
