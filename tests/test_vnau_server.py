import io
import json
import tempfile
import unittest
from pathlib import Path
from urllib.parse import urlencode
from unittest.mock import patch

from integrations.vnau.adapter import VNAUError, parse_matrix
from integrations.vnau.catalog import GroupCatalog
from integrations.vnau.server import VnauService, create_app

FIXTURES = Path(__file__).parent / 'fixtures'


def form(*, faculty='', course='', group=False):
    def option(value, name, selected=False):
        return f'<option value="{value}"{" selected" if selected else ""}>{name}</option>'
    faculties = option('', 'Оберіть') + option('7', 'Інженерно-технологійний факультет', faculty == '7')
    courses = option('', 'Оберіть') + (option('4', '4', course == '4') if faculty else '')
    groups = option('', 'Оберіть') + (option('3641', 'ЕІ-23-1') if group else '')
    return f'''<meta name="csrf-param" content="_csrf"><meta name="csrf-token" content="synthetic-token">
      <form id="filter-form"><input name="_csrf" value="synthetic-token">
      <select name="TimeTableForm[structureId]">{option('0','BUZ',True)}</select>
      <select name="TimeTableForm[facultyId]">{faculties}</select>
      <select name="TimeTableForm[course]">{courses}</select>
      <select name="TimeTableForm[groupId]">{groups}</select></form>'''


class Response:
    def __init__(self, text): self.text = text
    def raise_for_status(self): pass


class CatalogueSession:
    def __init__(self): self.headers = {}; self.posts = []
    def get(self, *args, **kwargs): return Response(form())
    def post(self, *args, **kwargs):
        data = kwargs['data']; self.posts.append(data.copy())
        if data['TimeTableForm[course]'] == '4':
            return Response(form(faculty='7', course='4', group=True))
        return Response(form(faculty='7'))


class CatalogueTests(unittest.TestCase):
    def test_verified_cascade_uses_one_session_and_real_ids(self):
        session = CatalogueSession()
        catalog = GroupCatalog(session=session)
        result = catalog.groups('7', '4')
        self.assertEqual(result, [{'id': '3641', 'name': 'ЕІ-23-1'}])
        self.assertEqual(len(session.posts), 2)
        self.assertTrue(all(post['_csrf'] == 'synthetic-token' for post in session.posts))
        self.assertEqual(session.posts[1]['TimeTableForm[course]'], '4')

    def test_unknown_or_mismatched_catalogue_is_rejected(self):
        catalog = GroupCatalog(session=CatalogueSession())
        with self.assertRaises(VNAUError): catalog.groups('9999', '4')
        with self.assertRaises(VNAUError): catalog.groups('7', '99')
        class Wrong(CatalogueSession):
            def post(self, *args, **kwargs): return Response(form(faculty=''))
        with self.assertRaises(VNAUError): GroupCatalog(session=Wrong()).courses('7')


class Teacher:
    calls = 0
    fail = False
    def search_teachers(self, query):
        return [{'id': '1847', 'name': 'Бойко Олексій Романович', 'chair': 'Кафедра'}] if query == 'Бойко' else []
    def fetch_schedule(self, identity, start, end):
        Teacher.calls += 1
        if Teacher.fail: raise VNAUError('upstream failure, never expose raw data')
        name = 'Бойко Олексій Романович'
        raw = (FIXTURES / 'vnau_teacher_real.html').read_text(encoding='utf-8')
        return {'teacherId': identity, 'teacher': name, 'lessons': parse_matrix(raw, source_kind='teacher', owner_id=identity, owner_label=name, start=start, end=end)}


class ServerTests(unittest.TestCase):
    def setUp(self):
        Teacher.calls, Teacher.fail = 0, False
        self.tmp = tempfile.TemporaryDirectory()
        self.service = VnauService(Path(self.tmp.name), teacher_factory=Teacher, minimum_interval=0, schedule_interval=0)
        self.app = create_app(self.service, allowed_origins={'https://yaroshandriy16-beep.github.io'})

    def tearDown(self): self.tmp.cleanup()

    def call(self, path, query=None, *, origin='https://yaroshandriy16-beep.github.io', method='GET'):
        env = {'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': urlencode(query or {}), 'REMOTE_ADDR': '127.0.0.1', 'HTTP_ORIGIN': origin, 'wsgi.input': io.BytesIO()}
        response = {}
        body = b''.join(self.app(env, lambda status, headers: response.update(status=status, headers=dict(headers))))
        return int(response['status'].split()[0]), json.loads(body) if body else None, response['headers']

    def test_public_search_and_origin(self):
        status, data, headers = self.call('/api/vnau/teachers', {'query': 'Бойко'})
        self.assertEqual(status, 200)
        self.assertEqual(data['teachers'][0]['id'], '1847')
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://yaroshandriy16-beep.github.io')
        status, _, headers = self.call('/api/vnau/teachers', {'query': 'Бойко'}, origin='https://untrusted.example')
        self.assertEqual(status, 403)
        self.assertNotIn('Access-Control-Allow-Origin', headers)

    def test_schedule_is_dated_cached_and_separated_by_range(self):
        query = {'start': '2026-11-05', 'end': '2026-11-18'}
        status, first, _ = self.call('/api/vnau/teachers/1847/schedule', query)
        self.assertEqual(status, 200)
        self.assertEqual(first['status'], 'success')
        self.assertEqual((first['coverageStart'], first['coverageEnd']), ('2026-11-05', '2026-11-18'))
        self.assertEqual(first['teacherId'], '1847')
        self.assertEqual(len(first['lessons']), 8)
        self.assertEqual(self.call('/api/vnau/teachers/1847/schedule', query)[1], first)
        self.assertEqual(Teacher.calls, 1)
        self.assertTrue((Path(self.tmp.name) / 'teacher/1847/2026-11-05_2026-11-18.json').is_file())

    def test_source_failure_preserves_last_success_without_exposing_error(self):
        query = {'start': '2026-11-05', 'end': '2026-11-18'}
        _, first, _ = self.call('/api/vnau/teachers/1847/schedule', query)
        Teacher.fail = True
        with patch('integrations.vnau.server._age', return_value=10000):
            status, second, _ = self.call('/api/vnau/teachers/1847/schedule', query)
        self.assertEqual(status, 200)
        self.assertEqual(second['status'], 'error')
        self.assertEqual(second['lastSuccessAt'], first['lastSuccessAt'])
        self.assertEqual(second['lessons'], first['lessons'])
        self.assertNotIn('upstream failure', json.dumps(second))

    def test_cache_quota_preserves_existing_data_and_avoids_extra_upstream_calls(self):
        self.service.max_cache_files = 1
        query = {'start': '2026-11-05', 'end': '2026-11-18'}
        _, first, _ = self.call('/api/vnau/teachers/1847/schedule', query)
        status, _, _ = self.call('/api/vnau/teachers/1848/schedule', query)
        self.assertEqual(status, 503)
        self.assertEqual(Teacher.calls, 1)
        self.assertEqual(self.call('/api/vnau/teachers/1847/schedule', query)[1], first)

    def test_cache_byte_quota_does_not_replace_confirmed_snapshot(self):
        query = {'start': '2026-11-05', 'end': '2026-11-18'}
        _, first, _ = self.call('/api/vnau/teachers/1847/schedule', query)
        path = Path(self.tmp.name) / 'teacher/1847/2026-11-05_2026-11-18.json'
        saved = path.read_bytes()
        self.service.max_cache_bytes = 1
        with patch('integrations.vnau.server._age', return_value=10000):
            status, result, _ = self.call('/api/vnau/teachers/1847/schedule', query)
        self.assertEqual(status, 200)
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['lastSuccessAt'], first['lastSuccessAt'])
        self.assertEqual(result['lessons'], first['lessons'])
        self.assertEqual(path.read_bytes(), saved)

    def test_month_is_split_into_bounded_sequential_requests(self):
        calls, sleeps = [], []
        class MonthlyTeacher:
            def fetch_schedule(self, identity, start, end):
                calls.append((identity, start, end))
                return {'teacherId': identity, 'teacher': 'Перевірений викладач', 'lessons': []}
        service = VnauService(Path(self.tmp.name), teacher_factory=MonthlyTeacher, minimum_interval=0, schedule_interval=10, sleeper=sleeps.append)
        result = service.schedule('teacher', '1847', '2026-11-01', '2026-11-30')
        self.assertEqual(result['status'], 'success')
        self.assertEqual(calls, [('1847','2026-11-01','2026-11-14'), ('1847','2026-11-15','2026-11-28'), ('1847','2026-11-29','2026-11-30')])
        self.assertEqual(sleeps, [10, 10])
        self.assertEqual((result['coverageStart'], result['coverageEnd']), ('2026-11-01', '2026-11-30'))

    def test_invalid_dates_ids_and_unexpected_requests_are_rejected(self):
        for query in ({'start':'2026-11-05','end':'2026-12-06'}, {'start':'not-a-date','end':'2026-11-08'}):
            self.assertEqual(self.call('/api/vnau/teachers/1847/schedule', query)[0], 400)
        self.assertEqual(self.call('/api/vnau/teachers/../schedule', {'start':'2026-11-05','end':'2026-11-18'})[0], 404)
        self.assertEqual(self.call('/api/vnau/teachers', {'query':'а'})[0], 400)
        self.assertEqual(self.call('/api/vnau/teachers', {'query':'Бойко'}, method='POST')[0], 405)


if __name__ == '__main__': unittest.main()
