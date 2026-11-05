from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from integrations.vnau.adapter import (VNAUError, csrf_fields, form_fields, form_options, parse_lessons,
                          post_fields, sanitized_tables, package_result, fetch_group)

HTML = (Path(__file__).parent / 'fixtures' / 'sample_table.html').read_text(encoding='utf-8')

class AdapterTests(unittest.TestCase):
    def test_csrf(self):
        self.assertEqual(csrf_fields(HTML), {'_csrf': 'SYNTHETIC_TEST_TOKEN'})

    def test_post_parameters(self):
        data = post_fields(HTML, structure_id='1', faculty_id='17', course='3',
                           group_id='432', start='03.11.2026', end='10.11.2026')
        self.assertEqual(data['TimeTableForm[groupId]'], '432')
        self.assertEqual(data['TimeTableForm[structureId]'], '1')
        self.assertEqual(data['TimeTableForm[indicationDays]'], '5')
        self.assertEqual(data['time-table-type'], '0')
        self.assertEqual(data['_csrf'], 'SYNTHETIC_TEST_TOKEN')

    def test_lesson_table_keeps_simultaneous_subgroups(self):
        lessons = parse_lessons(HTML, 'ЕІ-23-1')
        self.assertEqual(len(lessons), 3)
        self.assertEqual(lessons[0]['subject'], 'Аграрна політика та земельні відносини')
        self.assertEqual(lessons[0]['date'], '2026-11-03')
        self.assertEqual(lessons[0]['startTime'], '11:30')
        self.assertEqual(lessons[0]['addedDate'], '2026-10-20')
        self.assertTrue(lessons[1]['updatedIndicator'])
        self.assertFalse(lessons[2]['updatedIndicator'])
        self.assertEqual(lessons[1]['startTime'], lessons[2]['startTime'])
        self.assertNotEqual(lessons[1]['sourceId'], lessons[2]['sourceId'])
        self.assertEqual(package_result(lessons, 'ЕІ-23-1')['count'], 3)

    def test_form_options(self):
        self.assertEqual(form_options(HTML)[0]['options'][0]['value'], '17')

    def test_sanitized_html_has_no_token_or_form(self):
        sample = sanitized_tables(HTML)
        self.assertNotIn('SYNTHETIC_TEST_TOKEN', sample)
        self.assertNotIn('time-table-type', sample)
        self.assertIn('lesson-updated', sample)

    def test_sanitized_preserves_public_table_layout_without_secrets(self):
        html = '''<meta name="csrf-token" content="sensitive_token_123">
        <h3>03.11.2026<script>bad_script()</script></h3>
        <table><tr class="lesson-updated" onclick="bad()"><td rowspan="2" colspan="3"
          data-content="&lt;b&gt;Аграрна економіка&lt;/b&gt;&lt;script&gt;bad_script()&lt;/script&gt;"
          title="sensitive_token_123">Пара sensitive_token_123
          <input type="hidden" name="_csrf" value="sensitive_token_123"></td></tr></table>'''
        sample = sanitized_tables(html)
        self.assertIn('rowspan="2"', sample)
        self.assertIn('colspan="3"', sample)
        self.assertIn('data-content="Аграрна економіка"', sample)
        self.assertNotIn('sensitive_token_123', sample)
        self.assertNotIn('bad_script', sample)
        self.assertNotIn('onclick', sample)
        self.assertNotIn('<input', sample)

    def test_form_fields_never_exposes_hidden_values_or_secrets(self):
        html = '<form><input type="hidden" name="_csrf" value="sensitive_token_123"><input name="course" value="private_value"><input type="password" name="p"><select name="group"><option value="42">Group</option></select></form>'
        fields = form_fields(html)
        self.assertEqual(fields, [{'name': 'course', 'type': 'text'}, {'name': 'group', 'type': 'select'}])
        self.assertNotIn('private_value', repr(fields))
        self.assertNotIn('sensitive_token_123', repr(fields))

    def test_form_options_omit_sensitive_selects(self):
        html = '<select name="_csrf"><option value="sensitive_token_123">secret</option></select><select name="course"><option value="1">1</option></select>'
        self.assertEqual([item['name'] for item in form_options(html)], ['course'])

    def test_fetch_group_requires_confirmed_owner_id_and_name(self):
        def response(text): return SimpleNamespace(text=text, raise_for_status=lambda: None)
        selected = '<form><select name="TimeTableForm[groupId]"><option value="3641" selected>ЕІ-23-1</option></select></form>'
        session = SimpleNamespace(headers={}, get=lambda *a, **k: response(HTML), post=lambda *a, **k: response(selected))
        kwargs = dict(structure_id='0', faculty_id='7', course='4', group_id='3641', group_label='ЕІ-23-1', start='05.11.2026', end='18.11.2026')
        with patch('integrations.vnau.adapter.requests.Session', return_value=session):
            self.assertEqual(fetch_group(**kwargs), selected)
            with self.assertRaises(VNAUError): fetch_group(**{**kwargs, 'group_id': '9999'})
            with self.assertRaises(VNAUError): fetch_group(**{**kwargs, 'group_label': 'Інша група'})

    def test_wrong_html_fails_loudly(self):
        with self.assertRaises(VNAUError):
            parse_lessons('<h1>No lessons</h1>', 'ЕІ-23-1')

if __name__ == '__main__':
    unittest.main()
