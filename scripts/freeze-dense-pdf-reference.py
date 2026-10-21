"""Freeze independent references for the three documented Noctave PDF excerpts.
Run before any recognition. No app parser or model is used; page/system mapping
was established by looking at the printed measure numbers in the original PDF.
"""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'omr-benchmark'))
from reference import read_score

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.local/dense-pdf-benchmark-20261021')
if (root / 'protocol.json').exists() or (root / 'job-auth.json').exists():
    raise SystemExit('已有冻结记录或识别任务，拒绝覆盖。请使用新目录。')
ranges = {
    'etude-op10-4': [(1, 3), (4, 6), (7, 9), (10, 12), (13, 15), (16, 18)],
    'fantaisie-op66': [(1, 4), (5, 7), (8, 10), (11, 13), (14, 16)],
    'rachmaninoff-op3-2': [(18, 21), (22, 25), (26, 29), (30, 33), (34, 37)],
}
manifest = json.loads((root / 'manifest.json').read_text())
for source in manifest:
    folder = root / source['id']
    reference = read_score(folder / 'reference.mxl')
    (folder / 'reference-all.json').write_text(json.dumps(reference, indent=2))
    from reference import load_xml
    xml, raw = load_xml(folder / 'reference.mxl')
    (folder / 'reference.musicxml').write_bytes(raw)
    measures = xml.findall('part/measure')
    mapped = ranges[source['id']]
    if len(mapped) != len(source['regions']):
        raise SystemExit('谱行数与预先核对的小节映射不符。')
    for region, (first, last) in zip(source['regions'], mapped):
        if any(m.findall('.//octave-shift') for m in measures[first - 1:last]):
            raise SystemExit('参考范围有八度移位，需先独立确认其音高语义。')
        bars = [m for m in reference['measures'] if first <= m['measure'] <= last]
        offset = bars[0]['beat']
        notes = [dict(n, measure=n['measure'] - first + 1, beat=n['beat'] - offset)
                 for n in reference['notes'] if first <= n['measure'] <= last]
        row = dict(notes=notes, measures=[dict(m, measure=m['measure'] - first + 1,
                                             beat=m['beat'] - offset) for m in bars])
        target = folder / f"reference-row-{region['system']}.json"
        target.write_text(json.dumps(row, indent=2))
        region.update(referenceRange=[first, last],
                      referencePrintedRange=[measures[first - 1].get('number'), measures[last - 1].get('number')],
                      referenceSha256=hashlib.sha256(target.read_bytes()).hexdigest())
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
protocol = dict(frozenAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    revision=subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    scope='3 fixed pages / 16 complete grand-staff systems; not full-piece accuracy',
    pages={s['id']: s['selectedPage'] for s in manifest},
    policy='gpt-6.1-sol high; framework recognition plus stock automatic JSON fallback; no manual reruns',
    modelInput='PDF crops plus visible meter/key. Request title anonymized; original printed headers retained. No MusicXML, reference or previous result supplied.',
    metrics='written heads: hand+MIDI+row-relative onset+duration; tolerance 1e-4 quarter beat; all extras retained',
    failurePolicy='all reference heads from failed rows stay in denominator', concurrency=4)
(root / 'protocol.json').write_text(json.dumps(protocol, ensure_ascii=False, indent=2))
print('Frozen', sum(len(s['regions']) for s in manifest), 'systems')
