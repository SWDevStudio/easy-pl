# easy-pl

Десктопное приложение: Tauri 2 (Rust) + Vue 3 + TypeScript + Vite.

## Стек

| Слой | Инструмент |
| --- | --- |
| Оболочка | Tauri 2 (`src-tauri/`) |
| UI | Vue 3 (`<script setup lang="ts">`), Vite 8 |
| Стили | Tailwind CSS 4 (`@tailwindcss/vite`) + daisyUI 5, склейка классов — `tailwind-merge` + `clsx` |
| Роутинг | Vue Router 5 (`src/router/`) |
| Состояние | Pinia (`src/stores/`) |
| Утилиты | VueUse (`@vueuse/core`) |
| Формы | VeeValidate 4 |

## Команды

```bash
npm run tauri dev     # десктоп-приложение в режиме разработки
npm run tauri build   # сборка дистрибутива
npm run dev           # только фронтенд в браузере (localhost:1420)
npm run build         # type-check (vue-tsc) + сборка фронтенда
```

## Структура

```
src/
  components/
    form/       поля формы (обёртки над VeeValidate)
    ui/         общие компоненты (UiButton, UiModal, UiTable, UiPanel, UiStat)
    <домен>/    компоненты конкретного раздела (players, classes)
  composables/  composable-функции
  db/           клиент, миграции, репозитории, сид
  lottery/      жеребьёвка и пересчёт долга — чистые функции без БД
  pages/        страницы, лениво подключаются в роутере
  router/       конфигурация Vue Router
  stores/       Pinia-сторы
  utils/        чистые хелперы (cn)
  style.css     Tailwind, daisyUI, тема bdo
src-tauri/      Rust-часть: команды, конфиг, иконки
docs/SPEC.md    постановка задачи и алгоритм жеребьёвки
```

Алиас `@/*` указывает на `src/*` (настроен в `vite.config.ts` и `tsconfig.json`).

Роутер использует `createWebHashHistory`: в собранном Tauri-приложении нет
SPA-фоллбэка, и перезагрузка на вложенном маршруте в history-режиме даёт 404.

Фронтенд собирается **одним чанком** (`manualChunks` в `vite.config.ts`).
Страницы в роутере по-прежнему объявлены через `() => import(...)`, но Rollup
схлопывает их внутрь общего чанка. Сети нет, ассеты вшиты в бинарник, а дробление
на 13 файлов давало +12 КБ суммарно и водопад загрузки ради 55 КБ на первом
экране — при том что шрифты и CSS всё равно грузятся целиком.

## Правила

### Комментарии в коде не пишем

Код должен быть понятен без комментариев: говорящие имена, небольшие функции,
явные типы. Комментарии добавляются **только** по прямой просьбе пользователя.
Существующие комментарии при правке файла удаляются.

Исключение — директивы, влияющие на сборку или типизацию
(`@ts-expect-error`, `eslint-disable`, атрибуты Rust): это не комментарии.

### Стилизация — через `class` и `cn`, а не через пропсы

**Никаких пропсов-перечислений (`variant`, `size`, `color`) с маппингом в
классы внутри компонента.** У компонента есть дефолтная вёрстка, всё остальное
приходит снаружи обычным `class` и склеивается через `cn` из `@/utils/cn`
(`clsx` + `tailwind-merge`, донастроенный под классы daisyUI). При конфликте
побеждает то, что передал пользователь.

Обязательный шаблон для **каждого** компонента:

```vue
<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn, omitClass } from "@/utils/cn";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const rootAttrs = computed(() => omitClass(attrs));
</script>

<template>
  <button v-bind="rootAttrs" :class="cn('btn btn-primary', attrs.class)">
    <slot />
  </button>
</template>
```

- `inheritAttrs: false` + `v-bind="rootAttrs"` — чтобы атрибуты попадали на
  нужный элемент, а не всегда на корень;
- `omitClass` убирает `class` из `$attrs`, иначе Vue склеит его с `:class`
  конкатенацией в обход `tailwind-merge`;
- `attrs.class` идёт **последним** аргументом `cn` — он должен перебивать дефолт.

```vue
<UiButton>Обычная</UiButton>
<UiButton class="btn-ghost btn-xs">Призрачная маленькая</UiButton>
<UiButton class="btn btn-disabled">Заблокированная</UiButton>
```

Если у компонента несколько стилизуемых узлов, для остальных заводятся явные
пропсы-классы (`fieldClass`, `menuClass`, `wrapperClass`, `badgeClass`), тоже
пропускаемые через `cn`.

Новые классы daisyUI, которые должны конфликтовать между собой, добавляются в
`CLASS_GROUPS` в [src/utils/cn.ts](src/utils/cn.ts) — без этого `tailwind-merge`
не знает, что `btn-primary` и `btn-ghost` из одной группы.

Динамическая сборка классов (`` `btn-${variant}` ``) запрещена: Tailwind сканирует
исходники как текст и такой класс просто не попадёт в сборку.

### Типы не глушим

**`as` для приведения типов запрещён.** Единственное исключение — `as const`.
Также запрещены `any`, `@ts-ignore` и `!` для подавления «возможно null».

`as` не проверяет ничего, а лишь затыкает компилятору рот — ошибка всплывёт
в рантайме там, где её никто не ждёт. Вместо приведения:

| Вместо | Правильно |
| --- | --- |
| `useForm({...})` и `values.x as number` | `useForm<FormValues>({...})` — значения типизированы |
| `event.target as HTMLInputElement` | `if (!(target instanceof HTMLInputElement)) return` |
| `item[key as keyof T]` | функция-аксессор с честным `unknown` на выходе |
| `data as Row[]` | параметр дженерика: `db.select<Row[]>(...)` |
| `value as Foo` после проверки | type predicate: `function isFoo(v: unknown): v is Foo` |

Если тип действительно не выводится, это сигнал, что сигнатура или дженерик
описаны неверно — чинить надо там, а не приведением на месте использования.

Единственное место, где обойтись нечем, — адаптер над нетипизированным
драйвером БД в тестах: сигнатура `select<T>()` у плагина принципиально
нереализуема без утверждения, потому что драйвер отдаёт строки как есть. Там
стоит одна именованная функция-мост `bridgeRows`, и других таких мест быть не
должно. В продакшен-коде `as` по-прежнему запрещён.

### Таблицы: обычная пагинация, никакого бесконечного скролла

Длинные списки режутся **классической пагинацией со страницами** — номера,
«назад/вперёд». Не бесконечный скролл и не виртуализация.

Причина простая: с бесконечным скроллом нельзя дойти до конца списка, нельзя
вернуться на то же место после перехода в карточку, и непонятно, сколько всего
записей. Пагинация всё это решает и стоит дешевле в поддержке.

Живёт в [UiTable](src/components/ui/UiTable.vue), чтобы поведение было одинаковым
во всех таблицах. Применяется после фильтрации и сортировки; управление
скрывается, когда страница всего одна.

### Графики

Рисуем сами, inline SVG ([UiLineChart](src/components/ui/UiLineChart.vue)) —
внешние библиотеки не тянем: CSP в артефактах и десктопе всё равно не пустит CDN,
а нужный набор форм невелик.

- **Цвета серий — только из проверенного набора.** Категориальные слоты
  `#d95926`, `#3987e5`, `#199e70` прогнаны валидатором палитры под нашу
  поверхность `#241f17`: полоса светлоты, порог насыщенности, различимость при
  дальтонизме (ΔE ≥ 8) и контраст. Новые цвета добавлять только после прогона,
  не на глаз.
- **Никогда две шкалы Y на одном графике.** Разные единицы — разные графики.
- Линии 2px, сетка сплошной волосок, заливка области ~10% прозрачности.
- Подпись значения у конца линии только когда серия одна: при нескольких они
  сходятся справа и налезают друг на друга — там работает легенда и подсказка.
- **У каждого графика есть таблица-двойник** с теми же числами: подсказка при
  наведении дополняет, но не может быть единственным способом прочитать значение.
- Крупные числа (плитки, герой-цифра) — тем же шрифтом без засечек и без
  `tabular-nums`; моноширинные цифры только в колонках таблиц и на осях.

### Схема БД — только идемпотентные запросы

Любой DDL пишется так, чтобы повторный запуск не ронял приложение:
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `INSERT OR IGNORE`,
`DROP ... IF EXISTS`. Версия в `_migrations` — основная защита, идемпотентность —
подстраховка на случай прерванной миграции или ручного вмешательства в базу.

Миграции только добавляются новой версией, уже применённые не редактируются.
Ошибка внутри миграции заворачивается в `MigrationError` с номером и текстом
запроса — иначе в проде видно только «SQL error» без места падения.

`runMigrations` принимает `SqlExecutor`, а не `Database` из плагина, поэтому
схема прогоняется тестами на настоящем SQLite (`node:sqlite`) без запуска Tauri.
Любое изменение схемы обязано быть покрыто там же.

**`sql:default` не даёт права на запись.** Набор по умолчанию — это только
`allow-load`, `allow-select`, `allow-close`, поэтому `sql:allow-execute` в
[capabilities/default.json](src-tauri/capabilities/default.json) прописан
отдельно. Симптом при его отсутствии обманчивый: файл базы создаётся, ошибок
при подключении нет, а первый же DDL молча отбивается правами. Новые плагины
проверять по `src-tauri/gen/schemas/acl-manifests.json`, а не по названию
пермишена.

**Массовую запись делаем одним запросом, а не циклом.** У `tauri-plugin-sql` нет
транзакций, а `BEGIN`/`COMMIT` отдельными вызовами ненадёжны по той же причине,
что и `PRAGMA`: пул соединений, и `COMMIT` может уйти не в то соединение. Поэтому
пакетуем в один SQL — `INSERT ... VALUES (…), (…)` и
`UPDATE ... SET x = CASE id WHEN … END WHERE id IN (…)`, батчами по 100 строк.

Цикл из отдельных `UPDATE` — это отдельный автокоммит с fsync на каждую строку:
120 строк по одной занимают ~300 мс против ~2 мс одним запросом.

**На каскады `ON DELETE` полагаться нельзя.** `tauri-plugin-sql` держит пул
соединений, а `PRAGMA foreign_keys` действует только на то соединение, где его
выполнили — какое из пула достанется следующему запросу, неизвестно. Внешние
ключи в схеме остаются как документация и как страховка в тестах, но удаление
связанных строк пишется явными запросами в репозитории.

### Типографика: минимум 14px, приглушение цветом, а не прозрачностью

Приложением пользуются подолгу и в основном для чтения таблиц, поэтому:

| Что | Размер |
| --- | --- |
| Базовый текст, ячейки таблиц | 15–16px (`text-sm` — нижняя граница) |
| Заголовки колонок | 14px, полужирный, капс |
| Подписи, подсказки, пустые состояния | 14px, `text-muted` |
| Кнопки в строках таблицы | `btn-sm`, не `btn-xs` |

Размеры daisyUI `*-xs` и `table-sm` дают 11–12px — в интерфейсе не использовать.
Высота строки таблицы — не меньше 44px (`padding-block: 0.75rem`).

Вторичный текст приглушается **цветом `text-muted`**, а не `opacity-40/50/60`:
прозрачность роняет контраст ниже порога читаемости, и глаз добирает разницу
напряжением. `opacity` допустима только для декоративной графики — иконок,
рамок, разделителей.

Числовые колонки — `font-variant-numeric: tabular-nums` (уже включено для
`.table` и `.stat-figure-value`), иначе цифры «пляшут» при сравнении строк.

Палитра держит контраст текста к фону около 10:1, а не максимальные 21:1:
белое на чёрном даёт ореол и утомляет быстрее. Шрифт интерфейса — Inter
(подключён локально через `@fontsource-variable/inter`, без внешних запросов),
засечный только для заголовков.

### Страницы — в `src/pages/` с префиксом `Page`

Каждая страница лежит в `src/pages/` и называется `Page<Название>.vue`:
`PageHome.vue`, `PageSettings.vue`, `PageOrderList.vue`. Никаких `views/`,
`*View.vue`, `index.vue`. В роутере страницы подключаются лениво:

```ts
{
  path: "/settings",
  name: "settings",
  component: () => import("@/pages/PageSettings.vue"),
}
```

Всё, что не является страницей, — в `src/components/`.

### Формы — только через `useForm`

**Любая форма в проекте строится на `useForm` из VeeValidate.** Не использовать
ручные `ref`-ы для полей, самописную валидацию, `@submit` без `handleSubmit` и
компонент `<Form>` из vee-validate.

Обязательно:

- поля рендерятся компонентами из `@/components/form` — они сами берут значение
  и ошибку из контекста `useForm` по `name`;
- сабмит — только через `handleSubmit`;
- ошибки — из `errors` / `errorMessage`, не из локальных переменных;
- схема валидации задаётся в `validationSchema` при создании формы.

```vue
<script setup lang="ts">
import { useForm } from "vee-validate";
import { FormInput, FormSelect, FormSwitch } from "@/components/form";
import { UiButton } from "@/components/ui";

const roles = [
  { id: 1, name: "Администратор" },
  { id: 2, name: "Пользователь" },
];

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: {
    email: (value: string) => (/.+@.+\..+/.test(value ?? "") ? true : "Некорректный email"),
    role: (value: unknown) => (value ? true : "Выберите роль"),
  },
});

const onSubmit = handleSubmit(async (values) => {
  console.log(values);
});
</script>

<template>
  <form class="flex flex-col gap-2" @submit="onSubmit">
    <FormInput name="email" label="Email" type="email" />
    <FormSelect name="role" label="Роль" :options="roles" />
    <FormSwitch name="notify" label="Присылать уведомления" />

    <UiButton type="submit" :is-loading="isSubmitting">Отправить</UiButton>
  </form>
</template>
```

### Компоненты формы

`src/components/form/` — обёртки над `useField`. Общие пропсы: обязательный
`name`, опциональные `label`, `hint`, `disabled`, `fieldClass`. Значение, ошибка
и `touched` берутся из контекста `useForm`.

| Компонент | Тип значения | Дополнительно |
| --- | --- | --- |
| `FormInput` | `string \| number` | `type`; нативные атрибуты (`placeholder`, `maxlength`, …) прокидываются на `<input>` |
| `FormCheckbox` | `boolean` | слот вместо `label` |
| `FormSwitch` | `boolean` | слот вместо `label` |
| `FormSelect` | значение опции | `options`, `clearable`, `placeholder`, `menuClass` |
| `FormRadio` | значение опции | `options`, `inline` |
| `FormMultiSelect` | массив значений опций | `options`, `placeholder`, `menuClass`, `badgeClass` |

#### Опции — любые объекты

`options` принимает массив чего угодно. По умолчанию в форму сохраняется **весь
объект опции**; чтобы сохранять поле — указать `option-value`:

```vue
<FormSelect name="role" :options="roles" />                         <!-- в форме: { id, name } -->
<FormSelect name="role" :options="roles" option-value="id" />       <!-- в форме: 1 -->
<FormSelect name="role" :options="roles" :option-value="(r) => r.id" />
```

Аксессоры (`option-value`, `option-label`, `option-disabled`) принимают либо имя
поля, либо функцию. Без `option-label` подпись ищется в полях `label`, `name`,
`title`, `caption`. Без `option-disabled` — в поле `disabled`.

Отрисовка опции задаётся слотом, слот-проп называется `value` и содержит саму
опцию:

```vue
<FormSelect name="role" :options="roles" option-value="id">
  <template #default="{ value, selected }">
    <span class="badge badge-xs" :class="{ 'badge-primary': selected }" />
    {{ value.name }} — {{ value.code }}
  </template>
  <template #selected="{ value }">{{ value.code }}</template>
  <template #empty>Ролей нет</template>
</FormSelect>
```

`FormSelect` и `FormMultiSelect` — не нативный `<select>`, а dropdown daisyUI,
поэтому в слоте допустима любая разметка, а не только текст. Сравнение значений
структурное (`isSameValue`), поэтому объекты работают без ручных ключей.

Новое поле добавляется по тому же контракту и экспортируется из
`src/components/form/index.ts`.

### Выпадающие списки — только `UiSelect`

Нативный `<select>` в интерфейсе не используется: в нём нет поиска, он не
стилизуется и в списке на 60 позиций им невозможно пользоваться.

- внутри формы — `FormSelect` (обёртка: `FormField` + `useField` + `UiSelect`);
- вне формы — `UiSelect` с `v-model`.

Реализация выпадашки живёт в одном месте — `UiSelect`. Резолверы опций общие для
всех списков и лежат в [src/utils/options.ts](src/utils/options.ts). Если список
длиннее десятка позиций, включать `searchable`.

**Панель выпадашки рендерится через `<Teleport>`, а не внутри потока.** У
`.modal-box` в daisyUI собственный `overflow-y: auto`, и абсолютно
спозиционированный список внутри модалки обрезается её границами. Позиционирование
и выбор цели телепорта — в [useDropdownPanel](src/composables/useDropdownPanel.ts):
панель уходит в ближайший `<dialog>`, а вне модалки — в `body`.

Телепортировать в `body` из модалки нельзя: `showModal()` поднимает диалог в top
layer, и что угодно снаружи окажется под ним независимо от `z-index`.

### UI-компоненты

`src/components/ui/`:

- `UiButton` — `isLoading` сам показывает спиннер и блокирует кнопку; слот `icon`.
- `UiModal` — `v-model` управляет открытием, внутри нативный `<dialog>`;
  слоты `header`, `default`, `footer` получают `close`; `persistent` запрещает
  закрытие по Esc и клику по подложке. `class` попадает на `.modal-box`.
- `UiTable` — рендер-паттерн: `columns` описывает колонки, разметка ячеек
  задаётся слотами `#cell-<key>` и `#header-<key>`, плюс `#empty`, `#loading`,
  `#caption`.

```vue
<UiTable :items="rows" :columns="columns" row-key="id" class="table-zebra table-sm">
  <template #cell-status="{ item }">
    <span class="badge" :class="item.active ? 'badge-success' : 'badge-ghost'">{{ item.status }}</span>
  </template>
  <template #cell-actions="{ item }">
    <UiButton class="btn-xs btn-ghost" @click="edit(item)">Изменить</UiButton>
  </template>
</UiTable>
```

Колонка: `{ key, label?, field?, sortable?, sortValue?, width?, class?, headerClass? }`.
`field` — имя поля или функция; без него берётся `key`.

Сортировка и пагинация встроены в `UiTable` и работают одинаково во всех таблицах:

- клик по заголовку переключает по возрастанию → по убыванию → исходный порядок;
- колонка сортируется, если у неё есть данные (`sortValue` или значение аксессора);
  служебные колонки вроде `actions` отпадают сами, `sortable: false` выключает вручную;
- отдельный ключ сортировки задаётся `sortValue`, если отображаемое значение
  собирается в слоте (`{ key: "rate", sortValue: (item) => item.attended / item.roster }`);
- страница режется после сортировки, размер — `page-size` (по умолчанию 50),
  управление скрыто, пока страница одна.

### Загрузка данных: кадр не мигает

`isLoading` в сторах поднимается и на первой загрузке, и на каждом обновлении
после мутации. Показывать по нему спиннер нельзя — таблица моргает и прыгает.

`UiTable`, `UiStat` и `UiLineChart` сами делят два состояния через
[useFirstLoad](src/composables/useFirstLoad.ts): пока данных не было ни разу —
скелетон `skeleton` по геометрии будущего контента; при повторном запросе — тот
же кадр, лишь приглушённый на время ответа.

Мутация, которая не меняет состав и порядок списка (галочка, правка числа),
обновляет запись в сторе точечно, а не перезагружает весь список: полная замена
массива ломает переиспользование строк и заставляет таблицу перерисовываться
целиком. Полный `load()` остаётся там, где меняется состав: создание, удаление,
переименование.

### Прочее

- Компоненты — Composition API + `<script setup lang="ts">`, Options API не использовать.
- Стили — утилиты Tailwind и компоненты daisyUI; кастомный CSS только когда утилит не хватает.
- Pinia-сторы — в setup-стиле (`defineStore("name", () => { ... })`).
- Перед тем как писать свой хелпер, проверить, есть ли готовый в `@vueuse/core`.
