// The developer agent writes the content; VIT sets it into a clean one-page site, so the result always looks finished.
const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderSite(c = {}) {
  const f = (Array.isArray(c.features) ? c.features : []).slice(0, 3), steps = (Array.isArray(c.steps) ? c.steps : []).slice(0, 4);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(c.brand || 'Новый проект')}</title><meta name="description" content="${e(c.intro || '')}">
<style>
:root{--ink:#1d1d1f;--mute:#6e6e73;--soft:#f5f5f7;--line:rgba(0,0,0,.08);--blue:#0071e3}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif;color:var(--ink);background:#fff;-webkit-font-smoothing:antialiased;line-height:1.5}
nav{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:14px 24px;background:rgba(255,255,255,.8);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line);font-size:14px;z-index:2}
nav b{font-size:17px;letter-spacing:-.02em}.btn{display:inline-block;background:var(--blue);color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px}
nav .btn{padding:8px 16px;font-size:13px}
.hero{text-align:center;padding:clamp(72px,14vw,150px) 24px clamp(56px,10vw,110px);background:radial-gradient(60% 50% at 50% 0,#eef4ff,transparent 70%)}
h1{font-size:clamp(40px,8vw,84px);line-height:1.04;letter-spacing:-.04em;margin:0 auto 20px;max-width:14ch;font-weight:700}
.hero p{font-size:clamp(18px,2.4vw,24px);color:var(--mute);max-width:36ch;margin:0 auto 32px}
section{max-width:1040px;margin:0 auto;padding:clamp(48px,8vw,96px) 24px}
h2{font-size:clamp(28px,4.4vw,48px);letter-spacing:-.03em;line-height:1.1;margin:0 0 28px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.card{background:var(--soft);border-radius:24px;padding:28px}.card h3{margin:0 0 8px;font-size:21px;letter-spacing:-.02em}.card p{margin:0;color:var(--mute)}
.about{font-size:clamp(20px,2.6vw,28px);line-height:1.35;letter-spacing:-.015em;max-width:30ch}
ol{list-style:none;padding:0;margin:0;display:grid;gap:12px;counter-reset:s}ol li{counter-increment:s;display:flex;gap:16px;align-items:baseline;padding:18px 0;border-top:1px solid var(--line);font-size:19px}
ol li::before{content:counter(s,decimal-leading-zero);color:var(--mute);font-variant-numeric:tabular-nums;font-size:14px}
.end{text-align:center;background:#0b0b0d;color:#fff;border-radius:32px;padding:clamp(48px,8vw,88px) 24px;margin:0 16px 16px}.end h2{color:#fff}.end p{color:#a1a1a6;margin:0 0 28px}
footer{text-align:center;color:var(--mute);font-size:12px;padding:28px}
</style></head><body>
<nav><b>${e(c.brand || 'Новый проект')}</b><a class="btn" href="#contact">${e(c.cta || 'Связаться')}</a></nav>
<header class="hero"><h1>${e(c.tagline || c.brand || 'Новый проект')}</h1><p>${e(c.intro || '')}</p><a class="btn" href="#contact">${e(c.cta || 'Связаться')}</a></header>
${f.length ? `<section><h2>Почему мы</h2><div class="grid">${f.map((x) => `<div class="card"><h3>${e(x?.title)}</h3><p>${e(x?.text)}</p></div>`).join('')}</div></section>` : ''}
${c.about ? `<section><p class="about">${e(c.about)}</p></section>` : ''}
${steps.length ? `<section><h2>Как это работает</h2><ol>${steps.map((s) => `<li>${e(s)}</li>`).join('')}</ol></section>` : ''}
<div class="end" id="contact"><h2>${e(c.cta || 'Начнём')}</h2><p>${e(c.contact || 'Оставьте заявку — ответим в течение дня.')}</p><a class="btn" href="#">${e(c.cta || 'Связаться')}</a></div>
<footer>Черновик сайта собран агентами VIT · VITON13 OS</footer></body></html>`;
}
