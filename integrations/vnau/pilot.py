"""Bounded, manual VNAU cache pilot. Never publishes or schedules itself.

Only four identities observed in the public MKR forms are permitted. The CLI
requires explicit IDs, a bounded inclusive date range, and a local output
folder. It performs requests sequentially with a delay between identities.
Run only after approving the source interaction and reviewing the output;
this is not a full catalog and is not an activated application integration.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import date, timedelta
import json
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable, Sequence

from bs4 import BeautifulSoup
from .adapter import VNAUError, fetch_group, parse_matrix
from .cache import CacheValidationError, failure_snapshot, success_snapshot, utc_now, validate_snapshot, write_snapshot
from .teacher import TeacherClient


@dataclass(frozen=True)
class PilotIdentity:
    kind: str
    id: str
    label: str
    structure_id: str = ''
    faculty_id: str = ''
    course: str = ''


# Narrow allowlist: IDs and selection parameters observed in the public source,
# not an assertion that this is a complete university catalogue.
VERIFIED_GROUPS = {
    '3641': PilotIdentity('group', '3641', 'ЕІ-23-1', '0', '7', '4'),
    '3878': PilotIdentity('group', '3878', 'КН-24-1', '0', '5', '3'),
}
VERIFIED_TEACHERS = {
    '1847': PilotIdentity('teacher', '1847', 'Бойко Олексій Романович'),
    '2264': PilotIdentity('teacher', '2264', 'Вовк Валерія Юріївна'),
}


def validate_range(start: str, end: str) -> tuple[date, date]:
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', start) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', end):
        raise ValueError('Дати мають бути у форматі YYYY-MM-DD')
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise ValueError('Некоректна дата') from exc
    if last < first or last - first >= timedelta(days=14):
        raise ValueError('Діапазон має містити від 1 до 14 днів включно')
    return first, last


def select_identities(group_ids: Sequence[str], teacher_ids: Sequence[str]) -> list[PilotIdentity]:
    if len(group_ids) > 2 or len(teacher_ids) > 2 or not (group_ids or teacher_ids):
        raise ValueError('Оберіть від одного до чотирьох ID (до двох кожного типу)')
    if len(set(group_ids)) != len(group_ids) or len(set(teacher_ids)) != len(teacher_ids):
        raise ValueError('ID у запиті не повинні повторюватися')
    if any(identity not in VERIFIED_GROUPS for identity in group_ids) or any(identity not in VERIFIED_TEACHERS for identity in teacher_ids):
        raise ValueError('Пілот підтримує лише чотири перевірені ID')
    return [*(VERIFIED_GROUPS[identity] for identity in group_ids), *(VERIFIED_TEACHERS[identity] for identity in teacher_ids)]


def _verify_group_response(html: str, identity: PilotIdentity) -> None:
    """Reject a response that cannot prove the selected group identity.

    This check is important even for an empty recognized matrix: an unrelated
    table must never be saved under a requested group's ID.
    """
    soup = BeautifulSoup(html, 'html.parser')
    option = soup.select_one('select[name="TimeTableForm[groupId]"] option[selected]')
    if option is None or str(option.get('value', '')).strip() != identity.id:
        raise VNAUError('Джерело не підтвердило ID групи')
    label = ' '.join(option.get_text(' ', strip=True).split())
    if label != identity.label:
        raise VNAUError('Назва групи не відповідає перевіреному ID')


def fetch_identity(identity: PilotIdentity, start: str, end: str) -> list[dict[str, Any]]:
    first, last = validate_range(start, end)
    if identity.kind == 'group':
        html = fetch_group(structure_id=identity.structure_id, faculty_id=identity.faculty_id,
                           course=identity.course, group_id=identity.id,
                           start=first.strftime('%d.%m.%Y'), end=last.strftime('%d.%m.%Y'))
        _verify_group_response(html, identity)
        return parse_matrix(html, source_kind='group', owner_id=identity.id,
                            owner_label=identity.label, start=start, end=end)
    if identity.kind == 'teacher':
        result = TeacherClient().fetch_schedule(identity.id, start, end)
        if result['teacherId'] != identity.id or result['teacher'] != identity.label:
            raise VNAUError('Джерело повернуло іншого викладача')
        return result['lessons']
    raise ValueError('Невідомий тип розкладу')


def _load_previous(path: Path, identity: PilotIdentity) -> dict[str, Any] | None:
    if not path.exists():
        return None
    # A broken or unrelated cache must never be silently replaced, including
    # when fetching fails. It needs explicit investigation by the operator.
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return validate_snapshot(value, identity.kind, identity.id)  # type: ignore[arg-type]
    except (ValueError, OSError, CacheValidationError) as exc:
        raise CacheValidationError('Наявний кеш пошкоджено або він належить іншому ID') from exc


def run_pilot(identities: Sequence[PilotIdentity], start: str, end: str, output_dir: Path, *,
              fetcher: Callable[[PilotIdentity, str, str], list[dict[str, Any]]] = fetch_identity,
              wait: Callable[[float], None] = time.sleep,
              now: Callable[[], str] = utc_now) -> list[dict[str, str]]:
    validate_range(start, end)
    if not 1 <= len(identities) <= 4:
        raise ValueError('Вкажіть від одного до чотирьох ID')
    validated = select_identities([x.id for x in identities if x.kind == 'group'], [x.id for x in identities if x.kind == 'teacher'])
    if list(identities) != validated:
        raise ValueError('Дозволено лише перевірені ID та їх точні параметри')
    statuses: list[dict[str, str]] = []
    for index, identity in enumerate(identities):
        if index:
            wait(10)
        destination = output_dir / identity.kind / f'{identity.id}.json'
        try:
            previous = _load_previous(destination, identity)
        except CacheValidationError:
            statuses.append({'kind': identity.kind, 'id': identity.id, 'status': 'cache-invalid'})
            break
        try:
            lessons = fetcher(identity, start, end)
            snapshot = success_snapshot(identity.kind, identity.id, identity.label, lessons, checked_at=now())  # type: ignore[arg-type]
        except (Exception,):
            # Do not disclose exception contents, source HTML or session data.
            # The last validated successful lessons are retained on all failures.
            snapshot = failure_snapshot(identity.kind, identity.id, identity.label, previous, checked_at=now())  # type: ignore[arg-type]
        try:
            write_snapshot(destination, snapshot, identity.kind, identity.id)  # type: ignore[arg-type]
            statuses.append({'kind': identity.kind, 'id': identity.id, 'status': snapshot['status']})
        except (OSError, CacheValidationError):
            statuses.append({'kind': identity.kind, 'id': identity.id, 'status': 'write-error'})
            break
        # Stop rather than continuing to query a potentially failing source.
        if snapshot['status'] != 'success':
            break
    return statuses


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Ручний обмежений пілот ВНАУ; дані нікуди не публікуються')
    parser.add_argument('--group', action='append', default=[], metavar='ID', help='Перевірений groupId (можна до двох)')
    parser.add_argument('--teacher', action='append', default=[], metavar='ID', help='Перевірений teacherId (можна до двох)')
    parser.add_argument('--start', required=True, help='YYYY-MM-DD, включно')
    parser.add_argument('--end', required=True, help='YYYY-MM-DD, включно, максимум 14 днів')
    parser.add_argument('--output-dir', type=Path, default=Path('out/vnau-pilot'))
    args = parser.parse_args(argv)
    try:
        identities = select_identities(args.group, args.teacher)
        statuses = run_pilot(identities, args.start, args.end, args.output_dir)
    except (ValueError, OSError) as exc:
        print(f'Пілот не запущено: {exc}', file=sys.stderr)
        return 2
    for result in statuses:
        print(f"{result['kind']} {result['id']}: {result['status']}")
    return 0 if all(result['status'] == 'success' for result in statuses) else 1


if __name__ == '__main__':
    raise SystemExit(main())
