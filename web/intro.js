// The opening of the app. Dust drifts in the dark, the welcome passes in five languages, then the dust gathers
// into the VITON13 globe, the globe rises and the app is there. Without WebGL the mark simply fades in.
import { h, css } from '/kit.js';
import { createOrb } from '/orb.js';
css('/intro.css');

const HELLO = [['Welcome to the ecosystem', 'en'], ['Добро пожаловать в экосистему', 'ru'], ['Bienvenido al ecosistema', 'es'], ['Bienvenue dans l’écosystème', 'fr'], ['欢迎来到生态系统', 'zh']];

/** runIntro({ short }) → Promise that resolves when the welcome has left the screen. short: one phrase and the globe, about three seconds. */
export function runIntro({ short = false } = {}) {
  return new Promise((resolve) => {
    const lines = (short ? HELLO.slice(1, 2) : HELLO).map(([text, lang]) => h('div', { class: 'vi-line', lang }, text, ' ', h('b', null, 'VITON13')));
    const canvas = h('canvas', { class: 'vi-cosmos', 'aria-hidden': 'true' }), mark = h('img', { class: 'vi-mark', src: '/logo-mark.png', alt: '' });
    const el = h('div', { class: 'vi-intro', role: 'dialog', 'aria-label': 'Добро пожаловать в экосистему VITON13' }, canvas, h('div', { class: 'vi-veil' }), lines, mark, h('button', { class: 'vi-skip', onclick: () => finish() }, 'Пропустить'));
    document.body.append(el);
    const orb = createOrb(canvas, { size: 1200, points: 18000, interactive: false, fit: 0.2, shape: 'scatter' });
    const flat = (kind) => el.classList.toggle('vi-flat', kind !== 'webgl'); flat(orb.kind); orb.ready?.then(flat);
    let done = false; const timers = [], at = (ms, fn) => timers.push(setTimeout(fn, ms));
    function finish() {
      if (done) return; done = true; timers.forEach(clearTimeout); window.removeEventListener('keydown', key);
      el.classList.add('vi-out'); setTimeout(() => { orb.stop(); el.remove(); resolve(); }, 950);
    }
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } };
    window.addEventListener('keydown', key);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, hold = short ? 1050 : 1650, step = hold + 520; let t = short ? 200 : 500;
    lines.forEach((l) => { at(t, () => l.classList.add('vi-in')); at(t + hold, () => l.classList.add('vi-gone')); t += step; });
    const morph = reduce ? 0 : short ? 1200 : 1900, gather = short ? 700 : t - 250;      // short: the dust is already gathering under the words
    at(gather, () => { orb.shape('globe', morph); el.classList.add('vi-globe'); });
    const up = gather + morph + (short ? 350 : 1100);
    at(up, () => el.classList.add('vi-up'));
    at(up + (short ? 450 : 760), finish);
  });
}
