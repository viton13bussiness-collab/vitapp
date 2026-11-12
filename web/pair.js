// Pairing a phone with VITON13 on the Mac. iOS keeps a separate cookie jar for a home-screen app, so the code is used
// where the app will live: inside the home-screen app (standalone) — or here in Safari if the person chooses to.
const $ = (id) => document.getElementById(id);
const code = new URLSearchParams(location.search).get('c') || '';
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const form = $('form'), input = $('code'), go = $('go'), err = $('err'), lead = $('lead'), steps = $('steps');

async function paired() { try { const r = await fetch('/api/me', { cache: 'no-store' }); return r.ok && !!(await r.json()).me; } catch { return false; } }
async function claim(c) {
  err.textContent = ''; go.disabled = true;
  try {
    const r = await fetch('/api/pair/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) }), d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Не получилось подключиться');
    lead.textContent = 'Готово. Открываю VITON13…'; form.classList.add('hide'); location.replace('/');
  } catch (e) { err.textContent = e.message; go.disabled = false; form.classList.remove('hide'); }
}
function manual(text) { lead.textContent = text; form.classList.remove('hide'); steps.classList.remove('hide'); input.value = code; go.disabled = input.value.length < 6; input.focus(); }
input.addEventListener('input', () => { go.disabled = input.value.replace(/\s/g, '').length < 6; });
form.addEventListener('submit', (e) => { e.preventDefault(); claim(input.value || code); });

if (await paired()) location.replace('/');
else if (code && standalone) claim(code);                           // first launch from the home screen
else if (code) {                                                    // just scanned in Safari: keep the code for the home-screen app
  lead.innerHTML = 'Нажмите <b>Поделиться</b> → <b>На экран Домой</b>. VITON13 откроется как приложение — без адресной строки. Код действует 10 минут.';
  go.textContent = 'Или открыть здесь, в Safari'; go.disabled = false; form.classList.remove('hide'); input.classList.add('hide'); input.value = code;
} else manual('Введите код с экрана Mac или отсканируйте QR-код ещё раз.');
