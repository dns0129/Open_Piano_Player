#!/usr/bin/env python3
"""Trace this edition's original vector music font/paths; never reconstruct from another score.

Run: evidence/full-score/.venv/bin/python scripts/yeung-pdf-extract.py
Requires PyMuPDF. Coordinates are PDF points, top-left origin. Unresolved evidence is explicit.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
NOTE = 0xF074
CLEFS = {0xF080: "treble", 0xF081: "bass"}
RESTS = {0xF061: 2, 0xF063: 1, 0xF064: .5, 0xF065: .25}
ACCIDENTALS = {0xF021: 1, 0xF022: -1, 0xF023: 0}
FLAGS = {0xF049, 0xF059}
NATURAL = [0, 2, 4, 5, 7, 9, 11]
LETTERS = "CDEFGAB"


def rnd(n):
    return round(float(n), 6)


def extract_page(page, page_number):
    glyphs = []
    for span in page.get_texttrace():
        if "Aloisen" not in span["font"]:
            continue
        for code, gid, origin, bbox in span["chars"]:
            glyphs.append(dict(code=code, glyph=f"U+{code:04X}", glyphId=gid, x=rnd(origin[0]), y=rnd(origin[1]), bbox=list(map(rnd, bbox)), seq=span["seqno"], font=span["font"], fontSize=rnd(span["size"])))
    drawings = page.get_drawings()
    lines, rectangles = [], []
    for drawing in drawings:
        for item in drawing["items"]:
            if item[0] == "l":
                a, b = item[1:3]
                x1, y1, x2, y2 = a.x, a.y, b.x, b.y
                if x2 < x1 or (abs(x2-x1) < .001 and y2 < y1):
                    x1,y1,x2,y2=x2,y2,x1,y1
                lines.append(dict(x1=rnd(x1), y1=rnd(y1), x2=rnd(x2), y2=rnd(y2), width=rnd(drawing.get("width") or 0), seq=drawing["seqno"]))
            elif item[0] == "re":
                rectangles.append(dict(rect=list(map(rnd,item[1])),type=drawing["type"],seq=drawing["seqno"]))
    staff_lines = [line for line in lines if abs(line["y2"]-line["y1"]) < .01 and line["x2"]-line["x1"] > 100 and line["width"] < .6]
    staff_lines.sort(key=lambda line: line["y1"])
    if len(staff_lines)%10:
        raise ValueError(f"Page {page_number}: expected 10 staff lines per grand staff, got {len(staff_lines)}")
    staffs=[]
    for i in range(0,len(staff_lines),5):
        chunk=staff_lines[i:i+5]; ys=[line["y1"] for line in chunk]
        spacing=(ys[-1]-ys[0])/4
        if max(abs(y-ys[0]-j*spacing)for j,y in enumerate(ys))>.03:
            raise ValueError(f"Page {page_number}: nonuniform source staff")
        staffs.append(dict(lines=ys, spacing=spacing, x1=chunk[0]["x1"],x2=chunk[0]["x2"],center=sum(ys)/5))
    braces=sorted([g for g in glyphs if g["code"]==0xF03E],key=lambda g:g["seq"])
    if len(braces)*2 !=len(staffs):
        raise ValueError("Brace/staff count disagreement")
    systems=[]
    for i,brace in enumerate(braces):
        upper,lower=staffs[i*2:i*2+2]
        system=dict(page=page_number,system=i+1,staffs=[upper,lower],seq=brace["seq"],endSeq=braces[i+1]["seq"] if i+1<len(braces)else math.inf)
        system["glyphs"]=[g for g in glyphs if system["seq"] <=g["seq"]<system["endSeq"]]
        top,bottom=upper["lines"][0],lower["lines"][-1]
        bar_x=[]
        for line in lines:
            if abs(line["x2"]-line["x1"])>.02 or line["width"]<.65:
                continue
            for staff in [upper,lower]:
                if abs(line["y1"]-staff["lines"][0])<.02 and abs(line["y2"]-staff["lines"][-1])<.02:
                    bar_x.append(line["x1"])
        for rect in rectangles:
            x0,y0,x1,y1=rect["rect"]
            if x1-x0<4 and ((abs(y0-top)<.02 and abs(y1-upper["lines"][-1])<.02)or(abs(y0-lower["lines"][0])<.02 and abs(y1-bottom)<.02)):
                bar_x.append(x1)
        xs=sorted([upper["x1"],*bar_x,upper["x2"]]); merged=[]
        for x in xs:
            if merged and x-merged[-1]<5:merged[-1]=max(merged[-1],x)
            else:merged.append(x)
        system["barlines"]=merged
        system["bounds"]=[min(upper["x1"],lower["x1"])-15,top-36,max(upper["x2"],lower["x2"])+1,bottom+25]
        systems.append(system)
    # Beam bars in this doPDF source are 9 parallel .72-point strokes, not images.
    beam_candidates=collections.defaultdict(list)
    for line in lines:
        dx=line["x2"]-line["x1"];dy=line["y2"]-line["y1"]
        if dx>5.5 and abs(dy/dx)<.6 and .65<line["width"]<.8:
            beam_candidates[(round(line["x1"],1),round(line["x2"],1),round(dy,1))].append(line)
    beams=[]
    for group in beam_candidates.values():
        group.sort(key=lambda line:line["y1"]); strips=[]
        for line in group:
            if strips and line["y1"]-strips[-1][-1]["y1"]<.65:strips[-1].append(line)
            else:strips.append([line])
        for strip in strips:
            if len(strip)<3:continue
            beams.append(dict(id=len(beams),x1=strip[0]["x1"],x2=strip[0]["x2"],y1=sum(t["y1"]for t in strip)/len(strip),y2=sum(t["y2"]for t in strip)/len(strip),strokeCount=len(strip)))
    stems=[dict(line,id=i)for i,line in enumerate(lines)if abs(line["x1"]-line["x2"])<.01 and 8<line["y2"]-line["y1"]<85 and 0<line["width"]<.6]
    return dict(number=page_number,width=page.rect.width,height=page.rect.height,glyphs=glyphs,systems=systems,lines=lines,rectangles=rectangles,beams=beams,stems=stems,curveCount=sum(any(item[0]=="c"for item in drawing["items"])for drawing in drawings))


def assign_pitch(head, staff, clef, accidental_state):
    half=staff["spacing"]/2
    steps=(staff["lines"][-1]-head["y"])/half
    rounded=round(steps)
    if abs(steps-rounded)>.03:raise ValueError(f"Note off source staff grid: {head}")
    diatonic=(4*7+2 if clef=="treble"else 2*7+4)+rounded
    octave,index=divmod(diatonic,7); accidental=accidental_state.get(diatonic,0)
    spelling=LETTERS[index]+({-1:'b',0:'',1:'#'}[accidental])+str(octave)
    return dict(writtenPitch=spelling,diatonic=diatonic,accidental=accidental,writtenMidi=12*(octave+1)+NATURAL[index]+accidental,clef=clef)


def extract_score(doc):
    pages=[extract_page(page,i+1)for i,page in enumerate(doc)]
    notes,rests,measures,system_map,issues=[],[],[],[],[]
    global_measure=0
    for page in pages:
        for system in page["systems"]:
            glyphs=system["glyphs"]
            for glyph in glyphs:
                if glyph["code"] in CLEFS:
                    glyph["handIndex"]=min(range(2),key=lambda hand:abs(glyph["y"]-(system["staffs"][hand]["lines"][-2]if glyph["code"]==0xF080 else system["staffs"][hand]["lines"][1])))
                else:glyph["handIndex"]=min(range(2),key=lambda hand:abs(glyph["y"]-system["staffs"][hand]["center"]))
            octave_ranges=[]
            for glyph in glyphs:
                if glyph["code"]!=0xF0B4:continue
                dash_y=glyph["y"]-2.64
                dashes=[line for line in page["lines"]if abs(line["y1"]-dash_y)<.03 and abs(line["y2"]-dash_y)<.03 and 4.8<line["x2"]-line["x1"]<5.3 and line["x2"]>glyph["x"]]
                octave_ranges.append(dict(startX=glyph["x"],endX=max([line["x2"]for line in dashes],default=system["staffs"][0]["x2"]),shift=12,hand='right',glyph=glyph["glyph"]))
            system_record=dict(page=page["number"],system=system["system"],bounds=system["bounds"],staffs=system["staffs"],barlines=system["barlines"],firstMeasure=global_measure+1,startBeat=global_measure*2,octaveRanges=octave_ranges,pageWidth=page['width'],pageHeight=page['height'])
            system_record['clefChanges']=[dict(x=g['x'],y=g['y'],hand=['right','left'][g['handIndex']],clef=CLEFS[g['code']],glyph=g['glyph'],seq=g['seq'])for g in glyphs if g['code']in CLEFS]
            system_map.append(system_record)
            for bi,(left,right)in enumerate(zip(system["barlines"],system["barlines"][1:])):
                global_measure+=1
                audit=dict(page=page["number"],system=system["system"],measure=global_measure,left=left,right=right,hands=[])
                for hand_index,hand in enumerate(['right','left']):
                    staff=system["staffs"][hand_index]
                    items=[g for g in glyphs if g["handIndex"]==hand_index and left-.01<=g["x"]<right-.01]
                    heads=[dict(g)for g in items if g["code"]==NOTE]
                    for head in heads:
                        candidates=[]
                        for stem in page["stems"]:
                            dx=stem["x1"]-head["x"]
                            if min(abs(dx),abs(dx-6))<.3 and stem["y1"]-1.3<=head["y"]<=stem["y2"]+1.3:
                                endpoint=min(abs(head["y"]-stem["y1"]),abs(head["y"]-stem["y2"]))
                                candidates.append((endpoint,abs(dx),stem))
                        if not candidates:
                            issues.append(dict(kind='unmatched-stem',page=page["number"],measure=global_measure,x=head["x"],y=head["y"]));head['stem']=None;continue
                        candidates.sort(key=lambda c:c[:2]);head['stem']=candidates[0][2]
                    groups={}
                    for head in heads:
                        stem=head['stem'];key=stem['id']if stem else f"missing-{head['seq']}"
                        group=groups.setdefault(key,dict(heads=[],stem=stem,x=head['x'],beams=[],duration=1,kind='note'))
                        group['heads'].append(head);group['x']=min(group['x'],head['x'])
                    for group in groups.values():
                        stem=group['stem']
                        if not stem:continue
                        # A beam touches the end farther from its chord; reject ledger/staff lines.
                        head_ys=[h['y']for h in group['heads']]
                        near_top=min(abs(stem['y1']-y)for y in head_ys)<1.5
                        tip=stem['y2']if near_top else stem['y1'];group['direction']='down'if near_top else'up'
                        for beam in page['beams']:
                            if beam['x1']-.5<=stem['x1']<=beam['x2']+.5:
                                y=beam['y1']+(stem['x1']-beam['x1'])/(beam['x2']-beam['x1'])*(beam['y2']-beam['y1'])
                                if abs(y-tip)<10.5:group['beams'].append(beam['id'])
                        group['duration']=1/(2**len(group['beams']))
                    for flag in [g for g in items if g['code']in FLAGS]:
                        preceding=[h for h in heads if abs(h['x']-flag['x'])<.2 and h['seq']<flag['seq']]
                        if preceding:
                            h=max(preceding,key=lambda h:h['seq']);key=h['stem']['id']if h['stem']else f"missing-{h['seq']}"
                            groups[key]['duration']=.5;groups[key]['flag']=flag['glyph']
                    for dot in [g for g in items if g['code']==0xF0C7]:
                        eligible=[group for group in groups.values()if any(0<dot['x']-h['x']<12 and abs(dot['y']-h['y'])<2.7 for h in group['heads'])]
                        if eligible:eligible[0]['dotted']=True
                    for group in groups.values():
                        if group.get('dotted'):group['duration']*=1.5
                    for rest in [g for g in items if g['code']in RESTS]:groups[f"rest-{rest['seq']}"]=dict(x=rest['x'],duration=RESTS[rest['code']],kind='rest',heads=[],glyph=rest['glyph'],source=rest,beams=[])
                    events=sorted(groups.values(),key=lambda e:(e['x'],e['kind']))
                    tuplets=[g for g in items if g['code']==0xF0F3]
                    for tuplet in tuplets:
                        choices=[]
                        for beam in page['beams']:
                            group=[e for e in events if beam['id']in e['beams']]
                            if len(group)==3 and beam['x1']<=tuplet['x']<=beam['x2']:choices.append(group)
                        if choices:
                            for e in choices[0]:e['duration']*=2/3;e['tuplet']=[3,2]
                        else:issues.append(dict(kind='unmatched-tuplet',page=page['number'],measure=global_measure,hand=hand))
                    total=sum(e['duration']for e in events)
                    main=events
                    if abs(total-2)>.00001:
                        # Independent voices share exact engraved onset columns. Prefer the
                        # shorter value in each column as the complete rhythmic reference.
                        columns=[]
                        for event in events:
                            if columns and abs(columns[-1][0]['x']-event['x'])<.5:columns[-1].append(event)
                            else:columns.append([event])
                        shortest=[min(column,key=lambda event:event['duration'])for column in columns]
                        if abs(sum(e['duration']for e in shortest)-2)<.00001:main=shortest
                        else:
                            beamed=[e for e in events if e['beams']]
                            if abs(sum(e['duration']for e in beamed)-2)<.00001:main=beamed
                    cursor=0
                    for e in main:e['localBeat']=cursor;e['voice']=hand+'-1';cursor+=e['duration']
                    if main is not events:
                        for e in events:
                            if e in main:continue
                            closest=min(main,key=lambda m:abs(e['x']-m['x']))
                            if abs(closest['x']-e['x'])<4:e['localBeat']=closest['localBeat'];e['voice']=hand+'-2'
                            else:issues.append(dict(kind='polyphony-position',page=page['number'],measure=global_measure,hand=hand,x=e['x']));e['localBeat']=None;e['voice']=hand+'-unresolved'
                    if abs(cursor-2)>.00001:issues.append(dict(kind='measure-duration',page=page['number'],measure=global_measure,hand=hand,total=cursor,eventDurations=[e['duration']for e in main]))
                    # Accidentals are scoped by written pitch and measure, and are read left-to-right.
                    accidental_state={}
                    for item in sorted(items,key=lambda g:(g['x'],g['seq'])):
                        if item['code']not in [NOTE,*ACCIDENTALS]:continue
                        clefs=[g for g in glyphs if g['code']in CLEFS and g['handIndex']==hand_index and g['x']<=item['x']]
                        clef=CLEFS[max(clefs,key=lambda g:g['x'])['code']]if clefs else('treble'if hand_index==0 else'bass')
                        pitch=assign_pitch(item,staff,clef,accidental_state)
                        if item['code']in ACCIDENTALS:accidental_state[pitch['diatonic']]=ACCIDENTALS[item['code']];continue
                        head=next(h for h in heads if h['seq']==item['seq'])
                        head.update(pitch)
                    for e in events:
                        beat=(global_measure-1)*2+e['localBeat']if e.get('localBeat')is not None else None
                        if e['kind']=='rest':rests.append(dict(page=page['number'],system=system['system'],measure=global_measure,hand=hand,voice=e.get('voice'),beat=beat,duration=e['duration'],x=e['x'],y=e['source']['y'],glyph=e['glyph']));continue
                        for head in e['heads']:
                            octave_shift=12 if hand=='right'and any(r['startX']-.1<=head['x']<=r['endX']+.1 for r in octave_ranges)else 0
                            note=dict(id=f"pdf-p{page['number']}-g{head['seq']}",page=page['number'],system=system['system'],measure=global_measure,x=head['x'],y=head['y'],glyph=head['glyph'],glyphId=head['glyphId'],seq=head['seq'],hand=hand,voice=e.get('voice'),beat=rnd(beat)if beat is not None else None,duration=rnd(e['duration']),writtenPitch=head['writtenPitch'],writtenMidi=head['writtenMidi'],midi=head['writtenMidi']+octave_shift,octaveShift=octave_shift,clef=head['clef'],accidental=head['accidental'],beamCount=len(e['beams']),stemSeq=e['stem']['seq']if e.get('stem')else None,stemDirection=e.get('direction'),tuplet=e.get('tuplet'),dotted=e.get('dotted',False))
                            notes.append(note)
                    audit['hands'].append(dict(hand=hand,sourceHeadCount=len(heads),eventCount=len(events),duration=cursor,polyphonic=main is not events,events=[dict(x=e['x'],beat=e.get('localBeat'),duration=e['duration'],kind=e['kind'],beamCount=len(e['beams']),heads=len(e['heads']))for e in events]))
                measures.append(audit)
            system_record.update(lastMeasure=global_measure,endBeat=global_measure*2)
            # Music font boxes use conservative font ascent/descent. Include them
            # and the exact matched stems, so low ledger notes / high rests are
            # not clipped by a fixed staff-only crop. Raw drawing seq alone is
            # unsuitable: the next system's staff lines are painted before its
            # brace, hence may occur in the preceding system's seq interval.
            own_notes=[n for n in notes if n['page']==page['number']and n['system']==system['system']]
            stem_seqs={n['stemSeq']for n in own_notes}
            own_stems=[s for s in page['stems']if s['seq']in stem_seqs]
            x0,y0,x1,y1=system_record['bounds']
            system_record['bounds']=[rnd(max(0,min([x0,*[g['bbox'][0]-2 for g in glyphs]]))),rnd(max(0,min([y0,*[g['bbox'][1]-2 for g in glyphs],*[s['y1']-2 for s in own_stems]]))),rnd(min(page['width'],max([x1,*[g['bbox'][2]+2 for g in glyphs]]))),rnd(min(page['height'],max([y1,*[g['bbox'][3]+2 for g in glyphs],*[s['y2']+2 for s in own_stems]])))]
    handled={NOTE,*CLEFS,*RESTS,*ACCIDENTALS,*FLAGS,0xF03E,0xF03F,0xF032,0xF034,0xF043,0xF0F3,0xF0B4,0xF0C7}
    unknown=sorted({g['glyph']for p in pages for g in p['glyphs']if g['code']not in handled})
    if unknown:issues.append(dict(kind='unhandled-music-glyphs',glyphs=unknown))
    if len({n['id']for n in notes})!=len(notes):issues.append(dict(kind='duplicate-source-head-id'))
    for system in system_map:
        x0,y0,x1,y1=system['bounds']
        for note in notes:
            if(note['page'],note['system'])==(system['page'],system['system'])and not(x0<=note['x']<=x1 and y0<=note['y']<=y1):issues.append(dict(kind='source-head-outside-system',id=note['id']))
    return dict(version=1,sourcePdf='evidence/international-imslp-yeung.pdf',title='Flight of the Bumblebee — Kevin W. K. Yeung piano solo edition',composer='Nikolai Rimsky-Korsakov',arranger='Kevin W. K. Yeung',tempo=185,timeSignature=[2,4],keySignature=0,pageCount=len(pages),measureCount=global_measure,durationBeats=global_measure*2,sourceGlyphHeadCount=sum(g['code']==NOTE for p in pages for g in p['glyphs']),sourceImageCount=sum(len(p.get_images())for p in doc),notes=notes,rests=rests,systems=system_map,measures=measures,issues=issues,tieCurveCount=sum(p['curveCount']for p in pages),unhandledMusicGlyphs=unknown,glyphCounts=dict(collections.Counter(g['glyph']for p in pages for g in p['glyphs'])),method='Original embedded AloisenNew glyph origins + staff/bar/stem/beam PDF paths; no AI and no alternate-edition MIDI')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pdf',default=str(ROOT/'evidence/international-imslp-yeung.pdf'));parser.add_argument('--out',default=str(ROOT/'evidence/full-score/vector-events.json'));args=parser.parse_args()
    path=Path(args.pdf);doc=pymupdf.open(path);result=extract_score(doc);result['sourceSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    output=Path(args.out);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(pages=result['pageCount'],systems=len(result['systems']),measures=result['measureCount'],sourceHeads=result['sourceGlyphHeadCount'],extractedNotes=len(result['notes']),issues=len(result['issues']),issueKinds=dict(collections.Counter(x['kind']for x in result['issues']))),ensure_ascii=False))
    if result['issues']:raise SystemExit(2)


if __name__=='__main__':main()
