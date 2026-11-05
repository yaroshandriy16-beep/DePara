"""CLI entry point: python -m vnau.cli --help."""
from __future__ import annotations
import argparse
from datetime import datetime
import json
from pathlib import Path
import sys
import requests
from .adapter import (URL, TEACHER_URL, USER_AGENT, VNAUError, form_fields, form_options, fetch_group,
                      parse_lessons, parse_matrix, sanitized_tables, package_result)


def main() -> int:
    ap = argparse.ArgumentParser(description="ДеПара / ВНАУ: HTML діагностика групового розкладу")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inspect", action="store_true", help="1 GET: public GROUP form options only")
    mode.add_argument("--inspect-teachers", action="store_true", help="1 GET: public TEACHER form options only (no POST)")
    mode.add_argument("--fetch", action="store_true", help="1 GET + 1 POST для групи")
    mode.add_argument("--fetch-teacher", action="store_true", help="1 GET + 1 POST для перевіреного ID викладача")
    mode.add_argument("--from-html", metavar="FILE", help="Розібрати наявний HTML, без мережі")
    ap.add_argument("--structure-id", default="", help="Справжній structureId із сайту")
    ap.add_argument("--faculty-id", default="", help="Справжній facultyId")
    ap.add_argument("--course", default="", help="Курс")
    ap.add_argument("--group-id", default="", help="Справжній groupId")
    ap.add_argument("--teacher-id", default="", help="Справжній teacherId з публічного пошуку МКР")
    ap.add_argument("--group-label", default="", help="Назва групи, напр. ЕІ-23-1")
    ap.add_argument("--start", default="", help="ДД.ММ.РРРР")
    ap.add_argument("--end", default="", help="ДД.ММ.РРРР")
    ap.add_argument("--output", default="out/vnau-schedule.json")
    ap.add_argument("--sample", default="", help="Зберегти лише очищені HTML-таблиці для діагностики")
    a = ap.parse_args()
    try:
        if a.inspect or a.inspect_teachers:
            source_url = TEACHER_URL if a.inspect_teachers else URL
            response = requests.get(source_url, headers={"User-Agent": USER_AGENT}, timeout=25)
            response.raise_for_status()
            payload = {"source": "vnau-mkr", "timetableKind": "teacher" if a.inspect_teachers else "group", "formFields": form_fields(response.text), "formOptions": form_options(response.text)}
            out = Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"ВНАУ: публічні параметри форми збережено у {out} (без токенів)")
            return 0
        if a.fetch_teacher:
            if not (a.teacher_id and a.start and a.end):
                ap.error("Для --fetch-teacher потрібні --teacher-id --start --end")
            lo = datetime.strptime(a.start, "%d.%m.%Y").date()
            hi = datetime.strptime(a.end, "%d.%m.%Y").date()
            if lo > hi or (hi - lo).days > 14:
                ap.error("Використай проміжок 1–15 днів")
            from .teacher import TeacherClient
            result = TeacherClient().fetch_schedule(a.teacher_id, lo.isoformat(), hi.isoformat())
            payload = {"source": "vnau-mkr", "timetableKind": "teacher", **result}
            out = Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"Очищений розклад викладача: {len(result['lessons'])} занять; JSON: {out}")
            return 0
        if a.fetch:
            if not all((a.faculty_id, a.course, a.group_id, a.group_label, a.start, a.end)):
                ap.error("Для --fetch потрібні --faculty-id --course --group-id --group-label --start --end")
            lo = datetime.strptime(a.start, "%d.%m.%Y").date()
            hi = datetime.strptime(a.end, "%d.%m.%Y").date()
            if lo > hi or (hi - lo).days > 14:
                ap.error("Використай проміжок 1–15 днів")
            html = fetch_group(structure_id=a.structure_id, faculty_id=a.faculty_id,
                               course=a.course, group_id=a.group_id, group_label=a.group_label, start=a.start, end=a.end)
        else:
            html = Path(a.from_html).read_text(encoding="utf-8")
            if not a.group_label: ap.error("Для --from-html додай --group-label")
        if a.sample:
            p = Path(a.sample); p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(sanitized_tables(html), encoding="utf-8")
            print(f"Очищені таблиці збережено: {p}")
        # ``--fetch`` uses the verified dated MKR matrix and cannot silently
        # fall back to the synthetic example parser. ``--from-html`` remains a
        # separate offline diagnostic for the package's synthetic fixture.
        if a.fetch:
            lessons = parse_matrix(html, source_kind="group", owner_id=a.group_id,
                                   owner_label=a.group_label, start=lo.isoformat(), end=hi.isoformat())
        else:
            lessons = parse_lessons(html, a.group_label)
        data = package_result(lessons, a.group_label)
        out = Path(a.output); out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Успіх: {len(lessons)} занять; JSON: {out}")
        return 0
    except (VNAUError, OSError, ValueError, requests.RequestException) as exc:
        print(f"Помилка: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
