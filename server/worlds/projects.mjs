// The open-source projects VITON13 stands on, with what each one does here and whether it is alive on this computer right now.
import fs from 'node:fs';
import path from 'node:path';
import { getSetting } from '../db.mjs';
import { voiceStatus } from '../voice.mjs';
import { ROOT } from '../config.mjs';

const has = (bin) => [...(process.env.PATH || '').split(':'), '/opt/homebrew/bin', '/usr/local/bin'].some((d) => d && fs.existsSync(path.join(d, bin)));
const vendored = (rel) => fs.existsSync(path.join(ROOT, 'web', rel));

export async function handle({ url, seg, method, json }) {
  if (seg[1] !== 'projects' || method !== 'GET') return false;
  const base = (getSetting('models', {}).local?.url || process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  let ollama = { up: false, version: '', models: 0 };
  try { const [v, t] = await Promise.all([fetch(base + '/api/version', { signal: AbortSignal.timeout(2000) }).then((r) => r.json()), fetch(base + '/api/tags', { signal: AbortSignal.timeout(2000) }).then((r) => r.json())]); ollama = { up: true, version: v.version, models: (t.models || []).length }; } catch { /* not running */ }
  const voice = voiceStatus();
  const P = (group, name, repo, license, role, state, note) => ({ group, name, url: repo.startsWith('http') ? repo : `https://github.com/${repo}`, license, role, state, note });
  json(200, { ok: true, items: [
    P('Мозг', 'Ollama', 'ollama/ollama', 'MIT', 'Запускает открытые модели на этом компьютере — на них VIT думает без интернета и без оплаты.', ollama.up ? 'on' : 'off', ollama.up ? `работает · версия ${ollama.version} · моделей: ${ollama.models}` : 'не запущена — VIT пойдёт в облако, если есть ключ'),
    P('Мозг', 'Открытые модели', 'ollama/ollama', 'разные', 'Qwen, Gemma, Llama, DeepSeek, Mistral, Phi и другие — 38 проверенных в каталоге «Модели».', ollama.models ? 'on' : 'off', ollama.models ? `установлено: ${ollama.models}` : 'пока ни одной'),
    P('Голос', 'whisper.cpp', 'ggml-org/whisper.cpp', 'MIT', 'Распознаёт речь прямо на компьютере: звук никуда не уходит.', voice.stt ? 'on' : 'off', voice.stt ? `работает · ${voice.model}` : voice.whisper ? 'установлен, нет модели ggml' : 'не установлен: brew install whisper-cpp'),
    P('Голос', 'FFmpeg', 'FFmpeg/FFmpeg', 'LGPL/GPL', 'Приводит запись с микрофона к формату, который понимает распознавание.', voice.ffmpeg ? 'on' : 'off', voice.ffmpeg ? 'работает' : 'не установлен: brew install ffmpeg'),
    P('Интерфейс', 'three.js', 'mrdoob/three.js', 'MIT', '3D: фигура человека в Медицине и космос VIT.', vendored('vendor/three/three.module.min.js') ? 'on' : 'off', 'внутри приложения · r185'),
    P('Интерфейс', 'Draco', 'google/draco', 'Apache-2.0', 'Сжатие 3D-моделей: фигура весит два мегабайта вместо двадцати.', vendored('vendor/three/draco') ? 'on' : 'off', 'внутри приложения'),
    P('Интерфейс', 'marked', 'markedjs/marked', 'MIT', 'Оформляет ответы VIT и материалы агентов: списки, таблицы, код.', vendored('vendor/lib/marked.esm.js') ? 'on' : 'off', 'внутри приложения · 18.2.0'),
    P('Интерфейс', 'DOMPurify', 'cure53/DOMPurify', 'Apache-2.0', 'Чистит любой текст перед показом: чужой код в приложении не выполнится.', vendored('vendor/lib/purify.es.mjs') ? 'on' : 'off', 'внутри приложения · 3.4.17'),
    P('Интерфейс', 'Fuse.js', 'krisk/Fuse', 'Apache-2.0', 'Поиск по памяти, который прощает опечатки.', vendored('vendor/lib/fuse.basic.min.mjs') ? 'on' : 'off', 'внутри приложения · 7.5.0'),
    P('Основа', 'Node.js', 'nodejs/node', 'MIT', 'Сервер приложения: без единой внешней зависимости.', 'on', `работает · ${process.version}`),
    P('Основа', 'SQLite', 'sqlite/sqlite', 'Public Domain', 'Один файл, в котором лежат диалоги, память и заявки.', 'on', `работает · ${process.versions.sqlite || 'встроена в Node.js'}`),
    P('Основа', 'Electron', 'electron/electron', 'MIT', 'Окно приложения на Mac, Windows и Linux.', process.versions.electron ? 'on' : 'idle', process.versions.electron ? `работает · ${process.versions.electron}` : 'сейчас открыто в браузере'),
    P('Материалы', 'Human Base Meshes', 'https://www.blender.org/download/demo-files/', 'CC0', 'Фигуры человека от Blender Studio.', vendored('worlds/medicine/body/male.glb') ? 'on' : 'off', 'внутри приложения'),
    P('Материалы', 'Z-Anatomy', 'https://www.z-anatomy.com', 'CC BY-SA 4.0', 'Модели органов в карточках зон.', vendored('worlds/medicine/organs') ? 'on' : 'off', 'внутри приложения'),
  ] });
  return true;
}
