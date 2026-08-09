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

## Соглашения проекта

Описаны в [CLAUDE.md](CLAUDE.md): структура каталогов, именование страниц,
работа с формами через `useForm`, комментарии в коде.

## Рекомендуемые расширения VS Code

[Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar),
[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode),
[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer),
[Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
