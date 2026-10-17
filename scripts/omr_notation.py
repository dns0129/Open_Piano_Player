"""Evidence-based piano notation recovery, independent of title and page numbers.

The optical engine remains the source of heads and symbols. These rules never
fill a bar by inventing notes, rests, tuplets, or ties from a familiar melody.
"""
from fractions import Fraction

EPS = 1e-5
WRITTEN = {'long': 16, 'breve': 8, 'whole': 4, 'half': 2, 'quarter': 1,
           'eighth': Fraction(1, 2), '16th': Fraction(1, 4), '32nd': Fraction(1, 8),
           '64th': Fraction(1, 16), '128th': Fraction(1, 32), '256th': Fraction(1, 64)}
ALTERS = {'double-flat': -2, 'flat-flat': -2, 'flat': -1, 'natural': 0,
          'sharp': 1, 'double-sharp': 2, 'sharp-sharp': 2}


class RefinementError(Exception):
    def __init__(self, message, code='AUDIVERIS_UNMATCHED_TIE'):
        super().__init__(message)
        self.code = code


def written_beats(note):
    value = WRITTEN.get(note.findtext('type'))
    if value is None:
        return None
    dots = len(note.findall('dot'))
    return Fraction(value) * (2 - Fraction(1, 2 ** dots))


def correction(kind, description, evidence, before='', after='', **extra):
    return dict(kind=kind, description=description, evidence=evidence,
                before=str(before), after=str(after), **extra)


def _clock(element, divisions, durations=None):
    """Re-time full voice backups; reject partial/forward anchors when changed."""
    raw, cursor, previous, maximum = Fraction(0), Fraction(0), None, Fraction(0)
    events, changes = {}, durations or {}
    for index, child in enumerate(element):
        if child.tag in ('backup', 'forward'):
            amount = Fraction(child.findtext('duration', '0')) / divisions
            if child.tag == 'forward':
                if changes:
                    raise ValueError('forward anchor is ambiguous after a ratio change')
                raw += amount; cursor += amount
            else:
                raw -= amount
                if changes and raw != 0:
                    raise ValueError('partial backup is ambiguous after a ratio change')
                cursor = Fraction(0) if changes else cursor - amount
            maximum = max(maximum, cursor)
        elif child.tag == 'note' and child.find('grace') is None:
            original = Fraction(child.findtext('duration', '0')) / divisions
            duration = changes.get(index, original)
            chord = child.find('chord') is not None
            beat = previous if chord and previous is not None else cursor
            events[index] = {'beat': beat, 'duration': duration,
                             'staff': int(child.findtext('staff', '1')),
                             'voice': child.findtext('voice', '1'),
                             'rest': child.find('rest') is not None}
            previous = beat
            if not chord:
                raw += original; cursor += duration
            maximum = max(maximum, beat + duration, cursor)
    return events, maximum


def _complete(events, nominal):
    for staff in (1, 2):
        members = [event for event in events.values() if event['staff'] == staff]
        intervals = sorted((e['beat'], e['beat'] + e['duration']) for e in members)
        cursor = Fraction(0)
        for start, stop in intervals:
            if start > cursor or stop > nominal or start < 0:
                return False
            cursor = max(cursor, stop)
        if cursor != nominal:
            return False
        for voice in {e['voice'] for e in members}:
            spans = sorted(set((e['beat'], e['duration'], e['rest']) for e in members if e['voice'] == voice))
            end = Fraction(0)
            for start, duration, _ in spans:
                if start < end:
                    return False
                end = start + duration
    return True


def tuplet_timeline(element, divisions, nominal):
    """Recover only complete explicit 3:2 groups with a uniquely valid meter.

    Some exporters write ordinary durations beside an explicit 3:2 ratio. A
    closed group plus both staves' exact coverage is required to correct them.
    Explicitly correct durations are left unchanged, so cached raw artifacts can
    be remapped repeatedly without accumulating a correction.
    """
    divisions, nominal = Fraction(str(divisions)), Fraction(str(nominal))
    opened, groups = {}, []
    for index, note in enumerate(element):
        if note.tag != 'note' or note.find('grace') is not None:
            continue
        voice = (note.findtext('staff', '1'), note.findtext('voice', '1'))
        for mark in note.findall('notations/tuplet'):
            if mark.get('type') == 'start':
                key = voice + (mark.get('number', '1'),)
                if key in opened:
                    return None, [], 'AMBIGUOUS_TUPLET_GROUP'
                opened[key] = []
        for key, members in opened.items():
            if key[:2] == voice:
                members.append((index, note))
        for mark in note.findall('notations/tuplet'):
            if mark.get('type') == 'stop':
                members = opened.pop(voice + (mark.get('number', '1'),), None)
                if members:
                    groups.append(members)
    changes, corrected_groups = {}, 0
    for members in groups:
        proposed, total, valid = {}, Fraction(0), True
        for index, note in members:
            ratio = note.find('time-modification')
            printed = written_beats(note)
            if ratio is None or ratio.findtext('actual-notes') != '3' or ratio.findtext('normal-notes') != '2' or printed is None:
                valid = False; break
            expected = printed * Fraction(2, 3)
            actual = Fraction(note.findtext('duration', '0')) / divisions
            if actual not in (printed, expected):
                valid = False; break
            if actual != expected:
                proposed[index] = expected
            if note.find('chord') is None:
                total += expected
        # A closed mixed group occupies a binary span, rather than three heads.
        binary = total > 0 and total.numerator & (total.numerator - 1) == 0 and total.denominator & (total.denominator - 1) == 0
        if valid and binary and proposed:
            changes.update(proposed); corrected_groups += 1
    if not changes:
        return None, [], None
    try:
        _, before = _clock(element, divisions)
        plan, after = _clock(element, divisions, changes)
    except (ValueError, ZeroDivisionError):
        return None, [], 'TUPLET_DURATION_CONFLICT'
    if before <= nominal or after != nominal or not _complete(plan, nominal):
        return None, [], 'TUPLET_DURATION_CONFLICT'
    record = correction('triplet-duration', f'按明确的3:2标记恢复{corrected_groups}组连音时值，并校验双手完整覆盖。',
                        'MusicXML闭合tuplet与time-modification=3:2；双手时值与拍号一致',
                        f'小节{float(before):g}拍', f'小节{float(after):g}拍')
    return {'events': plan, 'maximum': after}, [record], None


def place_graces(events):
    """Keep written heads; borrow a short window within the same written bar."""
    records, problems, handled = [], [], set()
    for index, event in enumerate(events):
        if 'grace' not in event or index in handled:
            continue
        identity = (event['staff'], event['voice'])
        members, principal = [], None
        for at in range(index, len(events)):
            candidate = events[at]
            if (candidate['staff'], candidate['voice']) != identity:
                continue
            if 'grace' in candidate:
                members.append(candidate); handled.add(at)
            else:
                if not candidate.get('rest'):
                    principal = candidate
                break
        if principal is None or any('make-time' in e['grace'] for e in members):
            problems.append('UNSUPPORTED_OR_UNATTACHED_GRACE'); continue
        slots = []
        for member in members:
            if not member.get('chord') or not slots:
                slots.append([])
            slots[-1].append(member)
        attrs = members[0]['grace']
        before_ratio, after_ratio = attrs.get('steal-time-previous'), attrs.get('steal-time-following')
        if before_ratio is not None and after_ratio is not None:
            problems.append('UNSUPPORTED_GRACE_BORROW_POLICY'); continue
        principal_group = [e for e in events if 'grace' not in e and not e.get('rest') and
                           (e['staff'], e['voice']) == identity and abs(e['beat'] - principal['beat']) < EPS and abs(e['duration'] - principal['duration']) < EPS]
        previous = [e for e in events if 'grace' not in e and (e['staff'], e['voice']) == identity and
                    abs(e['beat'] + e['duration'] - principal['beat']) < EPS and e['duration'] > 0]
        # A tied donor must keep its boundary; use the principal instead.
        donor = previous if previous and not any(e.get('tieStart') for e in previous) else []
        use_previous = bool(donor) and after_ratio is None
        if before_ratio is not None and not donor:
            problems.append('UNSUPPORTED_GRACE_BORROW_POLICY'); continue
        if not use_previous and any(e.get('tieStop') for e in principal_group):
            problems.append('UNSUPPORTED_GRACE_TIED_PRINCIPAL'); continue
        group = donor if use_previous else principal_group
        available = min(e['duration'] for e in group)
        try:
            supplied = before_ratio if use_previous else after_ratio
            if supplied is not None:
                percent = float(supplied)
                if not 0 < percent < 100:
                    raise ValueError('invalid steal percentage')
                window = available * percent / 100
            else:
                window = min(.0625 * len(slots), .25, available / 4)
        except ValueError:
            problems.append('UNSUPPORTED_GRACE_BORROW_POLICY'); continue
        weights = [max(.001, float(slot[0].get('writtenBeats') or 1)) for slot in slots]
        if min(window * weight / sum(weights) for weight in weights) < 1 / 1024 or available - window < 1 / 1024:
            problems.append('UNSUPPORTED_GRACE_TOO_SHORT'); continue
        onset = principal['beat'] - window if use_previous else principal['beat']
        if not use_previous:
            for item in principal_group:
                item['beat'] += window
        for item in group:
            item['duration'] -= window
        for slot, weight in zip(slots, weights):
            duration = window * weight / sum(weights)
            for item in slot:
                item['beat'], item['duration'] = onset, duration
            onset += duration
        records.append(correction('grace-timing', f'保留{len(members)}个倚音音头，短时值从{"前音/休止" if use_previous else "主音"}借时。',
                                  'MusicXML显式grace标记；保留原图位置，不增减小节时长',
                                  '无独立播放时值', f'总借时{window:g}拍；同组按书写时值比例分配'))
    return records, problems


def resolve_ties(notes, flags, duration):
    """Tie identity is musical pitch + hand + adjacency; voice labels are hints."""
    pending, edges, continuity, records, unresolved = [], [], {'tieIn': [], 'tieOut': []}, [], []
    by_id = {n['id']: n for n in notes}
    for note in sorted(notes, key=lambda item: (item['beat'], item['id'])):
        start, stop = flags[note['id']]
        if stop:
            candidates = [n for n in pending if n['midi'] == note['midi'] and n['hand'] == note['hand'] and abs(n['beat'] + n['duration'] - note['beat']) < EPS]
            same_voice = [n for n in candidates if n['voice'] == note['voice']]
            candidates = same_voice or candidates
            if len(candidates) == 1:
                previous = candidates[0]; pending.remove(previous)
                edges.append({'fromNoteId': previous['id'], 'toNoteId': note['id']})
            elif len(candidates) > 1:
                unresolved.append({'description': '延音终点有多个同音相接候选，未猜测声部。', 'noteIds': [n['id'] for n in candidates] + [note['id']]})
            elif abs(note['beat']) < EPS:
                continuity['tieIn'].append({'noteId': note['id']})
            else:
                unresolved.append({'description': '延音线终点没有时间相接的同音前音。', 'noteIds': [note['id']]})
        if start:
            if any(n['midi'] == note['midi'] and n['hand'] == note['hand'] and n['voice'] == note['voice'] for n in pending):
                unresolved.append({'description': '同声部延音线起点重叠。', 'noteIds': [note['id']]})
            pending.append(note)
    for note in pending:
        if abs(note['beat'] + note['duration'] - duration) >= EPS:
            unresolved.append({'description': '行内延音线起点没有相接终点，且未延续到谱行末。', 'noteIds': [note['id']]})
        else:
            continuity['tieOut'].append({'noteId': note['id']})
    # Give a chain its own logical voice only when exporter labels disagree.
    # This preserves overlap checks for the other genuine independent voices.
    chains = []
    for edge in edges:
        found = next((chain for chain in chains if edge['fromNoteId'] in chain), None)
        if found is None:
            found = {edge['fromNoteId']}; chains.append(found)
        found.add(edge['toNoteId'])
    for chain in chains:
        members = [by_id[n] for n in chain]
        if len({n['voice'] for n in members}) > 1:
            logical = 'tie-' + min(chain)
            before = ', '.join(sorted({n['voice'] for n in members}))
            for note in members:
                note['voice'] = logical
            records.append(correction('tie-voice', '同音高、同手别且时间相接的唯一延音链恢复为一个逻辑声部。',
                                      '显式tie标记；唯一相接音头，不根据旋律猜测', before, logical, noteIds=sorted(chain)))
    return edges, continuity, records, unresolved
