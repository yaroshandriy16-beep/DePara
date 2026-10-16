#!/usr/bin/env python3
"""Fetch VNAU free classrooms with a fresh CSRF/session, fail closed on invalid HTML."""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from parse_classrooms import parse

BASE = 'http://81.30.162.30/time-table/free-classroom'


def csrf_from_html(html):
    soup = BeautifulSoup(html, 'html.parser')
    hidden = soup.select_one('input[name="_csrf-frontend"]')
    if hidden and hidden.get('value'):
        return hidden['value']
    meta = soup.select_one('meta[name="csrf-token"]')
    if meta and meta.get('content'):
        return meta['content']
    raise ValueError('No CSRF token found on initial page')


def get_rooms(session, date, start, end, structure='0', corpus='', timeout=35):
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; DeParaSchedule/1.0)', 'Accept-Language': 'uk-UA,uk;q=0.9'}
    initial = session.get(BASE, headers=headers, timeout=timeout)
    initial.raise_for_status()
    token = csrf_from_html(initial.text)
    soup = BeautifulSoup(initial.text, 'html.parser')
    form = soup.select_one('form:has(input[name="TimeTableForm[date]"])')
    # If the form is present, respect its action; otherwise submit to known endpoint.
    action = urljoin(initial.url, form.get('action', '')) if form else BASE
    payload = {
        '_csrf-frontend': token,
        'TimeTableForm[structureId]': str(structure),
        'TimeTableForm[corpusId]': str(corpus),
        'TimeTableForm[lessonNumberStart]': str(start),
        'TimeTableForm[lessonNumberEnd]': str(end),
        'TimeTableForm[date]': date.strftime('%d.%m.%Y'),
    }
    response = session.post(action, data=payload, headers={**headers, 'Referer': initial.url}, timeout=timeout)
    response.raise_for_status()
    if 'text/html' not in response.headers.get('Content-Type', 'text/html').lower():
        raise ValueError('Unexpected response content type')
    rooms = parse(response.text)
    if len(rooms) < 5:
        raise ValueError(f'Only {len(rooms)} classrooms found; refusing suspicious snapshot')
    return {
        'source': BASE,
        'date': date.strftime('%Y-%m-%d'),
        'startPair': start,
        'endPair': end,
        'structureId': str(structure),
        'corpusId': str(corpus),
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'status': 'official-site-snapshot',
        'rooms': rooms,
    }


def main():
    p = argparse.ArgumentParser(description='Fetch actual free classrooms from VNAU')
    p.add_argument('--date', default=datetime.now().strftime('%Y-%m-%d'), help='YYYY-MM-DD')
    p.add_argument('--start-pair', type=int, default=2)
    p.add_argument('--end-pair', type=int, default=2)
    p.add_argument('--structure', default='0')
    p.add_argument('--corpus', default='')
    p.add_argument('--output', default='data/campus/free-classrooms.json')
    args = p.parse_args()
    try:
        day = datetime.strptime(args.date, '%Y-%m-%d')
        if not 1 <= args.start_pair <= args.end_pair <= 12:
            raise ValueError('Invalid pair range')
        with requests.Session() as session:
            result = get_rooms(session, day, args.start_pair, args.end_pair, args.structure, args.corpus)
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        tmp = output.with_suffix(output.suffix + '.tmp')
        tmp.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(output)
        print(f"Saved {len(result['rooms'])} rooms ({sum(r['available'] for r in result['rooms'])} free) to {output}")
    except (requests.RequestException, ValueError, OSError) as exc:
        print(f'ERROR: {exc}. Existing JSON left untouched.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
