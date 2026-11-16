import re,glob,os,subprocess,sys
from fontTools import subset
from fontTools.ttLib import TTFont, TTCollection
import os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
txt=''
for f in ['index.html','js/main.js','js/engrave.js']:
    txt+=open(root+f,encoding='utf8').read()
chars=set(txt)
chars|=set(chr(c) for c in range(0x20,0x7f))
chars|=set('，。、；：？！“”‘’（）【】《》—–…·「」『』×÷→←↑↓↗♩♪♫♭♯♮°～＋－＝％＆')
# GB2312 level 1 for edit-safety (regular only)
gb=set()
for hi in range(0xB0,0xD8):
    for lo in range(0xA1,0xFF):
        try: gb.add(bytes([hi,lo]).decode('gb2312'))
        except: pass
used=''.join(sorted(c for c in chars if ord(c)>=0x20))
def sub(src,out,text,fontnum=None,flavor='woff2',unicodes=None):
    opts=subset.Options(); opts.flavor=flavor; opts.layout_features=['*']; opts.notdef_outline=True; opts.name_IDs=['*']; opts.drop_tables+=['DSIG']
    if fontnum is not None: opts.font_number=fontnum
    font=subset.load_font(src,opts)
    s=subset.Subsetter(opts)
    if unicodes is not None: s.populate(unicodes=unicodes)
    else: s.populate(text=text)
    s.subset(font); subset.save_font(font,out,opts)
    print(os.path.basename(out),os.path.getsize(out)//1024,'KB')
os.makedirs(root+'fonts',exist_ok=True)
sub('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',root+'fonts/NotoSerifSC-400.woff2',used,fontnum=2)
sub('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',root+'fonts/NotoSerifSC-700.woff2',used,fontnum=2)
latin=list(range(0x20,0x7f))+list(range(0xa0,0x100))+[0x2013,0x2014,0x2018,0x2019,0x201c,0x201d,0x2026,0x2022,0x266f]
g='/usr/share/fonts/truetype/sand-box/google/'
sub(g+'Cormorant Garamond/CormorantGaramond-VariableFont_wght.ttf',root+'fonts/Cormorant-roman.woff2',None,unicodes=latin)
sub(g+'Cormorant Garamond/CormorantGaramond-Italic-VariableFont_wght.ttf',root+'fonts/Cormorant-italic.woff2',None,unicodes=latin)
sub(g+'Jost/Jost-VariableFont_wght.ttf',root+'fonts/Jost.woff2',None,unicodes=latin)
