// The catalogue of open models: free, openly released weights that run on this computer through Ollama.
// Names and sizes were checked against the Ollama registry on 2026-11-11. VIT installs, selects and removes them from Settings.
import os from 'node:os';
import { getSetting } from '../db.mjs';

export const CATALOG = [
  {"kind": "chat", "id": "qwen3:4b", "name": "Qwen 3 · 4B", "by": "Alibaba", "license": "Apache 2.0", "note": "Быстрая и лёгкая. Разговор и короткие задачи, хорошо знает русский.", "gb": 2.5},
  {"kind": "chat", "id": "qwen3:8b", "name": "Qwen 3 · 8B", "by": "Alibaba", "license": "Apache 2.0", "note": "Заметно умнее младшей, всё ещё быстрая на обычном ноутбуке.", "gb": 5.2},
  {"kind": "chat", "id": "qwen3:14b", "name": "Qwen 3 · 14B", "by": "Alibaba", "license": "Apache 2.0", "note": "Сильная универсальная модель для работы агентов.", "gb": 9.3},
  {"kind": "chat", "id": "qwen3:30b", "name": "Qwen 3 · 30B", "by": "Alibaba", "license": "Apache 2.0", "note": "Старшая в семействе: длинные и сложные задачи.", "gb": 18.6},
  {"kind": "chat", "id": "gemma3:4b", "name": "Gemma 3 · 4B", "by": "Google", "license": "Gemma", "note": "Лёгкая, понимает картинки, аккуратный язык.", "gb": 3.4},
  {"kind": "chat", "id": "gemma3:12b", "name": "Gemma 3 · 12B", "by": "Google", "license": "Gemma", "note": "Ровные, грамотные тексты; понимает картинки.", "gb": 8.2},
  {"kind": "chat", "id": "gemma3:27b", "name": "Gemma 3 · 27B", "by": "Google", "license": "Gemma", "note": "Старшая Gemma: качество ближе к облачным моделям.", "gb": 17.4},
  {"kind": "chat", "id": "gemma3n:e4b", "name": "Gemma 3n · E4B", "by": "Google", "license": "Gemma", "note": "Модель Google для ноутбуков и мобильных устройств.", "gb": 9.8},
  {"kind": "chat", "id": "llama3.2:3b", "name": "Llama 3.2 · 3B", "by": "Meta", "license": "Llama 3.2", "note": "Очень быстрая, для простых ответов и черновиков.", "gb": 2},
  {"kind": "chat", "id": "llama3.3:70b", "name": "Llama 3.3 · 70B", "by": "Meta", "license": "Llama 3.3", "note": "Большая модель: нужна мощная машина с большим объёмом памяти.", "gb": 42.5},
  {"kind": "chat", "id": "mistral:7b", "name": "Mistral · 7B", "by": "Mistral AI", "license": "Apache 2.0", "note": "Классическая лёгкая модель, быстрая и предсказуемая.", "gb": 4.4},
  {"kind": "chat", "id": "mistral-small3.2:24b", "name": "Mistral Small 3.2 · 24B", "by": "Mistral AI", "license": "Apache 2.0", "note": "Точно следует инструкциям, хороша для агентов.", "gb": 15.2},
  {"kind": "chat", "id": "phi4-mini:3.8b", "name": "Phi-4 mini · 3.8B", "by": "Microsoft", "license": "MIT", "note": "Маленькая, но рассудительная: короткие задачи и логика.", "gb": 2.5},
  {"kind": "chat", "id": "phi4:14b", "name": "Phi-4 · 14B", "by": "Microsoft", "license": "MIT", "note": "Сильная логика и структура ответа.", "gb": 9.1},
  {"kind": "chat", "id": "gpt-oss:20b", "name": "gpt-oss · 20B", "by": "OpenAI", "license": "Apache 2.0", "note": "Открытая модель OpenAI с рассуждением и вызовом инструментов.", "gb": 13.8},
  {"kind": "chat", "id": "granite3.3:8b", "name": "Granite 3.3 · 8B", "by": "IBM", "license": "Apache 2.0", "note": "Деловые задачи: документы, выжимки, структурированные ответы.", "gb": 4.9},
  {"kind": "reason", "id": "deepseek-r1:8b", "name": "DeepSeek R1 · 8B", "by": "DeepSeek", "license": "MIT", "note": "Рассуждает шаг за шагом перед ответом.", "gb": 5.2},
  {"kind": "reason", "id": "deepseek-r1:14b", "name": "DeepSeek R1 · 14B", "by": "DeepSeek", "license": "MIT", "note": "Глубже разбирает сложные задачи и расчёты.", "gb": 9},
  {"kind": "reason", "id": "deepseek-r1:32b", "name": "DeepSeek R1 · 32B", "by": "DeepSeek", "license": "MIT", "note": "Самая сильная R1 для домашней машины с большим объёмом памяти.", "gb": 19.9},
  {"kind": "reason", "id": "qwq:32b", "name": "QwQ · 32B", "by": "Alibaba", "license": "Apache 2.0", "note": "Модель-рассуждатель: планирование и трудные вопросы.", "gb": 19.9},
  {"kind": "reason", "id": "phi4-reasoning:14b", "name": "Phi-4 reasoning · 14B", "by": "Microsoft", "license": "MIT", "note": "Рассуждение при скромных требованиях к памяти.", "gb": 11.1},
  {"kind": "reason", "id": "magistral:24b", "name": "Magistral · 24B", "by": "Mistral AI", "license": "Apache 2.0", "note": "Рассуждает прозрачно, на многих языках.", "gb": 14.3},
  {"kind": "code", "id": "qwen2.5-coder:7b", "name": "Qwen 2.5 Coder · 7B", "by": "Alibaba", "license": "Apache 2.0", "note": "Пишет и правит код, быстрая.", "gb": 4.7},
  {"kind": "code", "id": "qwen2.5-coder:14b", "name": "Qwen 2.5 Coder · 14B", "by": "Alibaba", "license": "Apache 2.0", "note": "Увереннее в больших файлах и рефакторинге.", "gb": 9},
  {"kind": "code", "id": "qwen3-coder:30b", "name": "Qwen 3 Coder · 30B", "by": "Alibaba", "license": "Apache 2.0", "note": "Агентное программирование: длинные задачи в коде.", "gb": 18.6},
  {"kind": "code", "id": "devstral:24b", "name": "Devstral · 24B", "by": "Mistral AI", "license": "Apache 2.0", "note": "Создана для агентов-разработчиков.", "gb": 14.3},
  {"kind": "code", "id": "codegemma:7b", "name": "CodeGemma · 7B", "by": "Google", "license": "Gemma", "note": "Дополнение и генерация кода.", "gb": 5},
  {"kind": "code", "id": "deepseek-coder-v2:16b", "name": "DeepSeek Coder V2 · 16B", "by": "DeepSeek", "license": "DeepSeek", "note": "Сильная в алгоритмах и объяснении кода.", "gb": 8.9},
  {"kind": "vision", "id": "llama3.2-vision:11b", "name": "Llama 3.2 Vision · 11B", "by": "Meta", "license": "Llama 3.2", "note": "Понимает фото, скриншоты и документы.", "gb": 7.8},
  {"kind": "vision", "id": "qwen2.5vl:7b", "name": "Qwen 2.5 VL · 7B", "by": "Alibaba", "license": "Apache 2.0", "note": "Читает текст на изображениях, таблицы и схемы.", "gb": 6},
  {"kind": "vision", "id": "minicpm-v:8b", "name": "MiniCPM-V · 8B", "by": "OpenBMB", "license": "Apache 2.0", "note": "Компактная модель для картинок и текста на них.", "gb": 5.5},
  {"kind": "vision", "id": "llava:7b", "name": "LLaVA · 7B", "by": "LLaVA team", "license": "Apache 2.0", "note": "Классическая модель «картинка → описание».", "gb": 4.7},
  {"kind": "vision", "id": "moondream:1.8b", "name": "Moondream · 1.8B", "by": "Moondream", "license": "Apache 2.0", "note": "Крошечная: опишет картинку даже на слабой машине.", "gb": 1.7},
  {"kind": "embed", "id": "bge-m3:latest", "name": "BGE-M3", "by": "BAAI", "license": "MIT", "note": "Память VIT: поиск по смыслу на ста языках. Рекомендуем.", "gb": 1.2},
  {"kind": "embed", "id": "nomic-embed-text:latest", "name": "Nomic Embed Text", "by": "Nomic", "license": "Apache 2.0", "note": "Очень лёгкая модель поиска по смыслу.", "gb": 0.3},
  {"kind": "embed", "id": "mxbai-embed-large:latest", "name": "mxbai-embed-large", "by": "Mixedbread", "license": "Apache 2.0", "note": "Точный поиск по смыслу, в основном английский.", "gb": 0.7},
  {"kind": "embed", "id": "snowflake-arctic-embed2:latest", "name": "Arctic Embed 2", "by": "Snowflake", "license": "Apache 2.0", "note": "Многоязычный поиск по смыслу.", "gb": 1.2},
  {"kind": "embed", "id": "embeddinggemma:300m", "name": "EmbeddingGemma · 300M", "by": "Google", "license": "Gemma", "note": "Маленькая модель поиска для слабых устройств.", "gb": 0.6}
];
export const KINDS = [['chat', 'Разговор'], ['reason', 'Рассуждение'], ['code', 'Код'], ['vision', 'Зрение'], ['embed', 'Память']];
const need = (gb) => Math.ceil(gb * 1.25 + 2);            // memory the model wants while it runs, with room for the system
const base = () => (getSetting('models', {}).local?.url || process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const same = (a, b) => a === b || a === b + ':latest' || b === a + ':latest';

async function installed() { try { const r = await fetch(base() + '/api/tags', { signal: AbortSignal.timeout(2500) }); return { up: true, names: ((await r.json()).models || []).map((m) => m.name) }; } catch { return { up: false, names: [] }; } }

export async function handle({ req, res, url, seg, method, json, fail, body }) {
  if (seg[1] !== 'catalog') return false;
  if (method === 'GET' && !seg[2]) {
    const ram = Math.round(os.totalmem() / 2 ** 30), { up, names } = await installed();
    const items = CATALOG.map((m) => ({ ...m, need: need(m.gb), fits: need(m.gb) <= ram, have: names.some((n) => same(n, m.id)) }))
      .sort((a, b) => Number(b.fits) - Number(a.fits) || (a.fits ? b.gb - a.gb : a.gb - b.gb));                    // what this machine can run first, strongest on top
    json(200, { ok: true, ollama: up, ram, kinds: KINDS, items }); return true;
  }
  const known = (id) => CATALOG.find((m) => m.id === id);
  if (method === 'POST' && seg[2] === 'pull') {                       // download with live progress
    const b = await body(), m = known(b.id); if (!m) { fail(400, 'Нет такой модели в каталоге'); return true; }
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    const send = (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); }, ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
      const r = await fetch(base() + '/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: m.id, stream: true }), signal: ac.signal });
      if (!r.ok || !r.body) throw new Error('Ollama не отвечает');
      const dec = new TextDecoder(); let buf = '', last = -1;
      for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; const d = JSON.parse(line);
          if (d.error) throw new Error(d.error); const pct = d.total ? Math.floor((d.completed || 0) / d.total * 100) : null;
          if (pct !== null && pct !== last) { last = pct; send({ type: 'progress', pct, status: d.status }); } else if (pct === null) send({ type: 'status', status: d.status }); } }
      send({ type: 'done' });
    } catch (e) { if (!ac.signal.aborted) send({ type: 'error', message: /fetch failed|ECONNREFUSED/.test(String(e.cause || e.message)) ? 'Ollama не запущена' : 'Не получилось скачать модель' }); }
    res.end(); return true;
  }
  if (method === 'DELETE' && seg[2]) {
    const m = known(decodeURIComponent(seg[2])); if (!m) { fail(400, 'Нет такой модели в каталоге'); return true; }
    try { const r = await fetch(base() + '/api/delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: m.id }), signal: AbortSignal.timeout(15000) }); json(200, { ok: r.ok }); } catch { fail(502, 'Ollama не отвечает'); }
    return true;
  }
  return false;
}
