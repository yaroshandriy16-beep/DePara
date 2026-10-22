# Відновлений стан DePara REBORN — 22.10.2026

База перевірки: main `602507d2a703948a8600aa586538912ba653be5f`.
Перевірено всі 16 наявних гілок, останні 12 комітів main, усі 7 PR та останні 10 запусків Actions. Це аудит коду й CI, а не підтвердження роботи живого Telegram-бота або стану D1.

## Точки входу та джерело правди

- Кореневий `index.html` залишається попереднім production-застосунком.
- `reborn-preview/index.html` перенаправляє до `reborn-notebook-preview/`.
- Чинний тестовий зошит завантажує `reborn-notebook-preview/notebook-social.js` (version 2).
- `notebook-fresh-v1.js` перевірено: це попередній локальний редактор. Він не підключений у чинній тестовій сторінці. У ньому синхронний запис localStorage на кожне введення, мінімальна валідація даних та незворотне видалення. Не підключати паралельно: обидва модулі експортують `window.DeParaNotebook`.
- `backend/README.md` застарів: його твердження про відсутність чатів і синхронізації не відповідають `backend/src/notebook-api.mjs` та тестам.

## Що вже є в тестовому коді

| Функція | Перевірений стан |
| --- | --- |
| Зошит | Предмети, конспекти, завдання, матеріали, локальні чернетки, приватне автозбереження, явна публікація за аудиторією, копії, файли, revision conflicts, запис до конкретної пари |
| Чати | Особисті розмови друзів, група, курс, факультет і предмети; група автора; Telegram-подібні бульбашки, пошук, відповіді, реакції, вкладення, меню повідомлення |
| Друзі | Окрема внутрішня вкладка зошита, заявки за кодом, загальна й персональна видимість розкладу: приховано / зайнятість / предмет / аудиторія |
| Модерація | Вибори старости з 48-годинним порогом, кворумом і відкликанням; серверні перевірки прав, видалення, закріплення, тимчасове обмеження повідомлень |
| Авторизація | Підписаний Telegram initData; API-тести контролю власності та аудиторій |

Окрема головна вкладка «Друзі», незалежні вибори додаткових модераторів та налаштування видимості довільних полів профілю ще не підтверджені як реалізовані. Поточні налаштування стосуються розкладу й статусу. Реальне використання кількома студентами в Telegram та Safari/iPhone потребує окремої перевірки.

## Гілки

| Гілка | HEAD | Останній коміт |
| --- | --- | --- |
| `main` | `602507d2` | Update VNAU classrooms data and sync status |
| `cleanup-remove-cloudflare-20261022` | `9850675f` | Fix notebook inclusion in local backup, restore and reset |
| `depara-reborn-2` | `92db3d89` | REBORN 2.0 preview: style.css titanium skin and isolated API |
| `notebook-social-v1` | `227ae484` | Complete tested preview UI against authenticated runtime notebook storage |
| `cloudflare-worker-setup` | `f321fb01` | Fix production shared schedule button to open DeParra Mini App |
| `fix-preview-miniapp-button-20261021` | `9ba596d1` | Fix preview schedule share button to target named Telegram Mini App |
| `fix-production-miniapp-button-review-20261021` | `7209841f` | Fix Mini App deep link to verified DeParra bot |
| `preview-r2-silent-share-20261021` | `83a5714b` | Expose safe preview R2 binding readiness in health endpoint |
| `ui-share-sheet-compact-20261021` | `fa2df044` | Bust Telegram webview cache for compact schedule sharing UI |
| `quality-update-2-0` | `352a9da3` | Style test preview splash without changing main |
| `backup-before-cloudflare-removal-20261022` | `34562263` | Use current Wrangler 4 for preview D1 migrations |
| `backup-before-repository-cleanup-20261021` | `7ed4cfd3` | Promote restored stable Telegram image sharing to main DePara app |
| `backup-main-before-49-promotion-20261019` | `bc604ec4` | Refresh lesson auto-advance code in Telegram test cache |
| `backup-main-before-v49-20261019` | `bc604ec4` | Refresh lesson auto-advance code in Telegram test cache |
| `backup-main-before-v50-20261019` | `d4a5e435` | Preview 5.0: activate enhanced onboarding, teacher screen and settings |
| `backup-preview-before-v50-enhance-20261019` | `e06a0318` | Preview 5.0: load updated settings reset handler |

`cleanup-remove-cloudflare-20261022` розійшлася з main: 23 власні коміти, відстає на 15. PR #10 закрито без merge. Вона видаляє backend, Cloudflare workflows та історичні прототипи. Не переносити її цілком під поточне завдання.

`depara-reborn-2`: 12 власних комітів, відстає на 691; містить стару titanium-версію та Worker-конфігурацію. Не використовувати як базу сучасного зошита.

`notebook-social-v1` інтегрована PR #11. Подальші UI-коміти `65831425` та `60f3c977` уже в main.

## PR та Actions

- #11 merged у main: соціальний зошит.
- #4 merged у main: компактний діалог поширення розкладу.
- #3 merged у cloudflare-worker-setup: production Mini App link.
- #2 лишається відкритим до cloudflare-worker-setup: тестова кнопка Mini App.
- #1, #5, #10 закриті без merge.
- Останні 10 переглянутих Actions успішні, зокрема Notebook social checks і DePara REBORN browser checks на `60f3c977`; синхронізації даних та Pages на `602507d2`.
- Production Worker workflow реагує на main і зміни `cloudflare/production/worker.js`. Ця робота цього шляху не змінює.
- Старий ручний preview deployment бере `cloudflare-worker-setup`; його запуск не означає deployment сучасного notebook API.

## Завершений обсяг цієї гілки

- Черга збереження отримує актуальну revision після попередніх запитів.
- Відповідь сервера не очищає нові правки, навіть якщо їх зроблено в ту саму мілісекунду.
- Автозбереження прив'язане до конкретного запису; вихід з редактора, зміна вкладки й згортання запускають збереження приватної чернетки.
- Видалення скасовує таймер, чекає in-flight створення й блокує відкладені збереження.
- Приховані/спільні чернетки не публікуються автоматично.
- Пошук обрізає крайні пробіли й нормалізує Unicode; додавання предмета не створює дублікат із різним регістром.
- Прибрано повторний вступ і невикористані inline-стилі старого зошита.
- Мобільний редактор: текст 16 px, компактна шапка, горизонтальна панель форматування, safe-area padding, видимий focus та відновлення фокусу після перемальовування.

## Перевірки та межі

Локально: 7 API-тестів SQLite; 9 регресійних тестів збереження; синтаксичні перевірки JS; Chromium 390×844 на ізольованому стенді з реальними модулем і CSS (створення, редагування, localStorage, пошук, видалення, відсутність горизонтального переповнення, 16 px текст). Повний Playwright suite на повній копії репозиторію: 13/13 успішно, включно з 2 новими сценаріями, чатами, друзями, студентським/викладацьким розкладом, поширенням розкладу та налаштуваннями. Тимчасовий локальний конфіг використовував системний Chromium; tests і production-конфіг не підмінялися. Разом 29 успішних тестів. GitHub Actions окремо запускає той самий suite зі своїм браузером.

Початкова спроба git clone у sandbox не мала доступу до proxy. Після надання процесу мережевого доступу повний репозиторій успішно клоновано. Локальна робоча копія: /workspace/DePara, гілка test/notebook-stability-20261022. Коміт побудований поверх вихідного GitHub tree зі збереженням усіх незмінених файлів та інфраструктури.

Cloudflare deployment, міграції, production-бот, production-код та main не змінювалися. Локальне збереження синхронне; фоновий HTTP при закритті WebView не гарантується, тому локальна чернетка залишається основою відновлення.

