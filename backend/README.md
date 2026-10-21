# ДеПара? REBORN — окремий сервер (Cloudflare Worker + D1)

Це **код серверної частини**, а не запущений сервер. Основний GitHub Pages застосунок не змінювався.

## Що реалізовано
- `GET /health` — перевірка роботи API.
- `GET /me` — профіль і особистий код `DP-...`.
- `GET /friends` — список друзів та вхідні заявки.
- `POST /friends/request` — заявка за кодом: `{"code":"DP-..."}`.
- `POST /friends/respond` — прийняти/відхилити: `{"id":"uuid","action":"accept"}` або `decline`.
- Підпис Telegram Mini App `initData` перевіряється на сервері через HMAC-SHA256, термін дії 1 година.
- Доступ до заявок лише після перевірки особи. Дані користувачів зберігаються в Cloudflare D1.

## Розгортання (потрібен власник Cloudflare)
1. Увійти в Cloudflare і створити Worker/D1 (безкоштовні квоти можуть змінюватися).
2. Встановити Node.js і Wrangler: `npm install -g wrangler`, `wrangler login`.
3. Із каталогу `backend` виконати `wrangler d1 create depara-reborn`.
4. Вставити отриманий `database_id` у `wrangler.toml` **тільки в окремій тестовій гілці або після перевірки конфігурації**.
5. `wrangler d1 execute depara-reborn --remote --file=./schema.sql`.
6. `wrangler secret put BOT_TOKEN` — ввести токен **лише у захищений запит термінала**, не у чат і не у GitHub.
7. `wrangler deploy`.
8. Перевірити `https://<worker-name>.<account>.workers.dev/health`.

## Запит із Telegram Mini App
```js
const initData = window.Telegram?.WebApp?.initData;
const response = await fetch('https://YOUR_WORKER_URL/me', {
  headers: { Authorization: 'tma ' + initData }
});
```
`initDataUnsafe` не можна використовувати для авторизації. Звичайний браузер без Telegram не має валідного `initData`.

## Обмеження
- Наразі API **не розгорнуто**; немає домену, активної бази чи налаштованого секрету.
- Клієнт «Друзі» ще не підключений до API.
- Чати, синхронізація нотаток, модерація, блокування, видалення акаунта та rate limiting ще не реалізовані.
- Перед публічним запуском потрібні захист від спаму/rate limiting, обмеження доступу, тестування й політика даних.
- `ALLOWED_ORIGIN` дозволяє запити з GitHub Pages. CORS не замінює Telegram-авторизацію.
