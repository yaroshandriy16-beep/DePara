"""VNAU schedule fetcher. No fabricated lessons; errors never overwrite previous files."""
import argparse
import json
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = 'http://81.30.162.30/time-table/group?type=0'
OUT = Path('data')
SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'VNAU-Student-Timetable/1.0 (educational project)'})
DELAY = float(os.getenv('VNAU_REQUEST_DELAY', '1.5'))


def soup_request(payload=None):
    response = SESSION.get(URL, timeout=40) if payload is None else SESSION.post(URL, data=payload, timeout=40)
    response.raise_for_status()
    if 'text/html' not in response.headers.get('Content-Type', 'text/html'):
        raise ValueError('Expected HTML')
    soup = BeautifulSoup(response.text, 'html.parser')
    form = soup.select_one('form#filter-form')
    if form is None:
        raise ValueError('No timetable form found')
    return soup


def options(soup, select_id):
    element = soup.select_one(f'select#{select_id}')
    if not element:
        raise ValueError(f'Missing select: {select_id}')
    return [(o.get('value'), o.get_text(' ', strip=True)) for o in element.select('option') if o.get('value') not in ('', None)]


def csrf(soup):
    element = soup.select_one('form#filter-form input[name="_csrf-frontend"]')
    if element is None:
        raise ValueError('CSRF field missing')
    return element.get('value', '')


def form_data(soup, structure='0', faculty='', course='', group='', start=None, end=None):
    result = {'_csrf-frontend': csrf(soup), 'TimeTableForm[structureId]': structure,
              'TimeTableForm[facultyId]': faculty, 'TimeTableForm[course]': course,
              'TimeTableForm[groupId]': group}
    if start and end:
        result.update({'TimeTableForm[dateStart]': start, 'TimeTableForm[dateEnd]': end,
                       'TimeTableForm[indicationDays]': '5', 'time-table-type': '1'})
    return result


def post(soup, **kwargs):
    time.sleep(DELAY)
    return soup_request(form_data(soup, **kwargs))


def iso_date(raw):
    return datetime.strptime(raw, '%d.%m.%Y').date().isoformat()


def clean(value):
    return re.sub(r'\s+', ' ', unescape(value or '')).strip()


def parse_lessons(soup):
    table = soup.select_one('table#timeTable')
    if table is None:
        raise ValueError('Schedule table #timeTable missing')
    dates = []
    result = []
    for tr in table.select('tr'):
        day_header = tr.select_one('th.headday')
        if day_header:
            dates = [iso_date(x.get_text(' ', strip=True)) for x in tr.select('th.headdate')]
            continue
        head = tr.select_one('th.headcol')
        if not head or not dates:
            continue
        start_el, end_el = head.select_one('.start'), head.select_one('.end')
        if not start_el or not end_el:
            continue
        start, end = clean(start_el.get_text()), clean(end_el.get_text())
        for idx, td in enumerate(tr.find_all('td', recursive=False)):
            if idx >= len(dates) or 'closed' in td.get('class', []):
                continue
            for item in td.select('[data-toggle="popover"][data-content]'):
                raw = unescape(item.get('data-content', '')).replace('&lt;br&gt;', '<br>')
                parts = [clean(BeautifulSoup(p, 'html.parser').get_text(' ', strip=True)) for p in re.split(r'<br\s*/?>', raw, flags=re.I)]
                parts = [p for p in parts if p]
                if not parts:
                    continue
                subject_type = parts[0]
                match = re.search(r'\[([^\]]+)\]\s*$', subject_type)
                lesson_type = match.group(1) if match else ''
                subject = subject_type[:match.start()].strip() if match else subject_type
                room = next((x for x in parts[1:] if x.lower().startswith('ауд.')), '')
                teacher = next((x for x in parts[1:] if x not in (room,) and not x.startswith(('Додано:', 'Змінено:')) and not re.fullmatch(r'.*-\d{2}-\d', x)), '')
                if not subject:
                    continue
                result.append({'date': dates[idx], 'start': start, 'end': end,
                               'subject': subject, 'type': lesson_type, 'room': room,
                               'teacher': teacher})
    return sorted(result, key=lambda x: (x['date'], x['start'], x['subject']))


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--group', help='Only one group ID for initial verification, e.g. 3641')
    ap.add_argument('--days', type=int, default=28)
    ap.add_argument('--max-groups', type=int, default=0, help='Limit for trial run; 0 = all')
    args = ap.parse_args()
    if not 1 <= args.days <= 60:
        ap.error('--days must be 1..60')
    start = date.today().strftime('%d.%m.%Y')
    end = (date.today() + timedelta(days=args.days)).strftime('%d.%m.%Y')
    initial = soup_request()
    structures = [(v, n) for v, n in options(initial, 'timetableform-structureid') if v == '0']
    if not structures:
        raise ValueError('BUZ structure not found')
    catalog = []
    count = 0
    failures = []
    for structure, _ in structures:
        for faculty, fname in options(initial, 'timetableform-facultyid'):
            faculty_page = post(initial, structure=structure, faculty=faculty)
            faculty_entry = {'id': faculty, 'name': fname, 'courses': []}
            for course, _ in options(faculty_page, 'timetableform-course'):
                course_page = post(faculty_page, structure=structure, faculty=faculty, course=course)
                groups = options(course_page, 'timetableform-groupid')
                if not groups:
                    continue
                course_entry = {'course': int(course), 'groups': []}
                for gid, gname in groups:
                    if args.group and gid != args.group:
                        continue
                    if args.max_groups and count >= args.max_groups:
                        break
                    try:
                        group_page = post(course_page, structure=structure, faculty=faculty, course=course,
                                          group=gid, start=start, end=end)
                        lessons = parse_lessons(group_page)
                        record = {'meta': {'university': 'ВНАУ', 'faculty': fname, 'course': int(course),
                                           'group': gname, 'groupId': gid, 'source': URL,
                                           'updatedAt': datetime.now(timezone.utc).isoformat()},
                                  'lessons': lessons}
                        atomic_json(OUT / 'groups' / f'{gid}.json', record)
                        if gid == '3641':
                            atomic_json(Path('schedule.json'), record)
                        course_entry['groups'].append({'id': gid, 'name': gname, 'path': f'data/groups/{gid}.json'})
                        count += 1
                        print(f'{fname} / {course} / {gname}: {len(lessons)} lessons', flush=True)
                    except Exception as exc:
                        failures.append(f'{gid}: {exc}')
                        print(f'WARNING {gid}: {exc}', flush=True)
                if course_entry['groups']:
                    faculty_entry['courses'].append(course_entry)
                if args.max_groups and count >= args.max_groups:
                    break
            if faculty_entry['courses']:
                catalog.append(faculty_entry)
            if args.max_groups and count >= args.max_groups:
                break
    if not count:
        raise RuntimeError('No schedules downloaded; existing files left untouched')
    # A partial run must not replace a complete catalog.
    if not args.group and not args.max_groups and not failures:
        atomic_json(OUT / 'catalog.json', {'updatedAt': datetime.now(timezone.utc).isoformat(), 'faculties': catalog})
    print(f'Downloaded {count} groups. Failed: {len(failures)}. Catalog updated: {not (args.group or args.max_groups or failures)}')
    if failures:
        raise RuntimeError('Some groups failed; preserving previous catalog')


if __name__ == '__main__':
    main()
