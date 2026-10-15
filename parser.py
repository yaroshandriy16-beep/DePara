import json
import requests
from bs4 import BeautifulSoup


def parse():
  url = "http://81.30.162.30/time-table/"
  try:
    res = requests.get(url, timeout=10)
    res.encoding = "utf-8"
    # Тут згодом буде логіка збору даних
    data = {"status": "parsed", "faculties": []}
    with open("schedule.json", "w", encoding="utf-8") as f:
      json.dump(data, f, ensure_ascii=False, indent=4)
    print("Розклад оновлено!")
  except Exception as e:
    print(f"Помилка: {e}")


if __name__ == "__main__":
  parse()
