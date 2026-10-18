#!/usr/bin/env python3
"""Parse VNAU free-classroom HTML fragment. Requires beautifulsoup4."""
import argparse
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup


def parse(html):
    soup = BeautifulSoup(html, 'html.parser')
    root = soup.select_one('#classroom-list')
    if root is None:
        raise ValueError('Missing #classroom-list')
    rooms = []
    for li in root.select('li.classroom'):
        a = li.select_one('a[href]')
        if not a:
            continue
        href = a.get('href', '')
        match_id = re.search(r'[?&]id=(\d+)', href)
        tooltip = li.get('data-original-title') or li.get('title') or ''
        match_seats = re.search(r'Кількість\s+місць\s*(\d+)', tooltip, re.I)
        notes = re.search(r'Примітка\s*:\s*(.*)', tooltip, re.I | re.S)
        note = re.sub(r'<[^>]+>', ' ', notes.group(1)).strip() if notes else ''
        rooms.append({
            'id': match_id.group(1) if match_id else None,
            'name': a.get_text(' ', strip=True),
            'capacity': int(match_seats.group(1)) if match_seats else None,
            'available': 'bg-danger' not in li.get('class', []),
            'note': note,
            'url': 'http://81.30.162.30' + href if href.startswith('/') else href,
        })
    return rooms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('html', help='HTML snippet or full page')
    ap.add_argument('--date', default=None, help='YYYY-MM-DD, date of snapshot')
    ap.add_argument('--start-pair', type=int, default=None)
    ap.add_argument('--end-pair', type=int, default=None)
    ap.add_argument('--output', default='classrooms.json')
    args = ap.parse_args()
    rooms = parse(Path(args.html).read_text(encoding='utf-8'))
    output = {'source': 'http://81.30.162.30/time-table/free-classroom',
              'date': args.date, 'startPair': args.start_pair, 'endPair': args.end_pair,
              'rooms': rooms}
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"Rooms: {len(rooms)}, free: {sum(r['available'] for r in rooms)}, occupied: {sum(not r['available'] for r in rooms)}")

if __name__ == '__main__':
    main()
