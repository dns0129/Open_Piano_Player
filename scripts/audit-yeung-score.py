#!/usr/bin/env python3
"""Independent pitch audit against original PDF, using clef sign anchors.

Does not import the extractor. The treble G4/bass F3 sign lines and the
separately inspected page manifest are the reference, rather than the
extractor's bottom-line E4/G2 anchors. Rhythm is audited separately.
"""
import collections
import hashlib
import json
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / 'evidence/international-imslp-yeung.pdf'
MANIFEST = ROOT / 'evidence/full-score/page-manifest.json'
VECTOR = ROOT / 'evidence/full-score/vector-events.json'
OUT = ROOT / 'evidence/full-score/independent-pitch-audit.json'
manifest = json.loads(MANIFEST.read_text())
vector = json.loads(VECTOR.read_text())
anchors = json.loads((ROOT / 'evidence/full-score/independent-page-anchors.json').read_text())
notes = {n['id']: n for n in vector['notes']}
errors = []
checks = collections.Counter()
raw_heads = set()
source_accidentals = 0


def fail(kind, **data):
    errors.append(dict(kind=kind, **data))


def clef_at(system, hand, x):
    eligible = [c for c in system['clefMarks'] if c['hand'] == hand and c['x'] <= x + .01]
    return max(eligible, key=lambda c: c['x'])['clef'] if eligible else system['activeClefAtStart'][hand]


def diatonic(system, hand, x, y):
    clef = clef_at(system, hand, x)
    lines = system['staffLines'][hand]
    # The clef itself names this line: G4 in treble and F3 in bass.
    anchor_y, anchor_index = (lines[3], 4 * 7 + 4) if clef == 'treble' else (lines[1], 3 * 7 + 3)
    half_step = (lines[4] - lines[0]) / 8
    step = (anchor_y - y) / half_step
    if abs(step - round(step)) > .025:
        fail('off-staff-grid', page=system['page'], system=system['system'], hand=hand, x=x, y=y)
    return anchor_index + round(step), clef


def which_hand(system, glyph):
    centers = {h: system['staffLines'][h][2] for h in ['right', 'left']}
    return min(centers, key=lambda h: abs(centers[h] - glyph['y']))


def global_beat(point):
    return (point['measure'] - 1) * 2 + point['beat']


def octave_shift(hand, beat):
    return sum(o['shiftSemitones'] for o in manifest['ottava'] if o['hand'] == hand and global_beat(o['start']) - 1e-5 <= beat < global_beat(o['endExclusive']) - 1e-5)


doc = pymupdf.open(PDF)
all_glyphs = collections.Counter()
for page_index, page in enumerate(doc):
    page_no = page_index + 1
    glyphs = []
    for span in page.get_texttrace():
        if 'Aloisen' not in span['font']:
            continue
        for code, gid, origin, bbox in span['chars']:
            g = dict(code=code, seq=span['seqno'], x=origin[0], y=origin[1])
            glyphs.append(g)
            all_glyphs[f'0x{code:04x}'] += 1
    bracket_starts = sorted(g['seq'] for g in glyphs if g['code'] == 0xf03e)
    systems = manifest['pages'][page_index]['systems']
    if len(bracket_starts) != len(systems):
        fail('system-count', page=page_no)
    for system_index, system in enumerate(systems):
        start = bracket_starts[system_index]
        end = bracket_starts[system_index + 1] if system_index + 1 < len(bracket_starts) else float('inf')
        own = [g for g in glyphs if start <= g['seq'] < end]
        for bar_index, (left, right) in enumerate(zip(system['measureBoundariesX'], system['measureBoundariesX'][1:])):
            measure = system['firstMeasure'] + bar_index
            items = [g for g in own if left - .01 <= g['x'] < right - .01]
            accidentals = [g for g in items if g['code'] in [0xf021, 0xf022, 0xf023]]
            source_accidentals += len(accidentals)
            heads = sorted([g for g in items if g['code'] == 0xf074], key=lambda g: g['seq'])
            # Original engraving writes upper-hand heads before lower-hand heads.
            hand_order = [which_hand(system, g) for g in heads]
            if 'right' in hand_order and 'left' in hand_order and hand_order != sorted(hand_order, key=lambda h: h == 'left'):
                fail('hand-drawing-order', measure=measure)
            checks['measureDrawingOrder'] += 1
            for head in heads:
                source_id = f'pdf-p{page_no}-g{head["seq"]}'
                raw_heads.add(source_id)
                note = notes.get(source_id)
                if not note:
                    fail('source-head-missing', id=source_id)
                    continue
                hand = which_hand(system, head)
                degree, clef = diatonic(system, hand, head['x'], head['y'])
                applicable = []
                for accidental in accidentals:
                    if accidental['x'] >= head['x'] or which_hand(system, accidental) != hand:
                        continue
                    accidental_degree, _ = diatonic(system, hand, accidental['x'], accidental['y'])
                    if accidental_degree == degree:
                        applicable.append(accidental)
                last = max(applicable, key=lambda g: (g['x'], g['seq'])) if applicable else None
                accidental = {0xf021: 1, 0xf022: -1, 0xf023: 0}[last['code']] if last else 0
                octave, letter = divmod(degree, 7)
                written_midi = 12 * (octave + 1) + [0, 2, 4, 5, 7, 9, 11][letter] + accidental
                shift = octave_shift(hand, note['beat'])
                expected = dict(page=page_no, system=system['system'], measure=measure, hand=hand,
                                clef=clef, accidental=accidental, writtenMidi=written_midi,
                                octaveShift=shift, midi=written_midi + shift)
                mismatch = {k: dict(expected=v, actual=note.get(k)) for k, v in expected.items() if note.get(k) != v}
                if abs(note['x'] - head['x']) > 1e-5 or abs(note['y'] - head['y']) > 1e-5:
                    mismatch['sourceCoordinate'] = dict(expected=[head['x'], head['y']], actual=[note['x'], note['y']])
                if mismatch:
                    fail('pitch-or-source-mismatch', id=source_id, mismatch=mismatch)
                checks['notePitches'] += 1
                checks['octaveShiftedHeads'] += bool(shift)
                checks['explicitOrCarriedAccidentals'] += last is not None
                # Also compare the seven independently viewed change points in time.
                time_clef = 'treble' if hand == 'right' else 'bass'
                for change in manifest['clefChanges']:
                    effective = (change.get('effectiveMeasure', change['measure']) - 1) * 2 + change.get('effectiveBeat', change['beat'])
                    if change['hand'] == hand and effective <= note['beat'] + 1e-5:
                        time_clef = change['to']
                if time_clef != clef:
                    fail('clef-timing-disagreement', id=source_id, expected=time_clef, actual=clef)
                checks['clefTimeVsPosition'] += 1
for source_id in set(notes) - raw_heads:
    fail('non-source-note', id=source_id)
for anchor in anchors['anchors']:
    for key, order in [('firstRightHandNote', 0), ('lastRightHandNote', -1)]:
        expected = anchor[key]
        actual = sorted([n for n in notes.values() if n['page'] == anchor['page'] and n['hand'] == 'right'], key=lambda n: (n['beat'], n['x']))[order]
        if actual['midi'] != expected['midi'] or actual['measure'] != expected['measure'] or abs(actual['x'] - expected['x']) > .01 or abs(actual['y'] - expected['y']) > .01:
            fail('independent-page-anchor', page=anchor['page'], position=key, expected=expected, actual=actual)
        checks['visuallyInspectedPageAnchors'] += 1
source_sha = hashlib.sha256(PDF.read_bytes()).hexdigest()
if not source_sha == manifest['sourceSha256'] == vector['sourceSha256']:
    fail('source-sha-disagreement')
if dict(all_glyphs) != anchors['musicGlyphInventory']:
    fail('glyph-inventory-disagreement')
if len(raw_heads) != 1313 or len(notes) != 1313 or len(doc) != 7 or vector['durationBeats'] != 210:
    fail('completeness')
if source_accidentals != 488:
    fail('accidental-coverage', count=source_accidentals)
report = dict(passed=not errors, sourceSha256=source_sha, sourcePages=len(doc), sourceHeads=len(raw_heads),
              scoreNotes=len(notes), measures=checks['measureDrawingOrder'], sourceAccidentals=source_accidentals,
              checks=dict(checks), errorCount=len(errors), errors=errors,
              method='Independent G4/F3 clef-line recomputation of every source head; raw PDF accidentals scoped to written degree and measure; separate visually inspected clef/8va beat manifest; 14 page anchors.',
              limitation='Pitch/source audit; complex rhythm is independently inspected in independent-rhythm-audit.json. No alternate edition or AI guesses used.')
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if report['passed'] else 2)
