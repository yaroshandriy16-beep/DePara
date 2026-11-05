"""Checks against stripped real public VNAU group tables (05–18 Nov 2026)."""
from copy import copy
from pathlib import Path
import unittest
from bs4 import BeautifulSoup
from integrations.vnau.adapter import VNAUError, parse_matrix, sanitized_tables

FIXTURES = Path(__file__).parent / 'fixtures'

def parse(html, group_id='3641', label='ЕІ-23-1', start='2026-11-05', end='2026-11-18'):
    return parse_matrix(html, source_kind='group', owner_id=group_id, owner_label=label, start=start, end=end)

class PublicMkrMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ei = (FIXTURES / 'vnau_group_ei23.html').read_text(encoding='utf-8')
        cls.kn = (FIXTURES / 'vnau_group_kn24.html').read_text(encoding='utf-8')

    def test_actual_groups_and_dates(self):
        ei = parse(self.ei)
        kn = parse(self.kn, group_id='3878', label='КН-24-1')
        self.assertEqual(len(ei), 2)
        self.assertEqual(len(kn), 4)
        lesson = next(item for item in ei if item['date'] == '2026-11-05')
        self.assertEqual((lesson['startTime'], lesson['endTime'], lesson['lessonNumber']), ('13:10', '14:30', 4))
        self.assertEqual((lesson['subject'], lesson['type'], lesson['room']), ('Перехідні процеси', 'Екз', 'ауд. 3215'))
        self.assertEqual(lesson['teacher'], 'Возняк Олександр Миколайович')
        self.assertEqual(lesson['academicGroupId'], '3641')
        self.assertEqual(lesson['addedDate'], '2026-10-20')
        self.assertTrue(next(item for item in ei if item['date'] == '2026-11-12')['updatedIndicator'])
        self.assertEqual(len({item['sourceId'] for item in ei + kn}), len(ei + kn))
        self.assertTrue(all('2026-11-05' <= item['date'] <= '2026-11-18' for item in ei + kn))

    def test_exact_date_not_weekday_recurrence(self):
        one_day = parse(self.ei, start='2026-11-05', end='2026-11-05')
        self.assertEqual(len(one_day), 1)
        self.assertEqual(one_day[0]['date'], '2026-11-05')

    def test_parallel_subgroups_are_not_dropped(self):
        soup = BeautifulSoup(self.ei, 'html.parser')
        original = soup.select_one('[data-content]')
        duplicate = copy(original)
        duplicate['data-content'] = str(duplicate['data-content']).replace('ЕІ-23-1', 'ЕІ-23-1/1')
        original.parent.append(duplicate)
        lessons = parse(str(soup))
        same_time = [item for item in lessons if item['date'] == '2026-11-05']
        self.assertEqual(len(same_time), 2)
        self.assertEqual({item['academicGroupId'] for item in same_time}, {'3641'})
        self.assertEqual(len({item['sourceId'] for item in same_time}), 2)
        self.assertIn('ЕІ-23-1/1', [item.get('subgroup') for item in same_time])

    def test_rejects_another_group_before_assigning_owner_id(self):
        with self.assertRaises(VNAUError):
            parse(self.ei, group_id='3878', label='КН-24-1')

    def test_structurally_valid_empty_matrix_is_distinct_from_broken(self):
        soup = BeautifulSoup(self.ei, 'html.parser')
        for item in soup.select('[data-content]'):
            item.decompose()
        # Cells still have a valid structure, but no lessons.
        self.assertEqual(parse(str(soup)), [])
        with self.assertRaises(VNAUError):
            parse('<html><body>Сторінка недоступна</body></html>')
        with self.assertRaises(VNAUError):
            parse(self.ei.replace('headcol', 'unknown-structure'))
        with self.assertRaises(VNAUError):
            parse(self.ei, start='2026-11-01', end='2026-11-18')

    def test_sanitized_fixtures_keep_structure_and_no_secrets(self):
        for fixture in (self.ei, self.kn):
            cleaned = sanitized_tables(fixture)
            for forbidden in ('_csrf', 'cookie', 'session', '<script', '<form', '<input'):
                self.assertNotIn(forbidden, cleaned.lower())
            self.assertIn('data-content', cleaned)
            self.assertIn('class="headdate"', cleaned)

if __name__ == '__main__':
    unittest.main()
