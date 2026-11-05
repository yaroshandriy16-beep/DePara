"""Run the fetch command with a recorded, sanitized MKR matrix and no network."""
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from integrations.vnau import cli

FIXTURE = Path(__file__).parent / 'fixtures' / 'vnau_group_ei23.html'

class CliTests(unittest.TestCase):
    def run_fetch(self, html, output):
        args = ['cli', '--fetch', '--structure-id', '0', '--faculty-id', '7', '--course', '4',
                '--group-id', '3641', '--group-label', 'ЕІ-23-1', '--start', '05.11.2026',
                '--end', '18.11.2026', '--output', str(output)]
        with patch('sys.argv', args), patch.object(cli, 'fetch_group', return_value=html), \
             redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            return cli.main()

    def test_fetch_uses_dated_real_matrix(self):
        with TemporaryDirectory() as directory:
            out = Path(directory) / 'out.json'
            self.assertEqual(self.run_fetch(FIXTURE.read_text(encoding='utf-8'), out), 0)
            parsed = json.loads(out.read_text(encoding='utf-8'))
            self.assertEqual(parsed['count'], 2)
            self.assertEqual(parsed['lessons'][0]['academicGroupId'], '3641')
            self.assertEqual(parsed['lessons'][0]['date'], '2026-11-05')

    def test_teacher_diagnostic_uses_id_and_validated_iso_dates(self):
        from integrations.vnau.adapter import parse_matrix
        teacher_html = (FIXTURE.parent / 'vnau_teacher_real.html').read_text(encoding='utf-8')
        lessons = parse_matrix(teacher_html, source_kind='teacher', owner_id='1847',
                               owner_label='Бойко Олексій Романович', start='2026-11-05', end='2026-11-18')
        with TemporaryDirectory() as directory:
            out = Path(directory) / 'teacher.json'
            args = ['cli', '--fetch-teacher', '--teacher-id', '1847', '--start', '05.11.2026',
                    '--end', '18.11.2026', '--output', str(out)]
            result = {'teacherId': '1847', 'teacher': 'Бойко Олексій Романович', 'lessons': lessons}
            with patch('sys.argv', args), patch('integrations.vnau.teacher.TeacherClient') as client, \
                 redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                client.return_value.fetch_schedule.return_value = result
                self.assertEqual(cli.main(), 0)
                client.return_value.fetch_schedule.assert_called_once_with('1847', '2026-11-05', '2026-11-18')
            payload = json.loads(out.read_text(encoding='utf-8'))
            self.assertEqual(payload['teacherId'], '1847')
            self.assertEqual(payload['timetableKind'], 'teacher')
            self.assertEqual(len(payload['lessons']), 8)
            self.assertNotIn('csrf', out.read_text(encoding='utf-8').lower())

    def test_fetch_does_not_report_broken_page_as_success(self):
        with TemporaryDirectory() as directory:
            out = Path(directory) / 'out.json'
            self.assertEqual(self.run_fetch('<html><body>Unavailable</body></html>', out), 2)
            self.assertFalse(out.exists())

if __name__ == '__main__':
    unittest.main()
