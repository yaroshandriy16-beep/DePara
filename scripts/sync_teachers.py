#!/usr/bin/env python3
"""VNAU teachers: build chair/teacher catalog and fetch a bounded batch of schedules."""
import argparse
import datetime as dt
import json
import os
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = 'http://81.30.162.30/time-table/teacher?type=0'
OUT = Path('data/teachers')
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; DePara timetable reader)', 'Referer': URL}


def parse(html):
    return BeautifulSoup(html, 'html.parser')


def options(soup, css):
    result = []
    for item in soup.select(css + ' option'):
        key = item.get('value', '').strip()
        name = item.get_text(' ', strip=True)
        if key and name and not name.startswith('--'):
            result.append({'id': key, 'name': ' '.join(name.split())})
    return result


def csrf(soup):
    inp = soup.select_one('input[name="_csrf-frontend"]')
    meta = soup.select_one('meta[name="csrf-token"]')
    token = (inp or meta)
    if token is None:
        raise RuntimeError('CSRF token not found')
    return token.get('value') or token.get('content')


def post(session, token, chair, teacher='', start=None, end=None):
    data = {'_csrf-frontend': token, 'TimeTableForm[structureId]': '0',
            'TimeTableForm[chairId]': str(chair), 'TimeTableForm[teacherId]': str(teacher)}
    if teacher:
        data.update({'date-picker': f'{start} - {end}', 'TimeTableForm[dateStart]': start,
                     'TimeTableForm[dateEnd]': end, 'TimeTableForm[indicationDays]': '5',
                     'time-table-type': '1'})
    r = session.post(URL, data=data, headers=HEADERS, timeout=35)
    r.raise_for_status()
    soup = parse(r.text)
    if not soup.select_one('#filter-form'):
        raise RuntimeError('Server response lacks #filter-form')
    return soup


def schedule(soup):
    table = soup.select_one('#timeTable')
    if table is None:
        raise RuntimeError('Server response lacks #timeTable')
    lessons = []
    dates = []
    for row in table.select('tr'):
        day_dates = [x.get_text(' ', strip=True) for x in row.select('th.headdate')]
        if day_dates:
            dates = day_dates
            continue
        head = row.select_one('th.headcol')
        if not head:
            continue
        number = re.search(r'\d+', (head.select_one('.lesson') or head).get_text(' ', strip=True))
        if not number:
            continue
        start = head.select_one('.start')
        end = head.select_one('.end')
        for date, cell in zip(dates, row.select('td')):
            if 'closed' in cell.get('class', []):
                continue
            for item in cell.select('[data-content]'):
                content = parse(item.get('data-content', ''))
                lines = [x.strip() for x in content.get_text('\n', strip=True).splitlines() if x.strip()]
                if not lines:
                    continue
                try:
                    iso = dt.datetime.strptime(date, '%d.%m.%Y').date().isoformat()
                except ValueError:
                    continue
                lessons.append({'date': iso, 'pair': int(number.group()),
                                'start': start.get_text(' ', strip=True) if start else '',
                                'end': end.get_text(' ', strip=True) if end else '',
                                'subject': lines[0], 'details': lines[1:],
                                'short': item.get_text(' ', strip=True)})
    return lessons


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--batch', type=int, default=20, help='Number of teacher schedules per run')
    ap.add_argument('--delay', type=float, default=0.6)
    args = ap.parse_args()
    with requests.Session() as session:
        session.headers.update(HEADERS)
        resp = session.get(URL, timeout=35)
        resp.raise_for_status()
        root = parse(resp.text)
        token = csrf(root)
        chairs = options(root, '#timetableform-chairid')
        if not chairs:
            raise RuntimeError('No chairs in initial page')
        catalog = []
        errors = []
        for chair in chairs:
            try:
                page = post(session, token, chair['id'])
                teachers = options(page, '#timetableform-teacherid')
                for teacher in teachers:
                    catalog.append({**teacher, 'chairId': chair['id'], 'chair': chair['name']})
                print(f"{chair['id']}: {len(teachers)} teachers", flush=True)
            except Exception as e:
                errors.append({'chairId': chair['id'], 'error': str(e)})
            time.sleep(args.delay)
        if not catalog:
            raise RuntimeError('No teachers found; refusing to overwrite catalog')
        unique = {(t['chairId'], t['id']): t for t in catalog}
        catalog = sorted(unique.values(), key=lambda x: x['name'].casefold())
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        write(OUT / 'catalog.json', {'generatedAt': now, 'source': URL, 'chairs': chairs,
                                      'teachers': catalog, 'errors': errors})
        today = dt.datetime.now(dt.timezone.utc).date()
        start = today.strftime('%d.%m.%Y')
        end = (today + dt.timedelta(days=35)).strftime('%d.%m.%Y')
        cursor_path = OUT / 'cursor.json'
        try:
            cursor = int(json.loads(cursor_path.read_text()).get('offset', 0))
        except (OSError, ValueError, TypeError):
            cursor = 0
        batch = max(0, min(args.batch, 100))
        targets = [catalog[(cursor + i) % len(catalog)] for i in range(min(batch, len(catalog)))]
        ok = 0
        for teacher in targets:
            try:
                page = post(session, token, teacher['chairId'], teacher['id'], start, end)
                actual = options(page, '#timetableform-teacherid')
                if teacher['id'] not in [x['id'] for x in actual]:
                    raise RuntimeError('Teacher ID missing from server response')
                lessons = schedule(page)
                write(OUT / 'schedules' / (teacher['id'] + '.json'),
                      {'teacher': teacher, 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                       'rangeStart': today.isoformat(), 'rangeEnd': (today + dt.timedelta(days=35)).isoformat(),
                       'lessons': lessons})
                ok += 1
            except Exception as e:
                errors.append({'teacherId': teacher['id'], 'error': str(e)})
            time.sleep(args.delay)
        write(cursor_path, {'offset': (cursor + len(targets)) % len(catalog)})
        write(OUT / 'status.json', {'generatedAt': now, 'chairs': len(chairs),
                                     'teachers': len(catalog), 'schedulesUpdated': ok,
                                     'errors': errors})
        print(f'Catalog: {len(catalog)}; schedules updated: {ok}; errors: {len(errors)}')
        if not ok and batch:
            raise RuntimeError('All teacher schedule requests failed; inspect status.json')

if __name__ == '__main__':
    main()
