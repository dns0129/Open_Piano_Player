import unittest,tempfile
from pathlib import Path
from reference import read_score
class Timing(unittest.TestCase):
 def test_pickup_without_implicit_uses_written_duration_and_overfull_is_not_silently_truncated(self):
  xml='<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff></note></measure><measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff></note></measure></part></score-partwise>'
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'x.xml';p.write_text(xml);r=read_score(p)
  self.assertEqual([m['duration'] for m in r['measures']],[1,4]);self.assertEqual(r['notes'][1]['beat'],1);self.assertEqual(r['issues'][0]['issue'],'OVERFULL')
if __name__=='__main__':unittest.main()
