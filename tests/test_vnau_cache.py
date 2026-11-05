import tempfile
import unittest
from pathlib import Path

from integrations.vnau.cache import CacheValidationError, failure_snapshot, success_snapshot, write_snapshot

class CacheTests(unittest.TestCase):
    def setUp(self):
        self.lesson = {'sourceId': 'event-1', 'date': '2026-11-05', 'startTime': '08:30', 'endTime': '09:50', 'subject': 'Приклад', 'academicGroupId': '3641'}
        self.time = '2026-11-05T10:00:00Z'

    def test_group_success_is_dated_and_scoped(self):
        snapshot = success_snapshot('group', '3641', 'ЕІ-23-1', [self.lesson], checked_at=self.time)
        self.assertEqual(snapshot['lastSuccessAt'], self.time)
        self.assertEqual(snapshot['lessons'][0]['academicGroupId'], '3641')

    def test_failure_keeps_previously_confirmed_events(self):
        old = success_snapshot('group', '3641', 'ЕІ-23-1', [self.lesson], checked_at=self.time)
        current = failure_snapshot('group', '3641', 'ЕІ-23-1', old, checked_at='2026-11-05T11:00:00Z')
        self.assertEqual(current['lessons'], old['lessons'])
        self.assertEqual(current['lastSuccessAt'], self.time)
        self.assertEqual(current['status'], 'error')
        self.assertEqual(current['lastCheckedAt'], '2026-11-05T11:00:00Z')

    def test_group_cannot_reuse_teacher_or_other_group_cache(self):
        old = success_snapshot('group', '3641', 'ЕІ-23-1', [self.lesson], checked_at=self.time)
        with self.assertRaises(CacheValidationError):
            failure_snapshot('group', '3878', 'КН-24-1', old, checked_at=self.time)
        with self.assertRaises(CacheValidationError):
            failure_snapshot('teacher', '3641', 'Приклад', old, checked_at=self.time)

    def test_invalid_data_cannot_overwrite_previous_file(self):
        old = success_snapshot('group', '3641', 'ЕІ-23-1', [self.lesson], checked_at=self.time)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'snapshot.json'
            write_snapshot(path, old, 'group', '3641')
            original = path.read_text()
            invalid = {**old, 'lessons': [{**self.lesson, 'date': '2026-02-30'}]}
            with self.assertRaises(CacheValidationError):
                write_snapshot(path, invalid, 'group', '3641')
            self.assertEqual(path.read_text(), original)

    def test_invalid_identity_and_duplicate_events_rejected(self):
        with self.assertRaises(CacheValidationError):
            success_snapshot('group', '../x', 'ЕІ-23-1', [], checked_at=self.time)
        with self.assertRaises(CacheValidationError):
            success_snapshot('group', '3641', 'ЕІ-23-1', [self.lesson, self.lesson], checked_at=self.time)

    def test_rejects_unexpected_sensitive_fields(self):
        with self.assertRaises(CacheValidationError):
            success_snapshot('group', '3641', 'ЕІ-23-1', [{**self.lesson, 'csrfToken': 'never-publish'}], checked_at=self.time)

    def test_teacher_is_keyed_by_id_not_name(self):
        event = {**self.lesson, 'teacherId': '1847'}
        del event['academicGroupId']
        snapshot = success_snapshot('teacher', '1847', 'Приклад викладача', [event], checked_at=self.time)
        self.assertEqual(snapshot['teacherId'], '1847')
        self.assertEqual(snapshot['sourceKind'], 'teacher')

if __name__ == '__main__':
    unittest.main()
