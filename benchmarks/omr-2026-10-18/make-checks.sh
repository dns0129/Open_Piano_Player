#!/usr/bin/env bash
# 阶段 2 自动检查：为第 N 页生成复核者的疑点清单 runs/optimized/checks/page-N.txt
#   1) bars-to-score：本页每个声部是否填满小节
#   2) omr-assist audit：检测到却未出现在识读结果中的音头（只列本页小节）
# 用法：bash benchmarks/omr-2026-10-18/make-checks.sh N
set -u
cd "$(dirname "$0")/../.."
B=benchmarks/omr-2026-10-18
O=$B/runs/optimized
P=$1
OUT=$O/checks/page-$P.txt
TMP=$(mktemp -d)
{
  echo "# 第 $P 页自动检查（只是提示，复核者仍须逐小节对照原图）"
  echo
  echo "## 小节时值检查（bars-to-score）"
  node scripts/bars-to-score.mjs "$TMP/page.json" "$O/readers/page-$P.bars" --key -4 --time 3/2 --allow-missing 1 2>&1 || true
  echo
  echo "## 检测到但识读结果中没有对应的音头（omr-assist audit，按音名比较，8va 小节不比较）"
  if [ -f "$TMP/page.json" ]; then
    BARS=$(python3 -I -c "import json,sys;d=json.load(open('$O/work/detect.json'));print(' '.join(str(b['number']) for p in d['pages'] if p['page']==$P for s in p['systems'] for b in s['bars']))")
    python3 -I scripts/omr-assist.py audit "$O/work" "$TMP/page.json" 2>&1 | python3 -I -c "
import re,sys
bars=set('$BARS'.split())
for line in sys.stdin:
    m=re.search(r'第(\d+)小节',line)
    if m and m.group(1) in bars: print(line.rstrip())
"
  else
    echo "（时值检查未通过，无法生成乐谱，跳过本项）"
  fi
} > "$OUT"
rm -rf "$TMP"
echo "wrote $OUT"
