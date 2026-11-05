"""VNAU MKR schedule GET/POST client and conservative HTML table parser.

The GET+POST request flow was confirmed in a 2026-11-03 Work report; the
selectors of the real VNAU lesson HTML were NOT supplied. The parser will
fail explicitly rather than silently claim a successful empty schedule.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any

import requests
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

GROUP_URL = "http://81.30.162.30/time-table/group?type=0"
TEACHER_URL = "http://81.30.162.30/time-table/teacher?type=0"
URL = GROUP_URL  # compatibility with existing group-only code
USER_AGENT = "DeParaVNAUResearch/0.1 (low-volume schedule integration test)"
DATE_RX = re.compile(r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b")
TIME_RX = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")


class VNAUError(RuntimeError):
    pass


def csrf_fields(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    p = soup.select_one('meta[name="csrf-param"]')
    t = soup.select_one('meta[name="csrf-token"]')
    if p and t and p.get("content") and t.get("content"):
        return {str(p["content"]): str(t["content"])}
    # Yii sites may place CSRF directly in a hidden field.
    for node in soup.select('input[type="hidden"][name]'):
        if "csrf" in str(node.get("name", "")).lower() and node.get("value"):
            return {str(node["name"]): str(node["value"])}
    raise VNAUError("У GET-відповіді відсутній CSRF-токен")


def form_options(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    results = []
    for select in soup.select("select[name]"):
        if re.search(r"csrf|token|session|password", str(select.get("name", "")), re.I):
            continue
        results.append({
            "name": select.get("name"),
            "options": [{"value": option.get("value", ""),
                         "label": option.get_text(" ", strip=True),
                         "selected": option.has_attr("selected")}
                        for option in select.select("option")],
        })
    return results


def form_fields(html: str) -> list[dict[str, str]]:
    """List public form field names and types only, never their input values."""
    soup = BeautifulSoup(html, "html.parser")
    fields = []
    for node in soup.select("form input[name], form select[name], form textarea[name]"):
        name = str(node.get("name", ""))
        typ = str(node.get("type", "text") if node.name == "input" else node.name).lower()
        if not name or re.search(r"csrf|token|session|password", name, re.I) or typ == "password":
            continue
        fields.append({"name": name, "type": typ})
    return fields


def post_fields(initial_html: str, *, structure_id: str, faculty_id: str,
                course: str, group_id: str, start: str, end: str) -> dict[str, str]:
    """Reuse legitimate form defaults, then override the academic group fields."""
    soup = BeautifulSoup(initial_html, "html.parser")
    data: dict[str, str] = {}
    # Retain named non-sensitive form controls from the existing page.
    for inp in soup.select("form input[name]"):
        input_type = inp.get("type", "").lower()
        if input_type in {"submit", "button", "file", "reset", "password"} or (input_type in {"checkbox", "radio"} and not inp.has_attr("checked")):
            continue
        data[str(inp["name"])] = str(inp.get("value", ""))
    for sel in soup.select("form select[name]"):
        selected = sel.select_one("option[selected]") or sel.select_one("option")
        if selected:
            data[str(sel["name"])] = str(selected.get("value", ""))
    data.update(csrf_fields(initial_html))
    data.update({
        "TimeTableForm[structureId]": structure_id or data.get("TimeTableForm[structureId]", ""),
        "TimeTableForm[facultyId]": faculty_id,
        "TimeTableForm[course]": course,
        "TimeTableForm[groupId]": group_id,
        "TimeTableForm[dateStart]": start,
        "TimeTableForm[dateEnd]": end,
        "TimeTableForm[indicationDays]": data.get("TimeTableForm[indicationDays]", "5"),
        "date-picker": f"{start} - {end}",
    })
    # Only send time-table-type if it exists on the returned real page.
    return data


def _key(txt: str) -> str | None:
    t = re.sub(r"\s+", " ", txt.lower().replace("'", "’")).strip()
    if "дата додав" in t or "створен" in t: return "addedDate"
    if "дата" in t or "день" in t: return "date"
    if "дисципл" in t or "предмет" in t or "назва занят" in t: return "subject"
    if "виклада" in t or "піб" in t: return "teacher"
    if "аудитор" in t or "кабінет" in t: return "room"
    if "група" in t or "підгруп" in t: return "group"
    if "вид занят" in t or "тип занят" in t: return "type"
    if "почат" in t: return "startTime"
    if "закінч" in t or "кінець" in t: return "endTime"
    if "номер" in t or "№ пари" in t or t in ("№", "пара"): return "lessonNumber"
    if "час" in t: return "timeRange"
    return None


def _date(value: str) -> str | None:
    m = DATE_RX.search(value)
    if not m: return None
    s = m.group(0)
    if "." in s:
        try: return datetime.strptime(s, "%d.%m.%Y").date().isoformat()
        except ValueError: return None
    try: return datetime.strptime(s, "%Y-%m-%d").date().isoformat()
    except ValueError: return None


def _time(value: str) -> str | None:
    m = TIME_RX.search(value)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else None


def _lesson_from_row(row: Tag, mapping: dict[int, str], inherited_date: str | None,
                     inherited_number: int | None, group_label: str) -> tuple[dict[str, Any] | None, str | None, int | None]:
    cells = row.find_all(["td", "th"], recursive=False)
    if not cells: return None, inherited_date, inherited_number
    raw: dict[str, str] = {}
    for i, cell in enumerate(cells):
        k = mapping.get(i) or _key(str(cell.get("data-label", "")))
        if k:
            raw[k] = cell.get_text(" ", strip=True)
            if k == "subject" and cell.get("title"):
                raw[k] = str(cell["title"])
    raw["date"] = raw.get("date") or str(row.get("data-date", "")) or inherited_date or ""
    date = _date(raw["date"]) or inherited_date
    number_match = re.search(r"\b\d{1,2}\b", raw.get("lessonNumber", ""))
    number = int(number_match.group(0)) if number_match else inherited_number
    time_range = raw.get("timeRange", "")
    times = [m.group(0) for m in TIME_RX.finditer(time_range)]
    start = _time(raw.get("startTime", "")) or (_time(times[0]) if times else None)
    end = _time(raw.get("endTime", "")) or (_time(times[1]) if len(times) > 1 else None)
    subject = raw.get("subject", "").strip()
    if not (subject and date and start and end):
        return None, date, number
    lesson = {
        "date": date,
        "lessonNumber": number,
        "startTime": start,
        "endTime": end,
        "subject": subject,
        "type": raw.get("type") or None,
        "room": raw.get("room") or None,
        "group": raw.get("group") or group_label,
        "teacher": raw.get("teacher") or None,
        "addedDate": _date(raw.get("addedDate", "")),
        "updatedIndicator": bool(row.find_parent(class_="lesson-updated") or
                                 "lesson-updated" in (row.get("class") or []) or
                                 row.select_one(".lesson-updated")),
    }
    return lesson, date, number


def parse_lessons(html: str, group_label: str) -> list[dict[str, Any]]:
    """Parse standard dated HTML tables; never infer unobserved change details.

    Real VNAU markup may require a tailored selector after capturing a safe
    excerpt from Work. Other table layouts fail loudly for manual review.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict[str, Any]] = []
    for table in soup.select("table"):
        rows = table.select("tr")
        mapping: dict[int, str] = {}
        date_heading = table.find_previous(["h2", "h3", "h4", "h5"])
        active_date = _date(date_heading.get_text(" ", strip=True)) if date_heading else None
        active_number = None
        for row in rows:
            heads = row.find_all("th", recursive=False)
            if heads:
                probe = {_index: _key(head.get_text(" ", strip=True)) for _index, head in enumerate(heads)}
                if sum(k is not None for k in probe.values()) >= 2:
                    mapping = {i: k for i, k in probe.items() if k is not None}
                    continue
            lesson, active_date, active_number = _lesson_from_row(
                row, mapping, active_date, active_number, group_label
            )
            if lesson:
                # Include a stable ID but don't collapse simultaneous subgroup events.
                fingerprint = [str(lesson.get(k) or "") for k in
                               ("date", "lessonNumber", "startTime", "endTime", "subject", "group", "teacher", "room", "type")]
                lesson["sourceId"] = hashlib.sha256("|".join(fingerprint).encode()).hexdigest()[:20]
                out.append(lesson)
    if not out:
        raise VNAUError("HTML отримано, але заняття не розпізнано. Потрібен зразок реальної таблиці ВНАУ; нуль занять НЕ вважається підтвердженим успіхом.")
    return out


def sanitized_tables(html: str) -> str:
    """Produce a minimal table excerpt, retaining useful non-secret structure.

    Never copy forms, scripts, hidden inputs, cookies, tokens, URLs or events.
    ``data-content`` is reduced to plain text so popover discipline names remain
    useful without preserving executable HTML. This does not validate the parser.
    """
    soup = BeautifulSoup(html, "html.parser")
    secrets = set()
    for node in soup.select('input[type="hidden"], meta[name]'):
        name = str(node.get("name", ""))
        if node.name == "input" or re.search(r"csrf|token|session", name, re.I):
            secret = str(node.get("value") or node.get("content") or "")
            # Hidden date controls are public form values, not credentials. If
            # treated as secrets, they redact matching table dates and corrupt
            # the sanitized diagnostic fixture. All other hidden values remain
            # redacted, including anything whose name suggests a credential.
            public_date = name in {"TimeTableForm[dateStart]", "TimeTableForm[dateEnd]"} and re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", secret)
            if len(secret) >= 8 and not public_date:
                secrets.add(secret)

    def clean(value: str) -> str:
        for secret in secrets:
            value = value.replace(secret, "[redacted]")
        return value

    def safe_attr(value: str) -> str:
        # Never retain attributes whose values look like credential-bearing content.
        if re.search(r"csrf|session|password|authenticity.?token", value, re.I):
            return ""
        fragment = BeautifulSoup(value, "html.parser")
        for elem in fragment.find_all(["script", "input", "form", "style", "iframe", "object", "embed"]):
            elem.decompose()
        return clean(fragment.get_text("\n", strip=True))[:2000]

    subset = BeautifulSoup("<html><body></body></html>", "html.parser")
    body = subset.body
    assert body is not None
    for table in soup.select("table")[:12]:
        heading = table.find_previous(["h2", "h3", "h4", "h5"])
        if heading:
            copy_heading = BeautifulSoup(str(heading), "html.parser")
            for elem in copy_heading.find_all(["script", "input", "form", "style", "iframe"]):
                elem.decompose()
            safe_heading = subset.new_tag(heading.name)
            safe_heading.string = clean(copy_heading.get_text(" ", strip=True))
            body.append(safe_heading)
        copy_table = BeautifulSoup(str(table), "html.parser")
        for node in copy_table.find_all(["script", "input", "form", "style", "iframe", "object", "embed"]):
            node.decompose()
        for comment in copy_table.find_all(string=lambda item: isinstance(item, Comment)):
            comment.extract()
        for node in copy_table.find_all(True):
            allowed: dict[str, Any] = {}
            public_classes = [name for name in (node.get("class") or []) if name in {"lesson-updated", "lesson-color-block", "headday", "headdate", "headcol", "lesson", "start", "end", "cell", "closed"} or re.fullmatch(r"lesson-\d+", name)]
            if public_classes:
                allowed["class"] = public_classes
            if node.name == "table" and node.get("id") == "timeTable":
                allowed["id"] = "timeTable"
            if node.name in ("td", "th"):
                for key in ("rowspan", "colspan"):
                    value = str(node.get(key, ""))
                    if value.isdigit() and 1 <= int(value) <= 100:
                        allowed[key] = value
            for key in ("title", "data-label", "data-date", "data-content"):
                if node.has_attr(key):
                    value = safe_attr(str(node[key]))
                    if value:
                        allowed[key] = value
            node.attrs = allowed
        for item in copy_table.find_all(string=True):
            if isinstance(item, NavigableString):
                item.replace_with(clean(str(item)))
        body.append(copy_table)
    return str(subset)


def fetch_group(*, structure_id: str, faculty_id: str, course: str, group_id: str,
                start: str, end: str, group_label: str = "", timeout: int = 25) -> str:
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    try:
        r = session.get(URL, timeout=timeout)
        r.raise_for_status()
        payload = post_fields(r.text, structure_id=structure_id, faculty_id=faculty_id,
                              course=course, group_id=group_id, start=start, end=end)
        r2 = session.post(URL, data=payload, headers={"Referer": URL}, timeout=timeout)
        r2.raise_for_status()
        # A structurally valid empty table for a different selected group must
        # never be marked as successful for the requested identity.
        soup = BeautifulSoup(r2.text, "html.parser")
        selected = soup.select_one('select[name="TimeTableForm[groupId]"] option[selected]')
        if not selected or str(selected.get("value", "")) != str(group_id):
            raise VNAUError("Сервер не підтвердив ID запитаної групи")
        normalize = lambda value: re.sub(r"\s+", " ", value).strip().casefold()
        if group_label and normalize(selected.get_text(" ", strip=True)) != normalize(group_label):
            raise VNAUError("Назва групи у відповіді не відповідає її ID")
        return r2.text
    except requests.RequestException as exc:
        raise VNAUError(f"Запит ВНАУ не вдався ({type(exc).__name__})") from exc


def package_result(lessons: list[dict[str, Any]], group: str, *, fetched_at: str | None = None) -> dict[str, Any]:
    return {"source": "vnau-mkr", "group": group,
            "fetchedAt": fetched_at or datetime.now(timezone.utc).isoformat(),
            "count": len(lessons), "lessons": lessons}


def parse_matrix(html: str, *, source_kind: str, owner_id: str, owner_label: str,
                 start: str, end: str) -> list[dict[str, Any]]:
    """Parse the observed public MKR matrix for a verified group or teacher.

    Dates are calendar values in Europe/Kyiv, not UTC instants. Unknown or
    incomplete layouts raise VNAUError instead of returning a false empty day.
    The owner ID must come from the corresponding observed public catalogue.
    """
    from datetime import date, timedelta

    if source_kind not in ("group", "teacher") or not owner_id or not owner_label:
        raise VNAUError("Потрібні тип, підтверджений ID та назва розкладу")
    try:
        start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
    except (TypeError, ValueError) as exc:
        raise VNAUError("Некоректний календарний діапазон") from exc
    if start_date > end_date or (end_date - start_date).days > 31:
        raise VNAUError("Некоректний або надто великий календарний діапазон")

    soup = BeautifulSoup(html, "html.parser")
    candidates = soup.select("table#timeTable, table.lesson-color-block")
    if len(candidates) != 1:
        raise VNAUError("Таблицю МКР не розпізнано; порожній розклад не підтверджений")
    table = candidates[0]
    result: list[dict[str, Any]] = []
    columns: list[str] = []
    covered: set[str] = set()
    seen_headers = 0
    seen_rows = 0
    duplicates: dict[str, int] = {}
    for row in table.find_all("tr"):
        day_head = row.select_one("th.headday")
        if day_head:
            headers = row.select("th.headdate")
            columns = [_date(header.get_text(" ", strip=True)) or "" for header in headers]
            if not columns or not all(columns) or len(set(columns)) != len(columns):
                raise VNAUError("Дата у заголовку таблиці МКР не розпізнана")
            seen_headers += 1
            continue
        heading = row.select_one("th.headcol")
        if not heading:
            continue
        seen_rows += 1
        if not columns:
            raise VNAUError("Рядок пари МКР не має календарного заголовка")
        number_node, start_node, end_node = (heading.select_one(selector) for selector in (".lesson", ".start", ".end"))
        match = re.search(r"\b\d{1,2}\b", number_node.get_text(" ", strip=True)) if number_node else None
        starts = _time(start_node.get_text(" ", strip=True)) if start_node else None
        ends = _time(end_node.get_text(" ", strip=True)) if end_node else None
        if not match or not starts or not ends or starts >= ends:
            raise VNAUError("Час або номер пари у таблиці МКР не розпізнано")
        number = int(match.group())
        cells = row.find_all("td", recursive=False)
        if len(cells) != len(columns):
            raise VNAUError("Кількість дат і клітинок у таблиці МКР не збігається")
        for cell, calendar_date in zip(cells, columns):
            if not start <= calendar_date <= end:
                continue
            if "closed" in (cell.get("class") or []):
                raise VNAUError("Джерело позначило запитану дату недоступною")
            container = cell.select_one(".cell")
            if not container:
                raise VNAUError("Клітинку розкладу МКР не розпізнано")
            covered.add(calendar_date)
            items = container.select("[data-content]")
            if not items and container.get_text(" ", strip=True).strip("\u00a0 "):
                raise VNAUError("Невідомий вміст клітинки МКР; потрібна перевірка")
            for item in items:
                fragment = BeautifulSoup(str(item.get("data-content", "")), "html.parser")
                parts = [piece.strip() for piece in fragment.get_text("\n", strip=True).splitlines() if piece.strip()]
                minimum = 4 if source_kind == "teacher" else 5
                if len(parts) < minimum:
                    raise VNAUError("Неповний опис заняття МКР; потрібна перевірка")
                type_match = re.search(r"\s*\[([^\[\]]+)\]\s*$", parts[0])
                subject = parts[0][:type_match.start()].strip() if type_match else parts[0].strip()
                if not subject or not type_match:
                    raise VNAUError("Назву або тип заняття МКР не розпізнано")
                room, group = parts[1], parts[2]
                teacher = owner_label if source_kind == "teacher" else parts[3]
                added_part = parts[3] if source_kind == "teacher" else parts[4]
                added_date = _date(added_part) if "додано" in added_part.lower() else None
                if not room or not group or not teacher or not added_date:
                    raise VNAUError("Метадані заняття МКР неповні; потрібна перевірка")
                if source_kind == "group":
                    # A valid but unrelated response must not be labelled with this group's ID.
                    owner = re.escape(re.sub(r"\s+", " ", owner_label).strip())
                    actual = re.sub(r"\s+", " ", group).strip()
                    if not re.search(rf"(?:^|[,;]\s*){owner}(?=$|[/\s(,;])", actual, re.I):
                        raise VNAUError("Заняття не належить до запитаної академічної групи")
                title = str(item.get("title", ""))
                title_date = _date(title)
                if title_date and title_date != calendar_date:
                    raise VNAUError("Дата пари не збігається з колонкою МКР")
                short = item.contents[0].strip() if item.contents and isinstance(item.contents[0], NavigableString) else ""
                lesson: dict[str, Any] = {
                    "date": calendar_date, "lessonNumber": number,
                    "startTime": starts, "endTime": ends, "subject": subject,
                    "shortSubject": short or None, "type": type_match.group(1).strip(),
                    "room": room, "group": group, "teacher": teacher,
                    "addedDate": added_date, "updatedIndicator": bool(item.find_parent(class_="lesson-updated")),
                }
                lesson["academicGroupId" if source_kind == "group" else "teacherId"] = owner_id
                if source_kind == "group" and group != owner_label:
                    lesson["subgroup"] = group
                fingerprint = [str(lesson.get(k) or "") for k in
                               ("date", "lessonNumber", "startTime", "endTime", "subject", "type", "room", "group", "teacher")]
                base = hashlib.sha256("|".join([source_kind, owner_id, *fingerprint]).encode()).hexdigest()[:20]
                duplicate = duplicates.get(base, 0)
                duplicates[base] = duplicate + 1
                lesson["sourceId"] = base if not duplicate else f"{base}-{duplicate}"
                result.append(lesson)
    if not seen_headers or not seen_rows:
        raise VNAUError("Матрицю занять МКР не розпізнано")
    wanted = {(start_date + timedelta(days=i)).isoformat() for i in range((end_date - start_date).days + 1)}
    if covered != wanted:
        raise VNAUError("Джерело повернуло неповний календарний діапазон")
    return sorted(result, key=lambda item: (item["date"], item["startTime"], item["sourceId"]))
