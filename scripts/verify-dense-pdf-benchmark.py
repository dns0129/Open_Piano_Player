"""Independent Counter implementation cross-check for this fixed benchmark.
Checks source XML again; quantized counters are a cross-check on this dataset,
not a replacement for the JS maximum matching tolerance algorithm.
"""
from collections import Counter
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent / 'omr-benchmark'))
from reference import read_score

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.local/dense-pdf-benchmark-20261021')
report_path = Path(sys.argv[2] if len(sys.argv) > 2 else 'output/密集复杂PDF识谱评测-20261021/results.json')
report = json.loads(report_path.read_text())
manifest = json.loads((root / 'manifest.json').read_text())
run = json.loads((root / 'run.json').read_text())

def key(n):
    return n['hand'], n['midi'], round(n['beat'] * 10000), round(n['duration'] * 10000)

checked = []
for source in manifest:
    whole = read_score(root / source['id'] / 'reference.mxl')
    job = next(j for j in run['jobs'] if j['key'] == source['id'])
    final = json.loads((root / source['id'] / 'final-state.json').read_text())
    for region in source['regions']:
        first, last = region['referenceRange']
        offset = whole['measures'][first - 1]['beat']
        heads = [dict(n, beat=n['beat'] - offset) for n in whole['notes']
                 if first <= n['measure'] <= last and not n['grace']]
        expected = Counter(map(key, heads))
        row = next(r for r in report['rows'] if r['source'] == source['id'] and r['system'] == region['system'])
        initial = json.loads((root / 'raw-calls' / f"{job['id']}-{region['id']}-first.json").read_text())
        final_region = next(r for r in final['regions'] if r['id'] == region['id'])
        phases = [('first', initial.get('result')), ('framework', final_region.get('result'))]
        fallback_path = root / 'raw-calls' / f"{job['id']}-{region['id']}-fallback.json"
        if fallback_path.exists():
            fallback = json.loads(fallback_path.read_text()).get('result')
            if fallback: phases.append(('fallback', fallback))
        for phase, result in phases:
            notes = (result or {}).get('score', {}).get('notes', [])
            actual = Counter(map(key, notes))
            correct = sum((expected & actual).values())
            observed = row[phase]['strict']
            assert (len(heads), len(notes), correct) == (observed['reference'], observed['predicted'], observed['correct']), (source['id'], region['system'], phase)
        checked.append(dict(source=source['id'], system=region['system'], referenceHeads=len(heads)))
verification = dict(passed=True, checkedRows=len(checked), referenceHeads=sum(r['referenceHeads'] for r in checked), rows=checked)
(report_path.parent / 'independent-verification.json').write_text(json.dumps(verification, indent=2))
print(json.dumps(verification))
