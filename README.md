# easy-pl

Десктопное приложение на Tauri 2 + Vue 3 + TypeScript.

Стек: Vite 8, Tailwind CSS 4 + daisyUI 5, Vue Router 5, Pinia, VueUse, VeeValidate 4.

## Требования

- Node.js 20+
- Rust (stable) и системные зависимости Tauri: https://tauri.app/start/prerequisites/

## Запуск

```bash
npm install
npm run tauri dev
```

## Команды

| Команда | Действие |
| --- | --- |
| `npm run tauri dev` | приложение в режиме разработки |
| `npm run tauri build` | сборка дистрибутива |
| `npm run dev` | только фронтенд в браузере, http://localhost:1420 |
| `npm run build` | type-check и сборка фронтенда |

## Настройки сборки — `.env`

В корне лежит `.env` (в гит не попадает, образец — `.env.example`). Заполнять его
необязательно: без него приложение просит подключиться вручную.

| Ключ | Что делает |
| --- | --- |
| `VITE_SYNC_URL` | адрес сервера синхронизации — подставится сам при первом запуске |
| `VITE_SYNC_TOKEN` | ключ синхронизации — если указан, приложение стартует уже подключённым |

Заполнены оба — собранное приложение приезжает к людям настроенным: ни адреса,
ни кода подключения вводить не нужно, сразу видна кнопка «Синхронизировать».

**Это не хранилище секретов.** Vite подставляет значения `VITE_*` прямо в код на
этапе сборки, поэтому всё, что здесь написано, лежит открытым текстом внутри
установщика — распаковать и прочитать может кто угодно. Класть сюда `DISCORD_TOKEN`
нельзя: токен бота живёт секретом на Cloudflare и на компьютеры не попадает вовсе.
`VITE_SYNC_TOKEN` в этом смысле — осознанный размен: он и так уезжает всем внутри
кода подключения, но со сборкой расходится шире, чем строка в личном сообщении.
Не хотите — оставьте пустым и раздайте код подключения.

Значения читаются один раз, при первом запуске, и сохраняются в базу приложения.
Меняете адрес после раздачи сборки — людям придётся подключиться заново, из `.env`
он второй раз не подхватится.

## Соглашения проекта

Описаны в [CLAUDE.md](CLAUDE.md): структура каталогов, именование страниц,
работа с формами через `useForm`, комментарии в коде.

## Рекомендуемые расширения VS Code

[Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar),
[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode),
[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer),
[Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
