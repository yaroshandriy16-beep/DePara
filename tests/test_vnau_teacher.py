import unittest
from pathlib import Path
from integrations.vnau.adapter import VNAUError
from integrations.vnau.teacher import parse_teacher_search, teacher_form_fields


class TeacherFormTests(unittest.TestCase):
    def test_teacher_search_keeps_namesakes_by_id(self):
        html = '''<form action="/site/search-teacher"></form><table><tr><th>Викладач</th></tr>
          <tr><td>1</td><td>Бойко Олексій Романович</td><td>Кафедра А</td><td><a href="/time-table/teacher?id=1847">Вибрати</a></td></tr>
          <tr><td>2</td><td>Бойко Олексій Романович</td><td>Кафедра Б</td><td><a href="/time-table/teacher?id=1848">Вибрати</a></td></tr></table>'''
        teachers = parse_teacher_search(html)
        self.assertEqual([t['id'] for t in teachers], ['1847', '1848'])
        self.assertEqual(teachers[0]['name'], teachers[1]['name'])
        self.assertNotEqual(teachers[0]['chair'], teachers[1]['chair'])

    def test_search_rejects_unexpected_page_and_bad_id(self):
        with self.assertRaises(VNAUError): parse_teacher_search('<h1>server error</h1>')
        with self.assertRaises(VNAUError): parse_teacher_search('<form action="/site/search-teacher"></form><table><tr><td>1</td><td>А</td><td>Б</td><td><a href="/time-table/teacher?id=x">Вибрати</a></td></tr></table>')

    def test_teacher_form_dates_and_checked_selection(self):
        html='''<meta name="csrf-param" content="_csrf"><meta name="csrf-token" content="synthetic">
        <form id="filter-form"><select name="TimeTableForm[structureId]"><option value="0" selected>BUZ</option></select>
        <select name="TimeTableForm[chairId]"><option value="182" selected>Кафедра</option></select>
        <select name="TimeTableForm[teacherId]"><option value="1847" selected>Бойко Олексій Романович</option></select>
        <input name="time-table-type" type="checkbox" value="1"><input name="TimeTableForm[indicationDays]" value="5"></form>'''
        fields, name = teacher_form_fields(html, teacher_id='1847', start='2026-11-05', end='2026-11-18')
        self.assertEqual(name, 'Бойко Олексій Романович')
        self.assertEqual(fields['TimeTableForm[dateStart]'], '05.11.2026')
        self.assertEqual(fields['TimeTableForm[dateEnd]'], '18.11.2026')
        self.assertNotIn('time-table-type', fields)
        with self.assertRaises(VNAUError): teacher_form_fields(html, teacher_id='99', start='2026-11-05', end='2026-11-18')
        with self.assertRaises(VNAUError): teacher_form_fields(html, teacher_id='1847', start='2026-11-05', end='2027-01-18')

class TeacherRealMatrixTests(unittest.TestCase):
    def test_teacher_matrix_uses_dates_and_owner(self):
        from integrations.vnau.adapter import parse_matrix
        html = Path('tests/fixtures/vnau_teacher_real.html').read_text(encoding='utf-8')
        lessons = parse_matrix(html, source_kind='teacher', owner_id='1847', owner_label='Бойко Олексій Романович', start='2026-11-05', end='2026-11-18')
        self.assertGreater(len(lessons), 0)
        self.assertTrue(all(l['teacherId'] == '1847' for l in lessons))
        self.assertTrue(all('2026-11-05' <= l['date'] <= '2026-11-18' for l in lessons))
        self.assertTrue(any(l['date'] == '2026-11-09' and l['startTime'] == '08:00' and l['endTime'] == '09:20' and 'КН-26-1' in l['group'] for l in lessons))

    def test_parallel_teacher_events_are_not_collapsed(self):
        from integrations.vnau.adapter import parse_matrix
        html = Path('tests/fixtures/vnau_teacher_parallel.html').read_text(encoding='utf-8')
        lessons = parse_matrix(html, source_kind='teacher', owner_id='2264', owner_label='Вовк Валерія Юріївна', start='2026-11-05', end='2026-11-18')
        # Add a synthetic parallel group to a real cell; no source event is invented in production.
        from bs4 import BeautifulSoup
        from copy import deepcopy
        soup = BeautifulSoup(html, 'html.parser')
        first = soup.select_one('div[data-toggle="popover"]')
        twin = deepcopy(first.parent)
        popup = twin.select_one('div[data-toggle="popover"]')
        popup['data-content'] = popup['data-content'].replace('ОП-26-1', 'ОП-26-2')
        popup.select_one('i').string = 'ОП-26-2'
        first.parent.parent.append(twin)
        lessons = parse_matrix(str(soup), source_kind='teacher', owner_id='2264', owner_label='Вовк Валерія Юріївна', start='2026-11-05', end='2026-11-18')
        by_time = {}
        for lesson in lessons:
            key=(lesson['date'], lesson['startTime'], lesson['endTime'])
            by_time.setdefault(key, []).append(lesson)
        overlap=[items for items in by_time.values() if len(items)>1]
        self.assertTrue(overlap, 'Очікуються одночасні заняття з різних груп')
        self.assertTrue(all(len({x['sourceId'] for x in items}) == len(items) for items in overlap))

if __name__ == '__main__': unittest.main()
