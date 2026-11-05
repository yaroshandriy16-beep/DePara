"""Public student catalogue from VNAU's verified cascading form.

The source is contacted only from a server. Each cascade uses its own session
and form defaults; cookies and CSRF values are never returned or logged.
"""
from __future__ import annotations

import re
from typing import Any

import requests
from bs4 import BeautifulSoup, Tag

from .adapter import GROUP_URL, USER_AGENT, VNAUError, csrf_fields

_ID = re.compile(r'^[0-9]{1,12}$')
_STRUCTURE = '0'  # Confirmed public VNAU structure on the group page.


def _form(html: str) -> Tag:
    form = BeautifulSoup(html, 'html.parser').select_one('form#filter-form')
    if not isinstance(form, Tag):
        raise VNAUError('Не розпізнано публічну форму груп ВНАУ')
    return form


def _options(form: Tag, field: str) -> list[dict[str, str]]:
    select = form.select_one(f'select[name="TimeTableForm[{field}]"]')
    if not isinstance(select, Tag):
        raise VNAUError('Не розпізнано список у формі груп ВНАУ')
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for option in select.select('option'):
        identity = str(option.get('value', '')).strip()
        label = option.get_text(' ', strip=True)
        if not identity:  # Placeholder, not an academic object.
            continue
        if not _ID.fullmatch(identity) or not label or len(label) > 200 or identity in seen:
            raise VNAUError('Некоректний запис у каталозі груп ВНАУ')
        seen.add(identity)
        result.append({'id': identity, 'name': label})
    return result


def _selected(form: Tag, field: str) -> str | None:
    option = form.select_one(f'select[name="TimeTableForm[{field}]"] option[selected]')
    return str(option.get('value', '')) if isinstance(option, Tag) else None


def _form_data(html: str) -> dict[str, str]:
    form = _form(html)
    data: dict[str, str] = {}
    for el in form.select('input[name], select[name]'):
        name = str(el.get('name', ''))
        typ = str(el.get('type', '')).lower()
        if typ in {'submit', 'button', 'file', 'reset', 'password'} or (typ in {'checkbox', 'radio'} and not el.has_attr('checked')):
            continue
        # The form's known values are needed by Yii; nothing is logged or returned.
        if el.name == 'select':
            option = el.select_one('option[selected]') or el.select_one('option')
            data[name] = str(option.get('value', '')) if option else ''
        else:
            data[name] = str(el.get('value', ''))
    data.update(csrf_fields(html))
    return data


class GroupCatalog:
    def __init__(self, *, session: requests.Session | None = None, timeout: int = 25):
        self.session = session or requests.Session()
        self.session.headers['User-Agent'] = USER_AGENT
        self.timeout = timeout

    def _get(self) -> str:
        try:
            response = self.session.get(GROUP_URL, timeout=self.timeout)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            raise VNAUError(f'Не вдалося отримати каталог груп ({type(exc).__name__})') from exc

    def _post(self, html: str, **selected: str) -> str:
        data = _form_data(html)
        data.update({f'TimeTableForm[{name}]': value for name, value in selected.items()})
        try:
            response = self.session.post(GROUP_URL, data=data, headers={'Referer': GROUP_URL, 'X-Requested-With': 'XMLHttpRequest'}, timeout=self.timeout)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            raise VNAUError(f'Не вдалося отримати каталог груп ({type(exc).__name__})') from exc

    def faculties(self) -> list[dict[str, str]]:
        html = self._get()
        form = _form(html)
        if _selected(form, 'structureId') != _STRUCTURE:
            raise VNAUError('Не підтверджено структуру ВНАУ у формі груп')
        result = _options(form, 'facultyId')
        if not result:
            raise VNAUError('Список факультетів ВНАУ недоступний')
        return result

    def courses(self, faculty_id: str) -> list[dict[str, str]]:
        if not _ID.fullmatch(str(faculty_id)):
            raise VNAUError('Некоректний ID факультету')
        html = self._get()
        form = _form(html)
        if _selected(form, 'structureId') != _STRUCTURE or not any(x['id'] == faculty_id for x in _options(form, 'facultyId')):
            raise VNAUError('Факультет не підтверджено каталогом ВНАУ')
        result = self._post(html, structureId=_STRUCTURE, facultyId=faculty_id, course='', groupId='')
        form = _form(result)
        if _selected(form, 'facultyId') != faculty_id:
            raise VNAUError('Джерело повернуло інший факультет')
        return _options(form, 'course')

    def groups(self, faculty_id: str, course: str) -> list[dict[str, str]]:
        if not _ID.fullmatch(str(faculty_id)) or not re.fullmatch(r'[1-7]', str(course)):
            raise VNAUError('Некоректний факультет або курс')
        html = self._get()
        form = _form(html)
        if _selected(form, 'structureId') != _STRUCTURE or not any(x['id'] == faculty_id for x in _options(form, 'facultyId')):
            raise VNAUError('Факультет не підтверджено каталогом ВНАУ')
        html = self._post(html, structureId=_STRUCTURE, facultyId=faculty_id, course='', groupId='')
        form = _form(html)
        if _selected(form, 'facultyId') != faculty_id or not any(x['id'] == course for x in _options(form, 'course')):
            raise VNAUError('Курс не підтверджено каталогом ВНАУ')
        html = self._post(html, structureId=_STRUCTURE, facultyId=faculty_id, course=course, groupId='')
        form = _form(html)
        if _selected(form, 'facultyId') != faculty_id or _selected(form, 'course') != course:
            raise VNAUError('Джерело повернуло інший факультет або курс')
        return _options(form, 'groupId')
