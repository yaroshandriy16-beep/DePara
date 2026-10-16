#!/usr/bin/env python3
"""Non-destructive VNAU teacher form probe. Does not claim to parse lessons."""
import json, os, re, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

URL = 'http://81.30.162.30/time-table/teacher?type=0'
OUT = Path('data/teachers')
DEBUG = Path('teacher-diagnostics')
OUT.mkdir(parents=True, exist_ok=True)
DEBUG.mkdir(parents=True, exist_ok=True)
s = requests.Session()
s.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; DePara-TeacherProbe/1.0)', 'Accept-Language': 'uk-UA,uk;q=0.9', 'Referer': URL})

def fetch(method, **kwargs):
    r = s.request(method, URL, timeout=45, allow_redirects=True, **kwargs)
    r.raise_for_status()
    if '/time-table/teacher' not in r.url:
        raise RuntimeError('Unexpected redirect: ' + r.url)
    return r

def options(select):
    return [{'id': o.get('value', '').strip(), 'name': o.get_text(' ', strip=True)}
            for o in select.find_all('option') if o.get('value', '').strip() not in ('', '0')]

def find_select(soup, key):
    return soup.find('select', attrs={'name': re.compile(key, re.I)}) or soup.find('select', id=re.compile(key, re.I))

try:
    page = fetch('GET')
    soup = BeautifulSoup(page.text, 'html.parser')
    csrf = soup.find('input', attrs={'name': '_csrf-frontend'})
    meta = soup.find('meta', attrs={'name': 'csrf-token'})
    token = (csrf.get('value') if csrf else None) or (meta.get('content') if meta else None)
    if not token:
        raise RuntimeError('CSRF token missing on teacher page')

    teacher_sel = find_select(soup, 'teacherId')
    chair_sel = find_select(soup, 'chairId')
    teacher_options = options(teacher_sel) if teacher_sel else []
    chair_options = options(chair_sel) if chair_sel else []
    # Some sites populate teacher choices only after department selection.
    # Save diagnostic HTML as Actions artifact, never commit it to the repo.
    (DEBUG / 'initial-page.html').write_text(page.text, encoding='utf-8')
    form_fields = sorted(set(x.get('name') for x in soup.select('form [name]') if x.get('name') and 'csrf' not in x.get('name', '').lower()))
    summary = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'source': URL,
               'teacherOptionsOnInitialPage': len(teacher_options),
               'chairOptionsOnInitialPage': len(chair_options),
               'formFields': form_fields,
               'note': 'Only options present in initial HTML. Not a complete teacher catalog.'}
    (DEBUG / 'probe-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    if teacher_options:
        (OUT / 'initial-options.json').write_text(json.dumps({'generatedAt': summary['checkedAt'], 'complete': False, 'teachers': teacher_options}, ensure_ascii=False, indent=2), encoding='utf-8')

    # Validate POST using sample IDs observed in user's DevTools screenshot.
    # Response stored only as downloadable workflow artifact for analysis.
    today = datetime.now(timezone.utc).date()
    end = today + timedelta(days=28)
    fmt = lambda d: d.strftime('%d.%m.%Y')
    data = {
        '_csrf-frontend': token,
        'TimeTableForm[structureId]': '0',
        'TimeTableForm[chairId]': os.environ.get('TEACHER_CHAIR_ID', '145'),
        'TimeTableForm[teacherId]': os.environ.get('TEACHER_ID', '1998'),
        'date-picker': f'{fmt(today)} - {fmt(end)}',
        'TimeTableForm[dateStart]': fmt(today),
        'TimeTableForm[dateEnd]': fmt(end),
        'TimeTableForm[indicationDays]': '5',
        'time-table-type': '1',
    }
    response = fetch('POST', data=data)
    (DEBUG / 'sample-teacher-response.html').write_text(response.text, encoding='utf-8')
    table_soup = BeautifulSoup(response.text, 'html.parser')
    tables = table_soup.find_all('table')
    summary['postHttpStatus'] = response.status_code
    summary['postTables'] = len(tables)
    summary['postResponseBytes'] = len(response.content)
    summary['teacherIdSample'] = data['TimeTableForm[teacherId]']
    summary['chairIdSample'] = data['TimeTableForm[chairId]']
    (DEBUG / 'probe-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print('SUCCESS: Teacher page GET and sample POST completed; review Actions artifact to build accurate parser.')
except Exception as exc:
    print('ERROR:', str(exc), file=sys.stderr)
    sys.exit(1)
