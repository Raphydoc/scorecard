# python3 tools/apply_live.py <fred.json> <cot.json> : met à jour data.json → live et écrit live.json (pour la base de données de l'artifact)
import json, sys, datetime
d = json.load(open('data.json')); old = d.get('live') or {}
f = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and sys.argv[1] != '-' else {}
c = json.load(open(sys.argv[2])) if len(sys.argv) > 2 and sys.argv[2] != '-' else {}
live = {'asOf': datetime.date.today().isoformat(), 'snap': True, 'src': 'FRED (Federal Reserve Bank of St. Louis), CFTC',
        'macro': {**old.get('macro', {}), **f.get('macro', {})}, 'rates': {**old.get('rates', {}), **f.get('rates', {})}, 'cot': {**old.get('cot', {}), **c.get('cot', {})}}
assert live['macro'].get('cpi') and live['rates'].get('y10') and len(live['cot']) >= 12, 'données incomplètes'
same = all(live[k] == old.get(k) for k in ('macro', 'rates', 'cot'))
if same and old.get('asOf'): live['asOf'] = old['asOf']
d['live'] = live
if not same: d['updatedAt'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
json.dump(d, open('data.json', 'w'), ensure_ascii=False, indent=1)
json.dump(live, open('live.json', 'w'), separators=(',', ':'))
print('ok', live['macro']['cpi'][-1], live['rates']['y10'][-1], {k: v[-1][0] for k, v in live['cot'].items()})
