// Emoji for the messenger: a small glass panel with sections and the ones you used lately.
// The system draws the emoji itself (Apple Color Emoji on a Mac), so they look the same as everywhere else on the device.
const SETS = [
  ['🙂', 'Смайлы', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 😴 😷 🤒 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 🤡 👻 👽 🤖 💩'],
  ['👋', 'Жесты', '👋 🤚 🖐 ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🦾 🫶 👀 🧠 🫀 💅 🤳'],
  ['❤️', 'Сердца', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💌 🌹 💐'],
  ['🐶', 'Природа', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦅 🦉 🐺 🐴 🦄 🐝 🦋 🐢 🐍 🐙 🐬 🐳 🦈 🌵 🌲 🌴 🌱 🍀 🍁 🌸 🌻 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ ❄️ 🌊'],
  ['🍕', 'Еда', '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍆 🥦 🌽 🥕 🥐 🍞 🧀 🥚 🍳 🥞 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🍣 🍜 🍝 🥗 🍰 🎂 🍩 🍪 🍫 🍿 ☕ 🍵 🥤 🍷 🥂 🍾 🍺'],
  ['⚽', 'Дела', '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🥊 🏋️ 🚴 🏊 🧘 🏆 🥇 🎯 🎮 🎲 🎸 🎹 🎧 🎤 🎬 🎨 📚 ✏️ 💻 📱 ⌚ 📷 💡 🔑 💼 📈 💰 💳 🎁 🎉 🎊 🚀 ✈️ 🚗 🏠 🏝 🗽 🌍'],
  ['✅', 'Символы', '✅ ☑️ ✔️ ❌ ❗ ❓ ‼️ ⁉️ 💯 🔝 🆗 🆕 🆒 ♻️ ⚠️ 🚫 ⛔ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ ➕ ➖ ➗ ✖️ 💲 ©️ ®️ ™️ #️⃣ 🔟 ➡️ ⬅️ ⬆️ ⬇️ 🔁 ⏰ ⏳'],
];
const KEY = 'vit.emoji.recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const remember = (e) => { try { localStorage.setItem(KEY, JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, 24))); } catch { /* private mode */ } };

/** True when a message is only a few emoji — it is then shown large, without a bubble. */
export function onlyEmoji(text) {
  const t = String(text || '').trim(); if (!t || t.length > 24) return false;
  const seg = [...new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(t.replace(/\s+/g, ''))];
  return seg.length >= 1 && seg.length <= 3 && seg.every((s) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s.segment));
}

/** emojiPicker({ h, onPick }) → { el, toggle(), close() } — a panel that opens above the composer. */
export function emojiPicker({ h, onPick }) {
  let tab = recent().length ? 'recent' : 0;
  const grid = h('div', { class: 'em-grid', role: 'listbox', 'aria-label': 'Эмодзи' }), title = h('div', { class: 'em-title' });
  const tabs = h('div', { class: 'em-tabs', role: 'tablist' });
  const el = h('div', { class: 'em-panel hide', role: 'dialog', 'aria-label': 'Эмодзи' }, title, grid, tabs);
  function paint() {
    const list = tab === 'recent' ? recent() : SETS[tab][2].split(' ');
    title.textContent = tab === 'recent' ? 'Недавние' : SETS[tab][1];
    grid.replaceChildren(...(list.length ? list : ['🙂']).map((e) => h('button', { class: 'em-e', type: 'button', role: 'option', title: e, onclick: () => { remember(e); onPick(e); } }, e)));
    tabs.replaceChildren(h('button', { class: 'em-tab' + (tab === 'recent' ? ' on' : ''), type: 'button', title: 'Недавние', onclick: () => { tab = 'recent'; paint(); } }, '🕘'),
      ...SETS.map(([ic, name], i) => h('button', { class: 'em-tab' + (tab === i ? ' on' : ''), type: 'button', title: name, onclick: () => { tab = i; paint(); grid.scrollTop = 0; } }, ic)));
  }
  const outside = (e) => { if (!el.contains(e.target) && !e.target.closest?.('.ms-emoji')) close(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  function open() { paint(); el.classList.remove('hide'); requestAnimationFrame(() => el.classList.add('in')); setTimeout(() => document.addEventListener('pointerdown', outside), 0); document.addEventListener('keydown', key); }
  function close() { el.classList.remove('in'); el.classList.add('hide'); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); }
  return { el, toggle: () => (el.classList.contains('hide') ? open() : close()), close };
}
