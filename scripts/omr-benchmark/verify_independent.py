"""Second implementation of event scoring, independent of the JS matcher."""
import json,math
from collections import Counter
from pathlib import Path
R=Path('.local/omr-benchmark-20261017');D=Path('evidence/omr-vs-sol-high-20261017')
EPS=1e-4
def quant(x):return math.floor(x/EPS+.5)
def event_key(n,local=False):return ((n['measure'],) if local else ())+ (n['hand'],n['midi'],quant(n['localBeat']if local else n['beat']),quant(n['duration']))
def played(score):
 notes=[dict(n)for n in score['notes']if not n.get('grace')];order=sorted(notes,key=lambda n:(n['beat'],n['midi'],n['id']));edges=[];used=set()
 for n in order:
  if not n.get('tieStop'):continue
  candidates=[p for p in order if p.get('tieStart')and p['id']not in used and p['midi']==n['midi']and p['hand']==n['hand']and abs(p['beat']+p['duration']-n['beat'])<=EPS]
  same=[p for p in candidates if p.get('voice')==n.get('voice')]
  if same:candidates=same
  if len(candidates)==1:edges.append((candidates[0]['id'],n['id']));used.add(candidates[0]['id'])
 parent={n['id']:n['id']for n in notes};lookup={n['id']:n for n in notes}
 def root(i):
  while parent[i]!=i:i=parent[i]
  return i
 for a,b in edges:parent[root(b)]=root(a)
 grouped={}
 for n in notes:
  rid=root(n['id'])
  if rid not in grouped:grouped[rid]={**lookup[rid],'duration':0}
  grouped[rid]['duration']+=n['duration']
 return list(grouped.values()),edges

def ai_score(raw):
 lengths=[float(x)for x in raw['measureDurations']];starts=[];b=0
 for d in lengths:starts.append(b);b+=d
 def number(n):
  if isinstance(n,str)and'/'in n:
   a,b=n.split('/');return float(a)/float(b)
  return float(n)
 notes=[]
 for i,a in enumerate(raw['notes']):
  m,b,d,p,h,t,g=a;m=int(m);b=number(b);d=number(d);t=int(t);notes.append({'id':'ai-'+str(i),'measure':m,'localBeat':b,'beat':starts[m-1]+b,'duration':d,'midi':int(p),'hand':'right'if h=='R'else'left','voice':'unknown','grace':bool(g),'tieStart':t in[1,3],'tieStop':t in[2,3]})
 return{'notes':notes}

def compare(ref,act,local):
 a=Counter(event_key(n,local)for n in ref);b=Counter(event_key(n,local)for n in act);tp=sum((a&b).values());return{'tp':tp,'fp':sum(b.values())-tp,'fn':sum(a.values())-tp}

data=json.loads((D/'results.json').read_text());checks=[]
for row in data['rows']:
 folder=R/row['id'];reference=json.loads((folder/'reference.json').read_text());ref,refedges=played(reference)
 assert len(ref)==row['referencePerformed']
 for engine,file in [('omr','omr/transcription.json'),('ai','ai-high/raw.json')]:
  p=folder/file
  if p.exists():
   raw=json.loads(p.read_text());actual=ai_score(raw)if engine=='ai'else raw
  else:actual={'notes':[]}
  actual,edges=played(actual)
  for name,local in [('strict',False),('barAligned',True)]:
   c=compare(ref,actual,local);expected={k:row[engine]['metrics'][name][k]for k in c};assert c==expected,(row['id'],engine,name,c,expected)
   checks.append({'id':row['id'],'engine':engine,'metric':name,**c})
(D/'independent-score-verification.json').write_text(json.dumps({'passed':True,'checks':checks,'method':'Independent Python graph-based tie union and Counter intersection; compares against JS streaming tie matcher and hash multiset'},indent=2));print('Independent verification passed:',len(checks),'metric comparisons')
