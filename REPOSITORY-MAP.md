# ДеПара? REBORN — карта репозиторію (22.10.2026)

## Робочі сторінки
- `index.html` — головна сторінка GitHub Pages, база ресурсів `reborn-preview/`.
- `reborn-preview/index.html` — тестова сторінка з тими самими основними модулями.
- `reborn-preview/app-reborn46.js` — базовий інтерфейс, локальні налаштування і студентський розклад.
- `reborn-preview/teacher-v1.js` — кабінет викладача.
- `reborn-preview/schedule-v42.js`, `schedule-share-v43.js`, `countdown-live.js` — розклад, PNG-поширення та відлік.
- `production-v49/`, `production-v50/` — спільні стилі та компоненти; не видаляти за номером версії.

## Дані та оновлення
- `data/catalog.json`, `data/groups/` — студентські групи.
- `data/teachers/` — каталог і розклади викладачів.
- `data/campus/` — вільні аудиторії та знімки.
- `parser.py`, `scripts/` і workflow `update-schedule.yml`, `sync-teachers.yml`, `update-free-classrooms.yml` — отримання й оновлення даних.

## Очищення (гілка cleanup-remove-cloudflare-20261022)
- Видалено Cloudflare Worker, D1-міграції та workflows їхнього деплою.
- Відключено API-авторизацію, D1 sync, чати, зайві навчальні вкладки й аналітичні інжектори.
- Поширення розкладу працює через локальний PNG та стандартні можливості пристрою, без Worker.
- Студентська та викладацька навігація скорочена до головного екрана, розкладу і профілю.
- Зошити та інші експериментальні файли залишені як резерв, але не підключені до основного HTML.
- Оновлено `README.md`, `tests/reborn.spec.cjs`; додано `scripts/audit-static.cjs` і `static-audit.yml`.

## Правила безпечної роботи
1. Не видаляти `data/` і робочі скрипти синхронізації.
2. Не зливати очищення в `main` до успішних браузерних перевірок.
3. Не вважати GitHub Pages заміною серверного Telegram webhook.
4. Для відновлення старої логіки є гілка `backup-before-cloudflare-removal-20261022`.
5. PR №10 — чернетка для ревізії змін.
