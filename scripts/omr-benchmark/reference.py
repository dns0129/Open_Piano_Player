"""Independent symbolic reference reader. Never imports the App OMR parser.
Written order, no repeat expansion; timing in exact quarter-note fractions.
Grace heads are scored separately because their realization is interpretive.
"""
import json,sys,zipfile,hashlib
from fractions import Fraction as F
from pathlib import Path
import xml.etree.ElementTree as ET

def load_xml(path):
 if zipfile.is_zipfile(path):
  with zipfile.ZipFile(path) as z:
   c=ET.fromstring(z.read('META-INF/container.xml'));rf=next(n for n in c.iter() if n.tag.split('}')[-1]=='rootfile');raw=z.read(rf.get('full-path'))
 else:raw=Path(path).read_bytes()
 root=ET.fromstring(raw)
 for e in root.iter():e.tag=e.tag.split('}')[-1]
 return root,raw

def read_score(path, include_written=False):
 root,raw=load_xml(path);parts=root.findall('part');allparts=[];issues=[]
 if not parts:raise ValueError('No score parts')
 if len(parts)>2:raise ValueError('Not solo piano')
 for pi,part in enumerate(parts):
  div=F(1);meter=[4,4];key=0;offset=F(0);notes=[];bars=[]
  for ix,m in enumerate(part.findall('measure'),1):
   cursor=F(0);previous=F(0);maximum=F(0);events=[]
   for e in m:
    if e.tag=='attributes':
     if e.find('divisions') is not None:div=F(e.findtext('divisions'))
     if e.find('time/beats') is not None:
      try:meter=[int(e.findtext('time/beats')),int(e.findtext('time/beat-type'))]
      except:raise ValueError('Unsupported meter')
     if e.find('key/fifths') is not None:key=int(e.findtext('key/fifths'))
    elif e.tag in ['backup','forward']:
     cursor+=F(e.findtext('duration','0'))/div*(-1 if e.tag=='backup' else 1);maximum=max(maximum,cursor)
    elif e.tag=='note':
     grace=e.find('grace') is not None;duration=F(e.findtext('duration','0'))/div;chord=e.find('chord') is not None;beat=previous if chord else cursor
     if not chord:previous=beat
     if not grace and not chord:cursor+=duration
     maximum=max(maximum,beat+duration,cursor)
     if e.find('rest') is not None:continue
     p=e.find('pitch')
     if p is None:raise ValueError('Unpitched note')
     step=p.findtext('step');midi=12*(int(p.findtext('octave'))+1)+dict(C=0,D=2,E=4,F=5,G=7,A=9,B=11)[step]+int(p.findtext('alter','0'))
     staff=int(e.findtext('staff','1'));hand=('right' if pi==0 else 'left') if len(parts)==2 else ('right' if staff==1 else 'left')
     ties={n.get('type') for n in e.findall('tie')}|{n.get('type') for n in e.findall('notations/tied')}
     record=dict(id=f'p{pi}-m{ix}-n{len(events)}',measure=ix,localBeat=float(beat),beat=float(offset+beat),duration=float(duration),midi=midi,hand=hand,voice=e.findtext('voice','1'),grace=grace,tieStart='start' in ties,tieStop='stop' in ties)
     if include_written:record['written']=dict(step=step,octave=int(p.findtext('octave')),alter=int(p.findtext('alter','0')))
     events.append(record)
   nominal=F(meter[0]*4,meter[1]);actual=maximum if maximum>0 else nominal
   if maximum>nominal:issues.append({'measure':ix,'issue':'OVERFULL','expected':float(nominal),'actual':float(maximum)})
   bars.append(dict(measure=ix,beat=float(offset),duration=float(actual),timeSignature=list(meter),keySignature=key));offset+=actual;notes+=events
  allparts.append(dict(notes=notes,bars=bars,durationBeats=float(offset)))
 bars=allparts[0]['bars']
 if any(p['bars']!=bars for p in allparts[1:]):raise ValueError('Part measure maps differ')
 result=dict(title=root.findtext('work/work-title') or root.findtext('movement-title') or '',composer='; '.join(n.text or '' for n in root.findall("identification/creator[@type='composer']")),notes=[n for p in allparts for n in p['notes']],measures=bars,durationBeats=allparts[0]['durationBeats'],issues=issues,sourceSha256=hashlib.sha256(Path(path).read_bytes()).hexdigest())
 if include_written:result['sourceOctaveShiftMeasures']=sorted({i for p in parts for i,m in enumerate(p.findall('measure'),1) if m.findall('.//octave-shift') or m.findall('.//clef-octave-change')})
 return result

if __name__=='__main__':
 p=Path(sys.argv[1]);out=Path(sys.argv[2]);r=read_score(p,include_written='--written' in sys.argv[3:]);out.write_text(json.dumps(r,ensure_ascii=False,indent=2));print(json.dumps({'file':str(p),'bars':len(r['measures']),'notes':len(r['notes']),'graces':sum(n['grace'] for n in r['notes']),'issues':r['issues'][:5]},ensure_ascii=False))
