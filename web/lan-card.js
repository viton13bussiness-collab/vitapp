// Settings → Профиль → «iPhone и iPad»: open VITON13 to the home Wi‑Fi, show a one-time QR code, list paired devices.
// Shown only on the Mac itself — a phone cannot manage the door it came through.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const STEPS = ['Отсканируйте QR-код камерой iPhone', 'Откройте ссылку в Safari', 'Поделиться → «На экран Домой»'];

export function phoneCard({ h, api, toast, toggle }) {
  if (!LOCAL) return null;
  const body = h('div', { class: 'lan-body' }), sw = h('span');
  const card = h('div', { class: 'card lan-card' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('span', { class: 'cap' }, 'iPhone и iPad'), h('h3', null, 'VITON13 на телефоне'),
    h('p', { class: 'hint' }, 'Телефон открывает приложение с этого Mac по домашней сети — как приложение на экране Домой.')), sw), body);
  let timer = 0;
  const when = (ms) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  async function paint(st) {
    clearInterval(timer);
    sw.replaceChildren(h('label', { class: 'lan-sw' }, h('span', null, 'Открыть по домашней сети'), toggle(st.on, async (on) => { try { paint(await api('/api/lan', { body: { on } })); } catch (e) { toast(e.message); } })));
    if (!st.on) return body.replaceChildren(h('p', { class: 'hint lan-off' }, st.ip ? `Выключено. Когда включите, телефон в той же Wi‑Fi сети сможет подключиться к ${st.ip}.` : 'Mac сейчас не в Wi‑Fi сети.'));
    if (!st.url) return body.replaceChildren(h('p', { class: 'hint' }, 'Не нашёл адрес Mac в домашней сети. Подключитесь к Wi‑Fi и включите снова.'));
    const qr = h('div', { class: 'lan-qr' }), codeEl = h('b', { class: 'lan-code' }), left = h('small', { class: 'hint' });
    const fresh = async () => {
      try { const c = await api('/api/lan/code', { method: 'POST', body: {} }); qr.innerHTML = c.svg; codeEl.textContent = c.code.replace(/(....)(....)/, '$1 $2');
        clearInterval(timer); const tick = () => { const s = Math.max(0, Math.round((c.exp - Date.now()) / 1000)); left.textContent = s ? `Код действует ещё ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Код устарел'; if (!s) clearInterval(timer); }; tick(); timer = setInterval(() => { if (!card.isConnected) return clearInterval(timer); tick(); }, 1000); }
      catch (e) { toast(e.message); }
    };
    const devs = st.devices.length ? h('div', { class: 'lan-devs' }, h('span', { class: 'cap' }, 'Подключены'), st.devices.map((d) => h('div', { class: 'row lan-dev' },
      h('div', { class: 'grow' }, h('b', null, d.name), h('small', { class: 'hint' }, `с ${when(d.created)} · был ${when(d.seen)}`)),
      h('button', { class: 'btn sm ghost', onclick: async () => { try { paint(await api('/api/lan/devices/' + d.id, { method: 'DELETE' })); toast(`${d.name} отключён`); } catch (e) { toast(e.message); } } }, 'Отключить')))) : '';
    body.replaceChildren(h('div', { class: 'lan-pair' }, qr,
      h('div', { class: 'lan-side' }, h('ol', { class: 'lan-steps' }, STEPS.map((s) => h('li', null, s))),
        h('div', { class: 'lan-codebox' }, h('span', { class: 'cap' }, 'Или введите код'), codeEl, left),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('button', { class: 'btn sm ghost', onclick: fresh }, 'Новый код')),
        h('p', { class: 'hint lan-url' }, st.url))),
      devs, h('p', { class: 'hint lan-note' }, 'Телефон и Mac должны быть в одной Wi‑Fi сети, а VITON13 на Mac — открыт. Связь внутри домашней сети идёт без шифрования; камера, голос, кружки и Meridian на телефоне пока не работают — им нужен защищённый адрес (https).'));
    fresh();
  }
  api('/api/lan').then(paint).catch((e) => body.replaceChildren(h('p', { class: 'hint' }, e.message)));
  return card;
}
