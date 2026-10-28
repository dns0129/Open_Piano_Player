"""Independent scoring oracle; no App decoder, credentials or model calls."""
import json
import sys
from pathlib import Path

EPS = 1e-4


def close(a, b):
    return isinstance(a, (float, int)) and isinstance(b, (float, int)) and abs(a - b) <= EPS


def matching(expected, actual, equal):
    assigned = {}

    def augment(i, seen):
        for j, note in enumerate(actual):
            if j in seen or not equal(expected[i], note):
                continue
            seen.add(j)
            if j not in assigned or augment(assigned[j], seen):
                assigned[j] = i
                return True
        return False

    for i in range(len(expected)):
        augment(i, set())
    return dict(reference=len(expected), predicted=len(actual), correct=len(assigned))


def verify(payload):
    checked, errors = 0, []
    for run in payload['runs']:
        for case in run['cases']:
            ref, pred, expected = case['reference'], case['prediction'], case['expected']
            if ref is None:
                if expected is not None:
                    errors.append(case['caseId'] + ': unknown reference scored')
                continue
            notes = [n for n in ref['notes'] if not n.get('grace')]
            actual = [n for n in pred.get('notes', []) if not n.get('grace')]

            def measure(a, b):
                return not ref.get('compareMeasure') or a.get('measure') == b.get('measure')

            def strict(a, b):
                return a['hand'] == b['hand'] and a['midi'] == b['midi'] and close(a['beat'], b['beat']) and close(a['duration'], b['duration']) and measure(a, b)

            checks = dict(
                strict=matching(notes, actual, strict),
                pitchAndHand=matching(notes, actual, lambda a, b: a['hand'] == b['hand'] and a['midi'] == b['midi'] and measure(a, b)),
                writtenSpelling=matching([n for n in notes if n.get('written')], [n for n in actual if n.get('written')], lambda a, b: strict(a, b) and all(a['written'][k] == b['written'][k] for k in ['step', 'octave', 'alter'])),
                printedAccidentals=matching([n for n in notes if 'printed' in n], [n for n in actual if 'printed' in n], lambda a, b: strict(a, b) and a['printed'] == b['printed']),
            )
            for name, counts in checks.items():
                if any(expected[name][k] != v for k, v in counts.items()):
                    errors.append(run['trial'] + '/' + case['caseId'] + ': ' + name)
            checked += 1
    return dict(schema='recognition-independent-verification/v1', passed=not errors, checkedCases=checked, errors=errors, providerCalls=0)


if __name__ == '__main__':
    result = verify(json.loads(Path(sys.argv[1]).read_text()))
    Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result['passed'] else 1)
