"""Build and atomically save validated, per-identity VNAU cache snapshots.

This module is intentionally inert: no network access, cron, git operation or
publishing. A future verified producer may call it only after fetching and
validating the actual MKR response. Never pass raw HTML, form fields or tokens.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Literal

SourceKind = Literal['group', 'teacher']
_VALID_ID = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
_TIME = re.compile(r'^(?:[01]\d|2[0-3]):[0-5]\d$')
_TIMESTAMP = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$')
_META_FIELDS = {'schemaVersion', 'source', 'sourceKind', 'universityId', 'timeZone', 'groupId', 'teacherId', 'groupName', 'teacherName', 'status', 'lastCheckedAt', 'lastSuccessAt', 'coverageStart', 'coverageEnd', 'lessons'}
_LESSON_FIELDS = {'sourceId', 'date', 'startTime', 'endTime', 'subject', 'shortSubject', 'type', 'room', 'group', 'teacher', 'academicGroupId', 'teacherId', 'subgroup', 'lessonNumber', 'addedDate', 'updatedIndicator'}

class CacheValidationError(ValueError):
    """Raised before any existing cache is replaced."""

def _identity(kind: SourceKind, source_id: str) -> tuple[str, str]:
    if kind not in ('group', 'teacher') or not isinstance(source_id, str) or not _VALID_ID.fullmatch(source_id):
        raise CacheValidationError('Invalid schedule identity')
    return ('groupId' if kind == 'group' else 'teacherId', source_id)

def _instant(value: str) -> str:
    if not isinstance(value, str) or not _TIMESTAMP.fullmatch(value):
        raise CacheValidationError('Invalid timestamp')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (AttributeError, ValueError) as exc:
        raise CacheValidationError('Invalid timestamp') from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise CacheValidationError('Timestamp requires a timezone')
    return value

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def _calendar_date(value: Any) -> str:
    try:
        if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
            raise ValueError('invalid date')
    except ValueError as exc:
        raise CacheValidationError('Invalid coverage date') from exc
    return value

def validate_snapshot(value: Any, kind: SourceKind, source_id: str) -> dict[str, Any]:
    key, source_id = _identity(kind, source_id)
    if not isinstance(value, dict) or any(value.get(k) != v for k, v in {
        'schemaVersion': 1, 'source': 'vnau-mkr', 'sourceKind': kind,
        'universityId': 'vsau', 'timeZone': 'Europe/Kyiv', key: source_id,
    }.items()):
        raise CacheValidationError('Mismatched cache metadata')
    if set(value) - _META_FIELDS:
        raise CacheValidationError('Unexpected metadata cannot be published')
    label = value.get('groupName' if kind == 'group' else 'teacherName')
    if not isinstance(label, str) or not label.strip() or len(label) > 1024:
        raise CacheValidationError('Invalid display label')
    status = value.get('status')
    if status not in ('success', 'loading', 'error', 'unknown'):
        raise CacheValidationError('Invalid cache status')
    for key_time in ('lastSuccessAt', 'lastCheckedAt'):
        if value.get(key_time) is not None:
            _instant(value[key_time])
    lessons = value.get('lessons')
    if not isinstance(lessons, list) or len(lessons) > 5000:
        raise CacheValidationError('Invalid lessons')
    if (status == 'success' or lessons) and not value.get('lastSuccessAt'):
        raise CacheValidationError('Confirmed data requires a success timestamp')
    # A confirmed empty list means "no classes" only inside this checked range.
    coverage_start, coverage_end = value.get('coverageStart'), value.get('coverageEnd')
    if status == 'success' or lessons or value.get('lastSuccessAt'):
        coverage_start, coverage_end = _calendar_date(coverage_start), _calendar_date(coverage_end)
        if coverage_start > coverage_end:
            raise CacheValidationError('Invalid coverage range')
    elif coverage_start is not None or coverage_end is not None:
        raise CacheValidationError('Unconfirmed data cannot claim coverage')
    ids = set()
    for lesson in lessons:
        if not isinstance(lesson, dict):
            raise CacheValidationError('Invalid lesson')
        if set(lesson) - _LESSON_FIELDS:
            raise CacheValidationError('Unexpected lesson fields cannot be published')
        event_id, day, start, end, subject = (lesson.get(k) for k in ('sourceId', 'date', 'startTime', 'endTime', 'subject'))
        if not isinstance(event_id, str) or not event_id.strip() or len(event_id) > 1024 or event_id in ids:
            raise CacheValidationError('Invalid or duplicate event ID')
        ids.add(event_id)
        try:
            if not isinstance(day, str) or date.fromisoformat(day).isoformat() != day:
                raise ValueError('invalid date')
        except ValueError as exc:
            raise CacheValidationError('Invalid calendar date') from exc
        if coverage_start is None or coverage_end is None or not coverage_start <= day <= coverage_end:
            raise CacheValidationError('Lesson is outside confirmed coverage')
        if not isinstance(start, str) or not isinstance(end, str) or not _TIME.fullmatch(start) or not _TIME.fullmatch(end) or start >= end:
            raise CacheValidationError('Invalid lesson time')
        if not isinstance(subject, str) or not subject.strip() or len(subject) > 1024:
            raise CacheValidationError('Invalid lesson title')
        if lesson.get('academicGroupId' if kind == 'group' else 'teacherId') != source_id:
            raise CacheValidationError('Lesson belongs to another identity')
        for field in ('type', 'room', 'group', 'teacher', 'academicGroupId', 'teacherId', 'subgroup', 'shortSubject'):
            item = lesson.get(field)
            if item is not None and (not isinstance(item, str) or len(item) > 1024):
                raise CacheValidationError('Invalid lesson field')
        number = lesson.get('lessonNumber')
        if number is not None and (not isinstance(number, int) or isinstance(number, bool) or not 1 <= number <= 100):
            raise CacheValidationError('Invalid lesson number')
        if lesson.get('updatedIndicator') is not None and not isinstance(lesson['updatedIndicator'], bool):
            raise CacheValidationError('Invalid update indicator')
        if lesson.get('addedDate') is not None:
            added = lesson['addedDate']
            try:
                if not isinstance(added, str) or date.fromisoformat(added).isoformat() != added:
                    raise ValueError('invalid date')
            except ValueError as exc:
                raise CacheValidationError('Invalid addition date') from exc
    return value

def success_snapshot(kind: SourceKind, source_id: str, label: str, lessons: list[dict[str, Any]], *, coverage_start: str, coverage_end: str, checked_at: str | None = None) -> dict[str, Any]:
    """Build a success only after the caller has confirmed the parsed response.

    An empty list can be passed only when the calling parser has recognized and
    verified an empty table; this module cannot infer that from a list alone.
    """
    key, source_id = _identity(kind, source_id)
    if not isinstance(label, str) or not label.strip() or len(label) > 1024:
        raise CacheValidationError('Invalid display label')
    checked = _instant(checked_at or utc_now())
    snapshot = {'schemaVersion': 1, 'source': 'vnau-mkr', 'sourceKind': kind,
                'universityId': 'vsau', 'timeZone': 'Europe/Kyiv', key: source_id,
                ('groupName' if kind == 'group' else 'teacherName'): label, 'status': 'success', 'lastCheckedAt': checked,
                'lastSuccessAt': checked, 'coverageStart': coverage_start, 'coverageEnd': coverage_end,
                'lessons': lessons}
    return validate_snapshot(snapshot, kind, source_id)

def failure_snapshot(kind: SourceKind, source_id: str, label: str, previous: dict[str, Any] | None, *, checked_at: str | None = None) -> dict[str, Any]:
    """Retain last confirmed lessons; never expose raw errors or credentials."""
    key, source_id = _identity(kind, source_id)
    if not isinstance(label, str) or not label.strip() or len(label) > 1024:
        raise CacheValidationError('Invalid display label')
    checked = _instant(checked_at or utc_now())
    if previous is not None:
        previous = validate_snapshot(previous, kind, source_id)
    keep = previous if previous and previous.get('lastSuccessAt') else None
    snapshot = {'schemaVersion': 1, 'source': 'vnau-mkr', 'sourceKind': kind,
                'universityId': 'vsau', 'timeZone': 'Europe/Kyiv', key: source_id,
                ('groupName' if kind == 'group' else 'teacherName'): label, 'status': 'error', 'lastCheckedAt': checked,
                'lessons': keep['lessons'] if keep else []}
    if keep:
        snapshot['lastSuccessAt'] = keep['lastSuccessAt']
        snapshot['coverageStart'] = keep['coverageStart']
        snapshot['coverageEnd'] = keep['coverageEnd']
    return validate_snapshot(snapshot, kind, source_id)

def write_snapshot(path: Path, snapshot: dict[str, Any], kind: SourceKind, source_id: str) -> None:
    """Validate first, then replace one snapshot atomically in its directory."""
    validate_snapshot(snapshot, kind, source_id)
    payload = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n'
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix='.vnau-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            output.write(payload)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
