"""Public VNAU teacher search and timetable client.

Uses the university's ordinary public search and form in one requests.Session.
No browser request reaches the HTTP source; callers must publish a validated
HTTPS cache. CSRF tokens and session cookies are never returned or logged.
"""
from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse
from typing import Any

import requests
from bs4 import BeautifulSoup

from .adapter import VNAUError, csrf_fields

BASE = 'http://81.30.162.30'
SEARCH_URL = BASE + '/site/search-teacher'
TEACHER_URL = BASE + '/time-table/teacher'
USER_AGENT = 'DeParaVNAUResearch/0.1 (low-volume public schedule integration)'


def _date_range(start: str, end: str) -> tuple[date, date]:
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except (TypeError, ValueError) as exc:
        raise VNAUError('Дати запиту мають бути у форматі YYYY-MM-DD') from exc
    if last < first or last - first > timedelta(days=31):
        raise VNAUError('Неприпустимий діапазон дат для розкладу викладача')
    return first, last


def parse_teacher_search(html: str) -> list[dict[str, str]]:
    """Parse public result rows; distinct IDs are never merged by name."""
    soup = BeautifulSoup(html, 'html.parser')
    if not soup.select_one('form[action="/site/search-teacher"]'):
        raise VNAUError('Не розпізнано форму пошуку викладачів ВНАУ')
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in soup.select('table tr'):
        cells = row.find_all('td', recursive=False)
        if not cells:
            continue
        link = row.select_one('a[href*="/time-table/teacher?"]')
        if len(cells) < 3 or not link:
            raise VNAUError('Не розпізнано рядок результатів пошуку викладачів')
        target = urlparse(str(link.get('href', '')))
        identity = parse_qs(target.query).get('id', [''])[0]
        name = cells[1].get_text(' ', strip=True)
        chair = cells[2].get_text(' ', strip=True)
        if target.path != '/time-table/teacher' or not identity.isdigit() or not name:
            raise VNAUError('Пошук повернув результат без перевіреного ID або ПІБ')
        if identity not in seen:
            results.append({'id': identity, 'name': name, 'chair': chair})
            seen.add(identity)
    # The live search returned exactly 200 entries and no pagination for a
    # broad query. Never present that potentially truncated set as complete.
    if len(results) >= 200:
        raise VNAUError('Забагато результатів. Уточніть прізвище або введіть повне ПІБ.')
    return results


def teacher_form_fields(html: str, *, teacher_id: str, start: str, end: str) -> tuple[dict[str, str], str]:
    """Extract the teacher form defaults; never return or print them to callers."""
    first, last = _date_range(start, end)
    soup = BeautifulSoup(html, 'html.parser')
    form = soup.select_one('form#filter-form')
    if not form or not str(teacher_id).isdigit():
        raise VNAUError('Форма викладача або перевірений ID відсутні')
    data: dict[str, str] = {}
    for element in form.select('input[name],select[name]'):
        name = str(element['name'])
        input_type = str(element.get('type', '')).lower()
        if input_type in {'submit', 'button', 'file', 'reset', 'password'} or (input_type in {'checkbox', 'radio'} and not element.has_attr('checked')):
            continue
        if element.name == 'select':
            option = element.select_one('option[selected]') or element.select_one('option')
            if option is not None:
                data[name] = str(option.get('value', ''))
        else:
            data[name] = str(element.get('value', ''))
    select = form.select_one('select[name="TimeTableForm[teacherId]"] option[selected]')
    if not select or str(select.get('value', '')) != str(teacher_id):
        raise VNAUError('Сервер не підтвердив ID вибраного викладача')
    label = select.get_text(' ', strip=True)
    if not label:
        raise VNAUError('ПІБ вибраного викладача не підтверджено')
    data.update(csrf_fields(html))
    data.update({
        'TimeTableForm[teacherId]': str(teacher_id),
        'TimeTableForm[dateStart]': first.strftime('%d.%m.%Y'),
        'TimeTableForm[dateEnd]': last.strftime('%d.%m.%Y'),
        'TimeTableForm[indicationDays]': data.get('TimeTableForm[indicationDays]', '5'),
        'date-picker': f'{first:%d.%m.%Y} - {last:%d.%m.%Y}',
    })
    return data, label


class TeacherClient:
    def __init__(self, *, session: requests.Session | None = None, timeout: int = 25):
        self.session = session or requests.Session()
        self.session.headers['User-Agent'] = USER_AGENT
        self.timeout = timeout

    def search_teachers(self, query: str) -> list[dict[str, str]]:
        query = query.strip()
        if len(query) < 2:
            return []
        try:
            response = self.session.get(SEARCH_URL, params={'type': 'time-table', 'SearchTeachersForm[search]': query}, timeout=self.timeout)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise VNAUError(f'Не вдалося виконати пошук викладача ({type(exc).__name__})') from exc
        return parse_teacher_search(response.text)

    def fetch_schedule(self, teacher_id: str, start: str, end: str) -> dict[str, Any]:
        _date_range(start, end)
        if not str(teacher_id).isdigit():
            raise VNAUError('ID викладача має бути числовим')
        try:
            response = self.session.get(TEACHER_URL, params={'id': teacher_id}, timeout=self.timeout)
            response.raise_for_status()
            payload, teacher_name = teacher_form_fields(response.text, teacher_id=str(teacher_id), start=start, end=end)
            # The real form submits to ?type=0. Reusing ?id=... here resets
            # the selected date range to the source's default period.
            result = self.session.post(TEACHER_URL, params={'type': '0'}, data=payload, headers={'Referer': TEACHER_URL}, timeout=self.timeout)
            result.raise_for_status()
            _, returned_name = teacher_form_fields(result.text, teacher_id=str(teacher_id), start=start, end=end)
            if returned_name != teacher_name:
                raise VNAUError('Відповідь джерела не відповідає вибраному викладачу')
        except requests.RequestException as exc:
            raise VNAUError(f'Не вдалося отримати розклад викладача ({type(exc).__name__})') from exc
        # Import here so this module never substitutes a generic parser if the
        # verified matrix parser is unavailable.
        from .adapter import parse_matrix
        lessons = parse_matrix(result.text, source_kind='teacher', owner_id=str(teacher_id), owner_label=teacher_name, start=start, end=end)
        return {'teacherId': str(teacher_id), 'teacher': teacher_name, 'lessons': lessons}
