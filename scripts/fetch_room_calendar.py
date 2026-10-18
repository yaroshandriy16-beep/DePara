#!/usr/bin/env python3
"""Build official snapshots for today and two following days, pairs 1-6."""
import argparse
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import requests
from fetch_free_rooms import get_rooms
from network_retry import resilient_session

ROOT=Path('data/campus')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--days',type=int,default=3)
    ap.add_argument('--pairs',type=int,default=6)
    args=ap.parse_args()
    if not 1<=args.days<=7 or not 1<=args.pairs<=8: raise ValueError('Invalid range')
    today=datetime.now(ZoneInfo('Europe/Kyiv')).date()
    entries=[]; errors=[]
    with resilient_session() as session:
        for delta in range(args.days):
            day=today+timedelta(days=delta)
            for pair in range(1,args.pairs+1):
                path=ROOT/'snapshots'/day.isoformat()/f'pair-{pair}.json'
                try:
                    result=get_rooms(session,datetime.combine(day,datetime.min.time()),pair,pair)
                    path.parent.mkdir(parents=True,exist_ok=True)
                    temp=path.with_suffix('.tmp')
                    temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
                    temp.replace(path)
                    print(f'OK {day} pair {pair}: {len(result["rooms"])} rooms',flush=True)
                except (requests.RequestException,ValueError,OSError) as exc:
                    errors.append(f'{day} pair {pair}: {exc}')
                    print('ERROR',errors[-1],flush=True)
                time.sleep(1)
    # Include only files for the requested days, and only if their data is actually valid.
    for delta in range(args.days):
        day=(today+timedelta(days=delta)).isoformat()
        for pair in range(1,args.pairs+1):
            path=ROOT/'snapshots'/day/f'pair-{pair}.json'
            if not path.exists():continue
            try:
                data=json.loads(path.read_text(encoding='utf-8'))
                if data.get('date')==day and data.get('startPair')==pair and data.get('endPair')==pair and len(data.get('rooms',[]))>=5:
                    entries.append({'date':day,'pair':pair,'fetchedAt':data.get('fetchedAt')})
            except (OSError,ValueError,TypeError):pass
    if not entries:raise RuntimeError('No valid classroom snapshots; keeping previous index')
    ROOT.mkdir(parents=True,exist_ok=True)
    temp=ROOT/'index.json.tmp'
    temp.write_text(json.dumps({'generatedAt':datetime.now(ZoneInfo('Europe/Kyiv')).isoformat(),'snapshots':entries,'errors':len(errors)},ensure_ascii=False,indent=2),encoding='utf-8')
    temp.replace(ROOT/'index.json')
    print(f'Indexed {len(entries)} snapshots; {len(errors)} failed requests')
    if errors:
        print('WARNING: Some classroom snapshots could not be refreshed; previous valid snapshots retained')

if __name__=='__main__':main()
