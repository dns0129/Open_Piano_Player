#!/usr/bin/env python3
"""Read Audiveris' public OMR/MusicXML formats without executing XML entities.

MusicXML supplies performed event times/pitches; OMR supplies actual source-head
bounds. No melody database, inferred notes, or fabricated rests are used.
"""
import argparse
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
from fractions import Fraction
from pathlib import Path
from omr_notation import ALTERS, RefinementError, correction, place_graces, resolve_ties, tuplet_timeline, written_beats


class MappingError(Exception):
    def __init__(self, message, code='AUDIVERIS_MAPPING', details=None):
        super().__init__(message)
        self.code = code
        self.details = details


def number(value, default=0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (ValueError, TypeError):
        return default


def ratio(value, default=0):
    try:
        return float(Fraction(str(value)))
    except (ValueError, ZeroDivisionError):
        return default


def xml(data):
    if len(data) > 50 * 1024 * 1024 or b'<!ENTITY' in data.upper():
        raise MappingError('XML contains unsupported entities or exceeds the size limit.')
    root = ET.fromstring(data)
    for element in root.iter():
        element.tag = element.tag.split('}')[-1]
    return root


def read_member(archive, name):
    entry = archive.getinfo(name)
    if entry.file_size > 50 * 1024 * 1024:
        raise MappingError('An OMR/MusicXML entry exceeds 50 MB.')
    return archive.read(name)


def music_xml(path):
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            container = xml(read_member(archive, 'META-INF/container.xml'))
            name = container.find('.//rootfile').get('full-path')
            return xml(read_member(archive, name))
    return xml(Path(path).read_bytes())


def read_omr(path):
    pages = []
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if re.fullmatch(r'sheet#\d+/sheet#\d+\.xml', name)]
        for name in sorted(names, key=lambda value: int(re.search(r'#(\d+)', value)[1])):
            root = xml(read_member(archive, name))
            picture = root.find('picture')
            if picture is None:
                raise MappingError('OMR sheet has no source picture dimensions.')
            page_number = int(re.search(r'#(\d+)', name)[1])
            page = {'page': page_number, 'width': number(picture.get('width')),
                    'height': number(picture.get('height')), 'systems': []}
            scale = root.find('scale/interline')
            interline = number(scale.get('main')) if scale is not None else 0
            if not interline or not page['width'] or not page['height']:
                raise MappingError('OMR picture scale is missing.')
            for system in root.findall('page/system'):
                parts = system.findall('part')
                if len(parts) != 1 or len(parts[0].findall('staff')) != 2:
                    raise MappingError('Only a single two-staff piano part is supported.', 'AUDIVERIS_INSTRUMENTATION')
                staves = parts[0].findall('staff')
                staff_ids = [staff.get('id') for staff in staves]
                points = [point for staff in staves for point in staff.findall('lines/line/point')]
                heads = []
                for head in system.findall('sig/inters/head'):
                    bounds = head.find('bounds')
                    if bounds is None or head.get('staff') not in staff_ids:
                        continue
                    heads.append({'id': head.get('id'), 'staff': staff_ids.index(head.get('staff')) + 1,
                                  'pitch': number(head.get('pitch')), 'grade': number(head.get('ctx-grade', head.get('grade')), 1),
                                  'shape': head.get('shape', ''),
                                  'x': number(bounds.get('x')), 'y': number(bounds.get('y')),
                                  'width': number(bounds.get('w')), 'height': number(bounds.get('h'))})
                stacks = []
                for stack in system.findall('stack'):
                    stacks.append({'id': stack.get('id'), 'left': number(stack.get('left')),
                                   'right': number(stack.get('right')), 'duration': ratio(stack.get('duration')) * 4,
                                   'expected': ratio(stack.get('expected')) * 4, 'special': stack.get('special', '')})
                ties = []
                relations = system.findall('sig/relations/relation')
                for slur in system.findall('sig/inters/slur'):
                    if slur.get('tie') != 'true':
                        continue
                    endpoints = {}
                    for relation in relations:
                        link = relation.find('slur-head')
                        if relation.get('source') == slur.get('id') and link is not None:
                            endpoints[link.get('side')] = relation.get('target')
                    ties.append({'id': slur.get('id'), 'endpoints': endpoints,
                                 'leftExtension': slur.get('left-extension'), 'rightExtension': slur.get('right-extension')})
                ymin = min(number(p.get('y')) for p in points)
                ymax = max(number(p.get('y')) for p in points)
                music_ink = []
                for symbol in system.findall('sig/inters/*'):
                    bounds = symbol.find('bounds')
                    if bounds is not None and symbol.tag in ('head', 'stem', 'beam', 'small-beam', 'ledger', 'rest', 'clef', 'octave-shift', 'tuplet', 'slur'):
                        music_ink.append({'x': number(bounds.get('x')), 'y': number(bounds.get('y')),
                                          'width': number(bounds.get('w')), 'height': number(bounds.get('h'))})
                page['systems'].append({'page': page_number, 'system': int(system.get('id')),
                                        'interline': interline, 'heads': heads, 'stacks': stacks,
                                        'ties': ties,
                                        'musicInk': music_ink,
                                        'staffTop': ymin, 'staffBottom': ymax,
                                        'left': min(number(p.get('x')) for p in points),
                                        'right': max(number(p.get('x')) for p in points)})
            pages.append(page)
    if not pages:
        raise MappingError('No recognized OMR pages were exported.')
    return pages


STEPS = {'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6}
SEMITONES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def read_measures(root, metadata):
    parts = root.findall('part')
    if len(parts) != 1:
        raise MappingError('MusicXML contains multiple parts; solo piano cannot be assumed.', 'AUDIVERIS_INSTRUMENTATION')
    divisions, time, key = 1, metadata.get('timeSignature', [4, 4]), metadata.get('keySignature', 0)
    tempo = metadata.get('tempo', 90)
    clefs = {1: ('G', 2, 0), 2: ('F', 4, 0)}
    octave_shifts = {}
    measures = []
    for element in parts[0].findall('measure'):
        # MusicXML durations/divisions are rational. Floating cursor arithmetic
        # can turn an exact backup to zero into a negative onset (e.g. -4e-16).
        cursor, previous, maximum = Fraction(0), None, Fraction(0)
        events, problems, notices, corrections = [], [], [], []
        if element.find('.//repeat') is not None or element.find('.//ending') is not None:
            notices.append('按原谱书写小节顺序播放；反复/跳房子尚未展开，须对照练习。')
        for xml_index, child in enumerate(element):
            if child.tag == 'attributes':
                divisions = number(child.findtext('divisions'), divisions)
                if divisions <= 0:
                    raise MappingError('Invalid MusicXML divisions.')
                t = child.find('time')
                if t is not None:
                    if not (t.findtext('beats', '').isdigit() and t.findtext('beat-type', '').isdigit()):
                        problems.append('UNSUPPORTED_COMPOSITE_METER')
                    else:
                        time = [int(t.findtext('beats')), int(t.findtext('beat-type'))]
                if child.find('key/fifths') is not None:
                    key = int(child.findtext('key/fifths'))
                if number(child.findtext('staves'), 2) != 2:
                    problems.append('UNSUPPORTED_STAFF_COUNT')
                for clef in child.findall('clef'):
                    clefs[int(clef.get('number', '1'))] = (clef.findtext('sign'), int(clef.findtext('line', '2')), int(clef.findtext('clef-octave-change', '0')))
            elif child.tag in ('backup', 'forward'):
                duration = Fraction(str(number(child.findtext('duration')))) / Fraction(str(divisions))
                cursor += duration * (-1 if child.tag == 'backup' else 1)
                if cursor < -1e-5:
                    problems.append('INVALID_BACKUP')
                maximum = max(maximum, cursor)
            elif child.tag == 'direction':
                sound = child.find('sound')
                if sound is not None and sound.get('tempo'):
                    tempo = number(sound.get('tempo'), tempo)
                for shift in child.findall('.//octave-shift'):
                    staff = int(child.findtext('staff', '1'))
                    identity = (staff, shift.get('number', '1'))
                    size = int(shift.get('size', '8'))
                    kind = shift.get('type')
                    if kind == 'stop':
                        octave_shifts.pop(identity, None)
                    elif kind in ('up', 'down') and size in (8, 15, 22):
                        octave_shifts[identity] = (1 if kind == 'up' else -1) * ((size - 1) // 7) * 7
                    elif kind != 'continue':
                        problems.append('UNSUPPORTED_OTTAVA')
            elif child.tag == 'note':
                if child.get('print-object') == 'no' and child.find('rest') is not None:
                    # This is an explicit MusicXML spacer rest, not an invented gap.
                    pass
                grace = child.find('grace')
                if grace is not None and child.find('duration') is not None:
                    problems.append('UNSUPPORTED_GRACE_DURATION')
                duration = Fraction(0) if grace is not None else Fraction(str(number(child.findtext('duration')))) / Fraction(str(divisions))
                staff = int(child.findtext('staff', '1'))
                voice = child.findtext('voice', str(staff))
                chord = child.find('chord') is not None
                # MusicXML chord attaches to the preceding main note, including
                # cross-staff piano chords. Staff changes never advance time.
                beat = previous if chord and previous is not None else cursor
                if chord and previous is None:
                    problems.append('INVALID_CHORD_START')
                event = {'beat': float(beat), 'duration': float(duration), 'hand': 'right' if staff == 1 else 'left',
                         'staff': staff, 'voice': voice, 'x': number(child.get('default-x'), math.nan),
                         'xmlIndex': xml_index, 'chord': chord}
                if grace is not None:
                    event['grace'] = dict(grace.attrib)
                    event['writtenBeats'] = float(written_beats(child) or 1)
                if staff not in (1, 2) or (duration <= 0 and grace is None):
                    problems.append('INVALID_NOTE_DURATION_OR_STAFF')
                tie_types = {tie.get('type') for tie in child.findall('tie') + child.findall('.//tied')}
                if tie_types - {'start', 'stop', 'continue'}:
                    problems.append('UNSUPPORTED_TIE_STYLE')
                event['tieStart'] = bool(tie_types & {'start', 'continue'})
                event['tieStop'] = bool(tie_types & {'stop', 'continue'})
                if child.find('rest') is not None:
                    event['rest'] = True
                else:
                    pitch = child.find('pitch')
                    if pitch is None or pitch.findtext('step') not in STEPS:
                        problems.append('UNSUPPORTED_UNPITCHED_NOTE')
                        continue
                    step, octave = pitch.findtext('step'), int(pitch.findtext('octave'))
                    alter = number(pitch.findtext('alter'))
                    accidental = child.find('accidental')
                    if grace is not None and accidental is not None and accidental.text in ALTERS and accidental.get('cautionary') != 'yes' and accidental.get('editorial') != 'yes' and alter != ALTERS[accidental.text]:
                        corrections.append(correction('grace-accidental', '倚音音高按明确书写的临时升降号恢复。',
                                                      'MusicXML显式accidental，排除提示性/编辑性变音符号', alter, ALTERS[accidental.text]))
                        alter = ALTERS[accidental.text]
                    midi = 12 * (octave + 1) + SEMITONES[step] + alter
                    if int(midi) != midi or midi < 21 or midi > 108:
                        problems.append('UNSUPPORTED_PIANO_PITCH')
                    event['midi'] = midi
                    sign, line, octave_change = clefs.get(staff, ('G', 2, 0))
                    anchor = {'G': STEPS['G'] + 7 * 4, 'F': STEPS['F'] + 7 * 3, 'C': STEPS['C'] + 7 * 4}.get(sign)
                    if anchor is None:
                        problems.append('UNSUPPORTED_CLEF')
                        anchor = 0
                    middle = anchor + (3 - line) * 2 + octave_change * 7
                    event['writtenStaffPitch'] = middle - (STEPS[step] + octave * 7)
                    # MusicXML pitch is the performed pitch. An octave-shift
                    # changes only its printed position (W3C MusicXML 4.0).
                    event['octaveShifts'] = list(set(value for (shift_staff, _), value in octave_shifts.items() if shift_staff == staff))
                events.append(event)
                previous = beat
                if not chord:
                    cursor += duration
                maximum = max(maximum, beat + duration, cursor)
        nominal = time[0] * 4 / time[1]
        plan, changes, conflict = tuplet_timeline(element, divisions, nominal)
        corrections.extend(changes)
        if conflict:
            problems.append(conflict)
        if plan:
            for event in events:
                item = plan['events'].get(event['xmlIndex'])
                if item:
                    event['beat'], event['duration'] = float(item['beat']), float(item['duration'])
            maximum = plan['maximum']
        grace_changes, grace_problems = place_graces(events)
        corrections.extend(grace_changes); problems.extend(grace_problems)
        implicit = element.get('implicit') == 'yes'
        # Do not pad a short MusicXML measure to its nominal meter. Exporters
        # can omit implicit=yes on complementary repeat/final half-measures.
        # Every actual event (including rests/forward/backups) defines its time;
        # unexplained short/long measures remain visible for manual checking.
        length = float(maximum)
        measures.append({'number': element.get('number'), 'implicit': implicit, 'duration': length,
                         'timeSignature': list(time), 'keySignature': key, 'tempo': tempo,
                         'events': events, 'problems': sorted(set(problems)), 'notices': notices,
                         'corrections': corrections, 'nominal': nominal})
    return measures


def map_document(omr_path, mxl_path, request, log_path=None):
    pages = read_omr(omr_path)
    measures = read_measures(music_xml(mxl_path), request.get('metadata', {}))
    systems = [system for page in pages for system in page['systems']]
    stacks = [stack for system in systems for stack in system['stacks']]
    if len(stacks) != len(measures):
        raise MappingError(f'OMR has {len(stacks)} measure stacks but MusicXML has {len(measures)} measures; alignment is ambiguous.')
    offset = 0
    for system in systems:
        system['measures'] = measures[offset:offset + len(system['stacks'])]
        offset += len(system['stacks'])
    page_by_id = {page['page']: page for page in pages}
    warnings = ['Audiveris 是自动光学识谱；音高、节奏、声部与原图须逐行人工校对，不能声明零错。']
    log = Path(log_path).read_text(errors='replace') if log_path and Path(log_path).exists() else ''
    omr_warnings = [line.strip().split('|')[-1].strip()[:350] for line in log.splitlines() if re.search(r'WARN|ERROR|too long|overlong|excess', line, re.I)]
    warnings.extend('OMR：' + value for value in list(dict.fromkeys(omr_warnings))[:30])
    output, used_systems = [], set()
    for region in request.get('regions', []):
        try:
            page = page_by_id.get(region['page'])
            if page is None:
                raise MappingError('原PDF此页没有成功生成OMR结果。', 'AUDIVERIS_MISSING_PAGE')
            width, height = region.get('pageWidth'), region.get('pageHeight')
            if not width or not height:
                raise MappingError('缺少原始页面像素尺寸，无法准确映射音头。')
            sx, sy = width / page['width'], height / page['height']
            rect = region['rect']
            system = next((system for system in page['systems'] if system['system'] == region['system']), None)
            if system is None:
                raise MappingError('原PDF未检测到对应双手谱行。', 'AUDIVERIS_MISSING_SYSTEM')
            center_y = (system['staffTop'] + system['staffBottom']) / 2 * sy
            if not rect['y'] <= center_y <= rect['y'] + rect['height']:
                raise MappingError('检测的谱行与原图清单位置不一致，需调整谱行框。', 'AUDIVERIS_REGION_MISMATCH')
            used_systems.add((region['page'], system['system']))
            notes, positions, rests, durations, row_warnings, row_problems, row_corrections = [], [], [], [], [], [], []
            tie_flags, head_notes = {}, {}
            row_beat, used_heads = 0.0, {}
            for measure_index, (measure, stack) in enumerate(zip(system['measures'], system['stacks'])):
                durations.append(measure['duration'])
                row_problems.extend(measure['problems'])
                row_warnings.extend(measure['notices'])
                row_corrections.extend(dict(change, measure=measure_index + 1) for change in measure.get('corrections', []))
                if measure['problems']:
                    raise MappingError('此谱行含尚不能完整保留的记谱：' + ', '.join(measure['problems']), 'AUDIVERIS_UNSUPPORTED_NOTATION')
                if measure['duration'] > measure['nominal'] + 1e-5:
                    row_warnings.append(f'第{measure_index + 1}小节识别声部超过拍号时值（{measure["duration"]}拍）；需校正，未截断音符。')
                if measure['timeSignature'] != system['measures'][0]['timeSignature']:
                    row_problems.append('UNSUPPORTED_METER_CHANGE')
                if measure['keySignature'] != system['measures'][0]['keySignature']:
                    row_warnings.append('本谱行中途调号改变，播放音高已按逐音pitch保留；重新排版需核对调号。')
                for event_index, event in enumerate(measure['events']):
                    basic = {'beat': row_beat + event['beat'], 'duration': event['duration'], 'hand': event['hand'], 'voice': event['voice']}
                    if event.get('rest'):
                        rests.append(basic)
                        continue
                    if not math.isfinite(event['x']):
                        raise MappingError('MusicXML音符缺少可映射的default-x坐标。', 'AUDIVERIS_MISSING_HEAD')
                    expected_x = stack['left'] + event['x'] * system['interline'] / 10
                    allowed_pitches = [event['writtenStaffPitch']] + [event['writtenStaffPitch'] - shift for shift in event.get('octaveShifts', [])]
                    candidates = [head for head in system['heads'] if head['staff'] == event['staff'] and (head['id'] not in used_heads or abs(used_heads[head['id']] - basic['beat']) < 1e-5) and stack['left'] - system['interline'] <= head['x'] <= stack['right'] + system['interline']]
                    pitch_distance = lambda head: min(abs(head['pitch'] - pitch) for pitch in allowed_pitches)
                    candidates.sort(key=lambda head: abs(head['x'] - expected_x) / system['interline'] + pitch_distance(head) * 3 + (0.05 if head['id'] in used_heads else 0))
                    head = candidates[0] if candidates else None
                    if head is None or abs(head['x'] - expected_x) > system['interline'] * 1.5 or pitch_distance(head) > 0.1:
                        raise MappingError(f'第{measure_index + 1}小节声部{event["voice"]}音符无法唯一对应原图音头（staff={event["staff"]}, x≈{expected_x:.1f}, pitch={event["writtenStaffPitch"]}）；未生成猜测坐标。', 'AUDIVERIS_MISSING_HEAD')
                    if event.get('octaveShifts'):
                        row_warnings.append('OMR导出含八度线；演奏音高采用MusicXML pitch，原谱坐标按实际音头定位，须校对八度线起止。')
                    if head['id'] in used_heads:
                        row_warnings.append('多个导出音符对应同一原谱音头，可能涉及同音声部或OMR重复识别，须逐音校对。')
                    used_heads[head['id']] = basic['beat']
                    identity = f'm{measure_index + 1}-n{event_index + 1}'
                    x, y = (head['x'] + head['width'] / 2) * sx, (head['y'] + head['height'] / 2) * sy
                    if not (rect['x'] - 1e-5 <= x <= rect['x'] + rect['width'] + 1e-5 and rect['y'] - 1e-5 <= y <= rect['y'] + rect['height'] + 1e-5):
                        ink = system['musicInk'] or system['heads']
                        left = max(0, math.floor(min(item['x'] for item in ink) * sx - 2))
                        top = max(0, math.floor(min(item['y'] for item in ink) * sy - 2))
                        right = min(width, math.ceil(max(item['x'] + item['width'] for item in ink) * sx + 2))
                        bottom = min(height, math.ceil(max(item['y'] + item['height'] for item in ink) * sy + 2))
                        required = {'x': left, 'y': top, 'width': right - left, 'height': bottom - top}
                        raise MappingError(f'真实音头{identity}位于所选框之外（x={x:.2f},y={y:.2f}）；请扩大原图范围，音乐墨迹建议范围y={top}–{bottom}。', 'AUDIVERIS_HEAD_OUTSIDE_REGION', {'noteId': identity, 'head': {'x': x, 'y': y}, 'requiredRect': required, 'page': region['page'], 'system': region['system']})
                    notes.append(dict(basic, id=identity, midi=int(event['midi']), velocity=0.75 if event['hand'] == 'right' else 0.55))
                    positions.append({'noteId': identity, 'x': x, 'y': y, 'coordinateSpace': 'page'})
                    tie_flags[identity] = (event.get('tieStart', False), event.get('tieStop', False))
                    head_notes.setdefault(head['id'], []).append(identity)
                    if head['grade'] < 0.65:
                        row_warnings.append('部分音头识别置信度较低，需对照原谱校对。')
                row_beat += measure['duration']
            if row_problems:
                raise MappingError('此谱行含尚不能完整保留的记谱：' + ', '.join(sorted(set(row_problems))), 'AUDIVERIS_UNSUPPORTED_NOTATION')
            if not notes and not rests:
                raise MappingError('谱行未识别到可定位音符；不能冒充整行完成。', 'AUDIVERIS_EMPTY_REGION')
            by_id = {note['id']: note for note in notes}
            for tie in system.get('ties', []):
                left = head_notes.get(tie['endpoints'].get('LEFT'), [])
                right = head_notes.get(tie['endpoints'].get('RIGHT'), [])
                if len(left) == len(right) == 1:
                    a, b = by_id[left[0]], by_id[right[0]]
                    if a['midi'] == b['midi'] and a['hand'] == b['hand'] and abs(a['beat'] + a['duration'] - b['beat']) < 1e-5:
                        if not tie_flags[a['id']][0] or not tie_flags[b['id']][1]:
                            row_corrections.append(correction('tie-source', '按原图已识别为延音的曲线补回导出缺失的延音标志。',
                                                              'OMR tie=true且两个端点唯一映射，同音相接；普通乐句线不作延音',
                                                              str([tie_flags[a['id']], tie_flags[b['id']]]), '起点→终点', noteIds=[a['id'], b['id']]))
                        tie_flags[a['id']] = (True, tie_flags[a['id']][1])
                        tie_flags[b['id']] = (tie_flags[b['id']][0], True)
            try:
                internal_ties, continuity, tie_changes, unresolved_ties = resolve_ties(notes, tie_flags, row_beat)
                row_corrections.extend(tie_changes)
            except RefinementError as error:
                raise MappingError(str(error), error.code)
            first = system['measures'][0]
            score = {'version': 1, 'id': 'audiveris-' + region['id'],
                     'title': request.get('metadata', {}).get('title', '导入钢琴谱'),
                     'composer': request.get('metadata', {}).get('composer', '未知'),
                     'tempo': first['tempo'], 'timeSignature': first['timeSignature'], 'keySignature': first['keySignature'],
                     'durationBeats': row_beat, 'notes': notes}
            unmapped = [{'id': head['id'], 'staff': head['staff'], 'pitch': head['pitch'], 'grade': head['grade'],
                         'x': (head['x'] + head['width'] / 2) * sx, 'y': (head['y'] + head['height'] / 2) * sy}
                        for head in system['heads'] if head['id'] not in used_heads]
            if unmapped:
                row_warnings.append(f'{len(unmapped)}个OMR源音头未映射到音符；请逐个检查并补音或确认误检，不能仅按总拍数判断完整。')
            result = {'score': score, 'positions': positions, 'rests': rests,
                      'coverage': {'complete': True, 'measureCount': len(durations), 'measureDurations': durations},
                      'continuity': continuity, 'internalTies': internal_ties, 'engine': 'audiveris',
                      'corrections': row_corrections,
                      'tieAudit': {'unresolved': unresolved_ties, 'reviewed': not unresolved_ties},
                      'sourceHeadAudit': {'detected': len(system['heads']), 'mapped': len(used_heads), 'unmapped': unmapped, 'reviewed': not unmapped},
                      'warnings': list(dict.fromkeys(row_warnings + warnings[:1]))}
            output.append({'id': region['id'], 'result': result})
        except MappingError as error:
            output.append({'id': region['id'], 'error': {'code': error.code, 'message': str(error), **({'details': error.details} if error.details else {})}})
    excluded_pages = {item if isinstance(item, int) else item.get('page') for item in request.get('excludedPages', [])}
    missing = [{'page': system['page'], 'system': system['system']} for system in systems if system['page'] not in excluded_pages and (system['page'], system['system']) not in used_systems]
    requested_pages = {region['page'] for region in request.get('regions', [])}
    unrequested_pages = [page['page'] for page in pages if page['page'] not in requested_pages and page['page'] not in excluded_pages]
    missing_input_pages = [page for page in range(1, request.get('totalPages', max(page_by_id)) + 1) if page not in excluded_pages and page not in page_by_id]
    complete = bool(output) and not missing and not unrequested_pages and not missing_input_pages and all('result' in item for item in output)
    errors = []
    if missing or unrequested_pages or missing_input_pages:
        warnings.append('输入清单未覆盖OMR识别的所有谱页/谱行；不能声称整份PDF已识别完成。')
        errors.append({'code': 'AUDIVERIS_SCOPE_MISMATCH', 'message': 'OMR谱页/谱行与输入清单不完整对应；需校正页面和谱行范围。'})
    return {'engine': 'audiveris', 'regions': output, 'warnings': warnings,
            'checks': {'complete': complete, 'scopeComplete': not missing and not unrequested_pages and not missing_input_pages, 'requiresReview': True, 'pageCount': len(pages),
                       'systemCount': len(systems), 'measureCount': len(measures),
                       'missingSystems': missing, 'unrequestedPages': unrequested_pages,
                       'missingInputPages': missing_input_pages, 'errors': errors,
                       'omrWarningCount': len(omr_warnings)}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--omr', required=True)
    parser.add_argument('--mxl', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--log')
    args = parser.parse_args()
    try:
        result = map_document(args.omr, args.mxl, json.loads(Path(args.input).read_text()), args.log)
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, allow_nan=False))
    except Exception as error:
        Path(args.output).write_text(json.dumps({'error': {'code': getattr(error, 'code', 'AUDIVERIS_PARSE'), 'message': str(error)[:500]}}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
