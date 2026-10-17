from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pathlib import Path
import json,hashlib
root=Path('.local/omr-benchmark-20261017');manifest=json.loads((root/'manifest-draft.json').read_text())
for item in manifest:
 folder=root/item['id'];target=folder/'input.pdf';c=canvas.Canvas(str(target),pagesize=(595.28,841.89),invariant=1)
 for page in item['pages']:c.drawImage(ImageReader(folder/page['path']),0,0,width=595.28,height=841.89);c.showPage()
 c.save();item['inputPdfSha256']=hashlib.sha256(target.read_bytes()).hexdigest();item['referenceSha256']=hashlib.sha256((folder/'reference.json').read_bytes()).hexdigest()
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('PDFs:',len(manifest),'pages:',sum(len(x['pages']) for x in manifest))
