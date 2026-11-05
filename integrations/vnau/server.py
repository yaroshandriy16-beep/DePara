"""Read-only HTTPS-backend application for the public VNAU schedules.

This WSGI app is not deployed by importing it. A production reverse proxy must
terminate HTTPS and provide a persistent VNAU_CACHE_DIR. It makes bounded,
on-demand upstream requests and never sends MKR session data to the browser.
"""
from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import threading
import time
from typing import Any, Callable, Iterable
from urllib.parse import parse_qs
from wsgiref.simple_server import WSGIRequestHandler, make_server

from .adapter import VNAUError, fetch_group, parse_matrix
from .cache import CacheValidationError, failure_snapshot, success_snapshot, validate_snapshot, write_snapshot
from .catalog import GroupCatalog
from .teacher import TeacherClient

_ID = re.compile(r'^[0-9]{1,12}$')
_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_DEFAULT_ORIGIN = 'https://yaroshandriy16-beep.github.io'


@dataclass
class ApiError(Exception):
    status: int
    message: str
    retry_after: int | None = None


def _window(start: str, end: str) -> tuple[str, str]:
    if not _DATE.fullmatch(start) or not _DATE.fullmatch(end):
        raise ApiError(400, 'Вкажіть дати у форматі YYYY-MM-DD.')
    try:
        first, last = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise ApiError(400, 'Некоректна дата.') from exc
    if first.isoformat() != start or last.isoformat() != end or last < first or (last - first).days >= 31:
        raise ApiError(400, 'Оберіть діапазон до 31 дня включно.')
    return start, end


def _age(timestamp: Any) -> float | None:
    try:
        dt = datetime.fromisoformat(str(timestamp).replace('Z', '+00:00'))
        if dt.tzinfo is None:
            return None
        seconds = (datetime.now(timezone.utc) - dt).total_seconds()
        return seconds if seconds >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


class VnauService:
    """One-process coordinator; cached identities and date ranges stay isolated."""

    def __init__(self, cache_dir: Path, *, catalog_factory: Callable[[], GroupCatalog] = GroupCatalog,
                 teacher_factory: Callable[[], TeacherClient] = TeacherClient,
                 group_fetcher: Callable[..., str] = fetch_group,
                 minimum_interval: float = 1.0, schedule_interval: float = 10.0,
                 search_interval: float = 5.0,
                 max_cache_files: int = 5000, max_cache_bytes: int = 128 * 1024 * 1024,
                 max_snapshot_bytes: int = 2 * 1024 * 1024,
                 sleeper: Callable[[float], None] = time.sleep):
        self.cache_dir = cache_dir
        self.catalog_factory = catalog_factory
        self.teacher_factory = teacher_factory
        self.group_fetcher = group_fetcher
        self.minimum_interval = minimum_interval
        self.schedule_interval = schedule_interval
        self.search_interval = search_interval
        self.max_cache_files = max_cache_files
        self.max_cache_bytes = max_cache_bytes
        self.max_snapshot_bytes = max_snapshot_bytes
        self.sleeper = sleeper
        self._upstream_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._last_upstream = 0.0
        self._last_schedule = 0.0
        self._last_search = 0.0
        self._catalog_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self._clients: OrderedDict[str, deque[float]] = OrderedDict()

    def rate_limit(self, client: str) -> None:
        now = time.monotonic()
        with self._state_lock:
            hits = self._clients.pop(client, deque())
            while hits and hits[0] <= now - 60:
                hits.popleft()
            if len(hits) >= 60:
                self._clients[client] = hits
                raise ApiError(429, 'Забагато запитів. Спробуйте трохи пізніше.', 60)
            hits.append(now)
            self._clients[client] = hits
            while len(self._clients) > 1024:
                self._clients.popitem(last=False)

    def _upstream(self, fetch: Callable[[], Any], *, schedule: bool = False, search: bool = False) -> Any:
        if not self._upstream_lock.acquire(blocking=False):
            raise ApiError(503, 'Джерело зайняте. Спробуйте ще раз.', 5)
        try:
            now = time.monotonic()
            wait = max(self.minimum_interval - (now - self._last_upstream),
                       self.schedule_interval - (now - self._last_schedule) if schedule else 0,
                       self.search_interval - (now - self._last_search) if search else 0)
            if wait > 0:
                raise ApiError(429, 'Зачекайте перед наступним запитом.', max(1, int(wait + 0.999)))
            try:
                return fetch()
            finally:
                self._last_upstream = time.monotonic()
                if schedule:
                    self._last_schedule = self._last_upstream
                if search:
                    self._last_search = self._last_upstream
        finally:
            self._upstream_lock.release()

    def catalogue(self, key: str, fetch: Callable[[], Any], *, ttl: int, search: bool = False) -> Any:
        now = time.monotonic()
        with self._state_lock:
            cached = self._catalog_cache.get(key)
            if cached and cached[0] > now:
                self._catalog_cache.move_to_end(key)
                return cached[1]
        result = self._upstream(fetch, search=search)
        with self._state_lock:
            self._catalog_cache[key] = (time.monotonic() + ttl, result)
            self._catalog_cache.move_to_end(key)
            while len(self._catalog_cache) > 512:
                self._catalog_cache.popitem(last=False)
        return result

    def _read(self, path: Path, kind: str, identity: str) -> dict[str, Any] | None:
        try:
            if not path.exists():
                return None
            if path.stat().st_size > self.max_snapshot_bytes:
                raise CacheValidationError('Cache snapshot is too large')
            return validate_snapshot(json.loads(path.read_text(encoding='utf-8')), kind, identity)  # type: ignore[arg-type]
        except (OSError, ValueError, CacheValidationError):
            # Never replace a malformed cache silently with an empty schedule.
            raise ApiError(503, 'Збережений розклад потребує перевірки.') from None

    def _cache_usage(self, path: Path) -> tuple[int, int, int]:
        """Count our persisted snapshots while the single upstream lock is held."""
        count = total = old_size = 0
        try:
            for item in self.cache_dir.rglob('*.json'):
                if not item.is_file():
                    continue
                size = item.stat().st_size
                count += 1
                total += size
                if item == path:
                    old_size = size
            return count, total, old_size
        except OSError:
            raise ApiError(503, 'Не вдалося перевірити сховище розкладів.') from None

    def schedule(self, kind: str, identity: str, start: str, end: str,
                 *, faculty_id: str = '', course: str = '', label: str = '') -> dict[str, Any]:
        if kind not in {'group', 'teacher'} or not _ID.fullmatch(identity):
            raise ApiError(400, 'Некоректний ідентифікатор розкладу.')
        start, end = _window(start, end)
        if kind == 'group' and (not _ID.fullmatch(faculty_id) or not re.fullmatch(r'[1-7]', course) or not label.strip() or len(label) > 120 or any(ord(c) < 32 for c in label)):
            raise ApiError(400, 'Некоректні параметри групи.')
        path = self.cache_dir / kind / identity / f'{start}_{end}.json'
        previous = self._read(path, kind, identity)
        if previous and (previous.get('coverageStart'), previous.get('coverageEnd')) != (start, end) and previous.get('lastSuccessAt'):
            raise ApiError(503, 'Збережений період розкладу потребує перевірки.')
        if kind == 'group' and previous and previous.get('groupName') != label:
            raise ApiError(400, 'Назва групи не відповідає збереженому ID.')
        if previous:
            checked_age = _age(previous.get('lastCheckedAt'))
            ttl = 2 * 60 * 60 if previous['status'] == 'success' else 10 * 60
            if checked_age is not None and checked_age < ttl:
                return previous

        def fetch() -> dict[str, Any]:
            current = self._read(path, kind, identity)
            if current and (age := _age(current.get('lastCheckedAt'))) is not None and age < (7200 if current['status'] == 'success' else 600):
                return current
            count, total, old_size = self._cache_usage(path)
            if current is None and (count >= self.max_cache_files or total >= self.max_cache_bytes):
                raise ApiError(503, 'Сховище розкладів тимчасово заповнене.')
            # A teacher's verified name is extracted from the actual response.
            name = label if kind == 'group' else (str(current.get('teacherName')) if current else f'Викладач {identity}')
            try:
                first, last = date.fromisoformat(start), date.fromisoformat(end)
                chunk_start = first
                lessons: list[dict[str, Any]] = []
                confirmed_teacher = ''
                chunk_number = 0
                while chunk_start <= last:
                    chunk_end = min(last, chunk_start + timedelta(days=13))
                    if chunk_number:
                        self.sleeper(self.schedule_interval)
                    if kind == 'group':
                        html = self.group_fetcher(structure_id='0', faculty_id=faculty_id, course=course,
                                                  group_id=identity, group_label=label,
                                                  start=chunk_start.strftime('%d.%m.%Y'), end=chunk_end.strftime('%d.%m.%Y'))
                        lessons.extend(parse_matrix(html, source_kind='group', owner_id=identity, owner_label=label,
                                                    start=chunk_start.isoformat(), end=chunk_end.isoformat()))
                    else:
                        result = self.teacher_factory().fetch_schedule(identity, chunk_start.isoformat(), chunk_end.isoformat())
                        if result['teacherId'] != identity or not result['teacher'] or (confirmed_teacher and confirmed_teacher != result['teacher']):
                            raise VNAUError('Джерело повернуло іншого викладача')
                        confirmed_teacher = result['teacher']
                        name = confirmed_teacher
                        lessons.extend(result['lessons'])
                    chunk_number += 1
                    chunk_start = chunk_end + timedelta(days=1)
                snapshot = success_snapshot(kind, identity, name, lessons, coverage_start=start, coverage_end=end)  # type: ignore[arg-type]
            except Exception:
                # Preserve the confirmed cache even if the upstream client or
                # parser fails unexpectedly; do not expose exception details.
                snapshot = failure_snapshot(kind, identity, name, current)  # type: ignore[arg-type]
            payload_size = len((json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8'))
            if payload_size > self.max_snapshot_bytes or total - old_size + payload_size > self.max_cache_bytes:
                if current and current.get('lastSuccessAt'):
                    return failure_snapshot(kind, identity, name, current)  # type: ignore[arg-type]
                raise ApiError(503, 'Не вдалося зберегти розклад у сховищі.')
            try:
                write_snapshot(path, snapshot, kind, identity)  # type: ignore[arg-type]
            except (OSError, CacheValidationError):
                # If durable storage cannot be written, don't claim a new success.
                if current and current.get('lastSuccessAt'):
                    return failure_snapshot(kind, identity, name, current)  # type: ignore[arg-type]
                raise ApiError(503, 'Не вдалося зберегти перевірений розклад.') from None
            return snapshot
        return self._upstream(fetch, schedule=True)


def _single(query: dict[str, list[str]], name: str, *, required: bool = True) -> str:
    values = query.get(name, [])
    if len(values) != 1 or (required and not values[0]):
        raise ApiError(400, 'Некоректні параметри запиту.')
    return values[0]


def create_app(service: VnauService, *, allowed_origins: set[str]) -> Callable[..., Iterable[bytes]]:
    def application(environ: dict[str, Any], start_response: Callable[..., Any]) -> Iterable[bytes]:
        origin = str(environ.get('HTTP_ORIGIN', ''))
        headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff'), ('Vary', 'Origin')]
        if origin in allowed_origins:
            headers += [('Access-Control-Allow-Origin', origin), ('Access-Control-Allow-Methods', 'GET, OPTIONS'), ('Access-Control-Expose-Headers', 'Retry-After')]
        try:
            if origin and origin not in allowed_origins:
                raise ApiError(403, 'Джерело запиту не дозволене.')
            method, path = str(environ.get('REQUEST_METHOD', 'GET')), str(environ.get('PATH_INFO', ''))
            if method == 'OPTIONS':
                start_response('204 No Content', headers)
                return [b'']
            if method != 'GET':
                raise ApiError(405, 'Дозволені лише запити на читання.')
            if path == '/healthz':
                data: Any = {'status': 'ok'}
            else:
                service.rate_limit(str(environ.get('REMOTE_ADDR', 'unknown'))[:128])
                try:
                    raw_query = str(environ.get('QUERY_STRING', ''))
                    if len(raw_query) > 2048:
                        raise ValueError('query too long')
                    query = parse_qs(raw_query, keep_blank_values=True, max_num_fields=10)
                except ValueError:
                    raise ApiError(400, 'Забагато параметрів запиту.') from None
                if path == '/api/vnau/faculties':
                    data = {'faculties': service.catalogue('faculties', lambda: service.catalog_factory().faculties(), ttl=6*3600)}
                elif match := re.fullmatch(r'/api/vnau/faculties/([0-9]{1,12})/courses', path):
                    faculty = match.group(1)
                    data = {'courses': service.catalogue(f'courses:{faculty}', lambda: service.catalog_factory().courses(faculty), ttl=6*3600)}
                elif match := re.fullmatch(r'/api/vnau/faculties/([0-9]{1,12})/courses/([1-7])/groups', path):
                    faculty, course = match.groups()
                    data = {'groups': service.catalogue(f'groups:{faculty}:{course}', lambda: service.catalog_factory().groups(faculty, course), ttl=6*3600)}
                elif path == '/api/vnau/teachers':
                    term = _single(query, 'query').strip()
                    if not 2 <= len(term) <= 80 or any(ord(c) < 32 for c in term):
                        raise ApiError(400, 'Введіть щонайменше дві літери прізвища або ПІБ.')
                    data = {'teachers': service.catalogue(f'teacher-search:{term.casefold()}', lambda: service.teacher_factory().search_teachers(term), ttl=15*60, search=True)}
                elif match := re.fullmatch(r'/api/vnau/(groups|teachers)/([0-9]{1,12})/schedule', path):
                    collection, identity = match.groups()
                    start, end = _single(query, 'start'), _single(query, 'end')
                    data = service.schedule('group' if collection == 'groups' else 'teacher', identity, start, end,
                                            faculty_id=_single(query, 'facultyId') if collection == 'groups' else '',
                                            course=_single(query, 'course') if collection == 'groups' else '',
                                            label=_single(query, 'name') if collection == 'groups' else '')
                else:
                    raise ApiError(404, 'Адресу не знайдено.')
            status = '200 OK'
        except ApiError as exc:
            status = {400:'400 Bad Request', 403:'403 Forbidden', 404:'404 Not Found', 405:'405 Method Not Allowed', 429:'429 Too Many Requests', 503:'503 Service Unavailable'}.get(exc.status, '500 Internal Server Error')
            data = {'error': exc.message}
            if exc.retry_after:
                headers.append(('Retry-After', str(exc.retry_after)))
        except VNAUError as exc:
            # These are fixed public-facing messages from our parser, not raw HTML.
            message = str(exc)
            data = {'error': message if message.startswith('Забагато результатів.') else 'Джерело ВНАУ тимчасово недоступне.'}
            status = '503 Service Unavailable'
        except Exception:
            # Do not expose source HTML, request/session data, or stack traces.
            data = {'error': 'Не вдалося отримати дані ВНАУ.'}
            status = '500 Internal Server Error'
        body = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        headers.append(('Content-Length', str(len(body))))
        start_response(status, headers)
        return [body]
    return application


_origins = {value.strip() for value in os.environ.get('DEPARA_ALLOWED_ORIGINS', _DEFAULT_ORIGIN).split(',') if value.strip()}
_service = VnauService(Path(os.environ.get('VNAU_CACHE_DIR', '/tmp/depara-vnau-server-cache')))
application = create_app(_service, allowed_origins=_origins)


class _QuietHandler(WSGIRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        # Avoid logging search terms or query strings in the development server.
        return


if __name__ == '__main__':
    # Development only. Use a production WSGI server behind HTTPS for deployment.
    port = int(os.environ.get('PORT', '8000'))
    with make_server('127.0.0.1', port, application, handler_class=_QuietHandler) as server:
        print(f'Локальна діагностика API: http://127.0.0.1:{port}', flush=True)
        server.serve_forever()
