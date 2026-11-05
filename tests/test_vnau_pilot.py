import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from integrations.vnau.adapter import VNAUError
from integrations.vnau.cache import success_snapshot, write_snapshot
from integrations.vnau.pilot import (
    VERIFIED_GROUPS, VERIFIED_TEACHERS, fetch_identity, run_pilot,
    select_identities, validate_range,
)

TIME = '2026-11-05T12:00:00Z'
LESSON = {
    'sourceId': 'test-1', 'date': '2026-11-05', 'startTime': '08:30',
    'endTime': '09:50', 'subject': 'Приклад', 'academicGroupId': '3641',
}

class PilotTests(unittest.TestCase):
    def test_verified_ids_and_bounded_ranges(self):
        identities = select_identities(['3641', '3878'], ['1847', '2264'])
        self.assertEqual([(x.kind, x.id) for x in identities], [('group', '3641'), ('group', '3878'), ('teacher', '1847'), ('teacher', '2264')])
        for args in [([], []), (['0'], []), (['3641', '3641'], []), ([], ['1847', '9999'])]:
            with self.assertRaises(ValueError):
                select_identities(*args)
        validate_range('2026-11-05', '2026-11-18')
        for start, end in [('2026-11-05', '2026-11-19'), ('2026-11-06', '2026-11-05'), ('20261105', '2026-11-18'), ('2026-02-30', '2026-03-01')]:
            with self.assertRaises(ValueError):
                validate_range(start, end)

    def test_group_response_must_confirm_identity(self):
        group = VERIFIED_GROUPS['3641']
        html = '<form><select name="TimeTableForm[groupId]"><option selected value="3641">ЕІ-23-1</option></select></form>'
        with patch('integrations.vnau.pilot.fetch_group', return_value=html) as fetch, patch('integrations.vnau.pilot.parse_matrix', return_value=[LESSON]) as parse:
            self.assertEqual(fetch_identity(group, '2026-11-05', '2026-11-18'), [LESSON])
            self.assertEqual(fetch.call_args.kwargs['start'], '05.11.2026')
            self.assertEqual(parse.call_args.kwargs['owner_id'], '3641')
        with patch('integrations.vnau.pilot.fetch_group', return_value=html.replace('3641', '3878')):
            with self.assertRaises(VNAUError):
                fetch_identity(group, '2026-11-05', '2026-11-18')

    def test_teacher_response_must_confirm_identity_and_label(self):
        teacher = VERIFIED_TEACHERS['1847']
        result = {'teacherId': '1847', 'teacher': teacher.label, 'lessons': []}
        with patch('integrations.vnau.pilot.TeacherClient') as client:
            client.return_value.fetch_schedule.return_value = result
            self.assertEqual(fetch_identity(teacher, '2026-11-05', '2026-11-18'), [])
            client.return_value.fetch_schedule.return_value = {**result, 'teacherId': '2264'}
            with self.assertRaises(VNAUError):
                fetch_identity(teacher, '2026-11-05', '2026-11-18')

    def test_failure_preserves_cache_and_stops_secrets_from_leaking(self):
        group = VERIFIED_GROUPS['3641']
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest = root / 'group' / '3641.json'
            before = success_snapshot('group', '3641', group.label, [LESSON], coverage_start='2026-11-05', coverage_end='2026-11-18', checked_at=TIME)
            write_snapshot(dest, before, 'group', '3641')
            def fail(*_): raise RuntimeError('secret-should-never-be-persisted')
            status = run_pilot([group], '2026-11-05', '2026-11-18', root, fetcher=fail, now=lambda: '2026-11-05T13:00:00Z')
            after = json.loads(dest.read_text())
            self.assertEqual(status[0]['status'], 'error')
            self.assertEqual(after['lastSuccessAt'], TIME)
            self.assertEqual(after['lessons'], [LESSON])
            self.assertNotIn('secret-should-never-be-persisted', dest.read_text())

    def test_invalid_previous_cache_is_never_replaced_or_fetched(self):
        group = VERIFIED_GROUPS['3641']
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); dest = root / 'group' / '3641.json'; dest.parent.mkdir()
            dest.write_text('invalid json')
            calls = []
            status = run_pilot([group], '2026-11-05', '2026-11-18', root, fetcher=lambda *_: calls.append(True) or [])
            self.assertEqual(status[0]['status'], 'cache-invalid')
            self.assertEqual(dest.read_text(), 'invalid json')
            self.assertEqual(calls, [])

    def test_source_failure_stops_following_queries(self):
        group, teacher = select_identities(['3641'], ['1847'])
        calls, waits = [], []
        def fail(identity, *_):
            calls.append(identity.id)
            raise VNAUError('upstream failure')
        with tempfile.TemporaryDirectory() as tmp:
            statuses = run_pilot([group, teacher], '2026-11-05', '2026-11-18', Path(tmp), fetcher=fail, wait=waits.append, now=lambda: TIME)
        self.assertEqual(calls, ['3641'])
        self.assertEqual(waits, [])
        self.assertEqual([item['status'] for item in statuses], ['error'])

    def test_serial_wait_and_separate_group_teacher_files(self):
        group, teacher = select_identities(['3641'], ['1847'])
        lesson_teacher = {**LESSON, 'teacherId': '1847'}
        del lesson_teacher['academicGroupId']
        calls, waits = [], []
        def fetch(identity, *_):
            calls.append(identity.id)
            return [LESSON] if identity.kind == 'group' else [lesson_teacher]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            statuses = run_pilot([group, teacher], '2026-11-05', '2026-11-18', root, fetcher=fetch, wait=waits.append, now=lambda: TIME)
            self.assertEqual(calls, ['3641', '1847'])
            self.assertEqual(waits, [10])
            self.assertEqual([s['status'] for s in statuses], ['success', 'success'])
            self.assertEqual(json.loads((root / 'group' / '3641.json').read_text())['groupId'], '3641')
            self.assertEqual(json.loads((root / 'teacher' / '1847.json').read_text())['teacherId'], '1847')

if __name__ == '__main__': unittest.main()
