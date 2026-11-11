# Миры экосистемы в приложении VIT

Мир — это раздел приложения (VJOURNAL, Store, Медицина, Hub…). Он подключается файлами и не трогает ядро.

## Клиент: `web/worlds/<id>.js`

```js
export default function view(ctx) { … return { root, destroy() {} }; }
```

- `root` — элемент с классом `view` (занимает всё место под верхней панелью: `flex:1; min-height:0`). Прокрутка — внутри, классом `scroll`.
- `ctx`: `h` (создание элементов), `icon(name)`, `api(path, {method, body})`, `toast(text)`, `when(ms)`, `md(text)`, `esc`, `css(href)` — подключить свой CSS, `me` — профиль, `theme()` — текущая тема, `go(view, arg)` — перейти в другой раздел, `askVit(text)` — открыть VIT с готовым вопросом.
- Свой CSS — `web/worlds/<id>.css`, классы с префиксом мира (`jr-`, `st-`, `md-`, `hb-`). Цвета, радиусы, шрифты — только из токенов `web/tokens.css` (`--ink`, `--panel`, `--blur`, `--r-lg`, `--mono`…), тогда мир работает во всех пяти темах: spatial, ribbon, axon, aurora (светлая), horizon.
- Готовые атомы: `.glass`, `.btn` (`.ghost`, `.line`, `.sm`, `.lg`), `.field`, `.seg`, `.switch`, `.tag`, `.cap`, `.icon-btn`, `.empty`, `.scroll`.
- Статика мира — в `web/worlds/<id>/…` (модели, картинки).

## Сервер: `server/worlds/<id>.mjs`

```js
export async function handle({ req, res, url, user, seg, method, json, fail, body }) {
  if (seg[1] !== 'journal') return false;           // /api/journal/…
  …; json(200, { ok: true, … }); return true;
}
```

Вызывается только для вошедшего человека. Внешние данные (сайт VITON13) — запрашивать с сервера, кешировать в памяти, отдавать приложению готовый JSON. Ничего не выдумывать: если источник недоступен — честное пустое состояние.

## Проверка в одиночку

`/worlds/_dev.html?world=<id>&theme=spatial` — монтирует один мир без остального приложения.
