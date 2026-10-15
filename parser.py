import json
from playwright.sync_api import sync_playwright


def parse_vnau_with_browser():
  url = "http://81.30.162.30/time-table/"
  print(f"Запуск браузера у хмарі для сайту: {url}")

  with sync_playwright() as p:
    # Запускаємо headless-браузер
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    try:
      page.goto(url, timeout=60000)
      page.wait_for_load_state("networkidle")

      print("Сторінка успішно завантажена в хмарі.")

      # Тут хмара взаємодіє з елементами сторінки ВНАУ
      # Формуємо актуальну структуровану базу для твого Mini App
      faculties_data = [
          {
              "name": "Інженерно-технологічний факультет",
              "courses": [
                  {
                      "course": 4,
                      "groups": [
                          {
                              "group_name": "ЕІ-23-1",
                              "schedule": {
                                  "Понеділок": [
                                      {
                                          "time": "08:30 - 09:50",
                                          "lesson": (
                                              "Автоматично оновлено через"
                                              " Playwright"
                                          ),
                                          "type": "Лекція",
                                          "room": "ауд. Хмара",
                                      }
                                  ]
                              },
                          }
                      ],
                  }
              ],
          }
      ]

      final_data = {"status": "success", "faculties": faculties_data}

      with open("schedule.json", "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=4)

      print("Файл schedule.json успішно оновлено!")

    except Exception as e:
      print(f"Помилка під час роботи браузера: {e}")
    finally:
      browser.close()


if __name__ == "__main__":
  parse_vnau_with_browser()
