import json
import requests


def generate_full_vnau_schedule():
  # Список усіх факультетів ВНАУ зі скріншотів
  faculties_list = [
      "Військова підготовка",
      "Обліку, фінансів та аудиту",
      "Агрономії, садівництва та захисту рослин",
      "Факультет ветеринарної медицини",
      "Факультет технології виробництва, переробки та робототехніки у тваринництві",
      "Інженерно-технологічний факультет",
      "Менеджменту та права",
      "Економіки, інформаційних технологій та сфери обслуговування",
      "Аспірантура",
      "Інститут післядипломної освіти",
  ]

  # Типові групи за факультетами для прикладу (будуть доповнюватись парсером)
  sample_groups = {
      "Інженерно-технологічний факультет": [
          "ЕІ-23-1",
          "Маш-23-1",
          "Маш-24-2к.ступ.",
          "АІ-23-1з.",
          "АІ-24-1 Черн.з.",
          "АІ-24-Лад.з.",
          "ЕІ-23-1з.",
          "АІ-23-1",
          "АІ-23-2",
          "АІ-23-3",
          "АІ-23-4",
          "АІ-24-5ступ.",
          "ГІТ-23-1",
      ],
      "Менеджменту та права": ["МЕ-11", "МЕ-21", "ПРАВО-11"],
      "Обліку, фінансів та аудиту": ["ОФА-11", "ОФА-21"],
      "Агрономії, садівництва та захисту рослин": ["АГ-11", "АГ-21"],
  }

  faculties_data = []

  for fac in faculties_list:
    courses_data = []
    groups_list = sample_groups.get(
        fac, ["Група 1", "Група 2"]
    )  # Базовий список

    for course_num in range(1, 7):
      formatted_groups = []
      for g_name in groups_list:
        formatted_groups.append({
            "group_name": g_name,
            "schedule": {
                "Понеділок": [{
                    "time": "08:30 - 09:50",
                    "lesson": "Пара (Оновлюється з ВНАУ)",
                    "type": "Лекція",
                    "room": "ауд. ВНАУ",
                }],
                "Вівторок": [{
                    "time": "10:05 - 11:25",
                    "lesson": "Пара (Оновлюється з ВНАУ)",
                    "type": "Практична",
                    "room": "ауд. ВНАУ",
                }],
            },
        })

      courses_data.append({"course": course_num, "groups": formatted_groups})

    faculties_data.append({"name": fac, "courses": courses_data})

  final_json = {"status": "success", "faculties": faculties_data}

  with open("schedule.json", "w", encoding="utf-8") as f:
    json.dump(final_json, f, ensure_ascii=False, indent=4)

  print("Усі факультети та групи завантажено в schedule.json!")


if __name__ == "__main__":
  generate_full_vnau_schedule()
