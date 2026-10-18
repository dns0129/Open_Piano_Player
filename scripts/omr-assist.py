#!/usr/bin/env python3
"""琴伴识谱辅助：程序先读出谱面上的可见证据，作为识读草稿与核对依据。

检测结果只是辅助证据，不能直接决定最终音符：每个小节都仍由识读者对照原图逐音核对，
再由独立复核者对照原图检查（不只看检测器标出的疑点，高置信度的检测错误同样可能存在）。
适用于软件排版的钢琴大谱表图片（每行一对高音/低音谱表）。依赖 numpy、scipy、Pillow。

  python3 scripts/omr-assist.py detect  page1.png page2.png ... --key 4 --time 12/8 --out work/
      检测谱表、小节线、谱号、实心/空心音头、附点、符干符尾（时值推测）、
      临时记号（升/降/还原）与 8va 虚线，写出 work/detect.json。
  python3 scripts/omr-assist.py repeats work/
      找出重复小节候选（谱号起止、8va、音名与临时记号作用域、空心/附点/符尾、像素相似度都相同），
      写出 work/repeats.json；延音线、休止符和跨页上下文检测不到，候选必须由识读者对照原图确认。
  python3 scripts/omr-assist.py tasks work/ [--scale 2]
      每行谱生成一个互不依赖的识读任务：放大裁图 + 全部小节的预填草稿（bars 文本格式）+ 疑点与重复候选。
  python3 scripts/omr-assist.py audit work/ score.json
      把完成的乐谱与检测结果逐小节比对，列出检测到却未出现在乐谱中的音头，供复核者对照原图。
  python3 scripts/omr-assist.py selftest
      用合成谱面自检（不依赖任何受版权保护的谱面）。

识读结果用 scripts/bars-to-score.mjs 合并成乐谱，每个声部都必须恰好填满小节。
"""
import argparse
import json
import math
import os
import sys
from fractions import Fraction

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

TREBLE_BOTTOM = ('E', 4)   # 高音谱号最下线
BASS_BOTTOM = ('G', 2)     # 低音谱号最下线
LETTERS = 'CDEFGAB'
SHARP_ORDER = 'FCGDAEB'
SEMITONE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


# ---------- 基础几何 ----------

def load_gray(path):
    return np.asarray(Image.open(path).convert('L'), dtype=np.float32)


def runs(mask_1d):
    """连续 True 片段 [(start, stop)]。"""
    padded = np.concatenate([[False], mask_1d, [False]])
    diff = np.diff(padded.astype(np.int8))
    return list(zip(np.where(diff == 1)[0], np.where(diff == -1)[0]))


def find_staves(dark):
    h, w = dark.shape
    longest = np.zeros(h)
    for y in range(h):
        r = runs(dark[y])
        longest[y] = max((b - a for a, b in r), default=0)
    rows = np.where(longest >= 0.45 * w)[0]
    lines = []
    for y in rows:
        if lines and y - lines[-1][-1] <= 1:
            lines[-1].append(y)
        else:
            lines.append([y])
    centers = [float(np.mean(g)) for g in lines]
    staves, i = [], 0
    while i + 4 < len(centers):
        group = centers[i:i + 5]
        gaps = np.diff(group)
        if gaps.max() - gaps.min() <= max(1.5, 0.2 * gaps.mean()):
            staves.append(group)
            i += 5
        else:
            i += 1
    if not staves:
        raise SystemExit('没有找到五线谱。')
    spacing = float(np.median([np.mean(np.diff(s)) for s in staves]))
    return staves, spacing


def staff_x_range(dark, staff):
    y = int(round(staff[0]))
    r = max(runs(dark[y]), key=lambda ab: ab[1] - ab[0])
    return int(r[0]), int(r[1])


def find_barlines(dark, top, bottom, x0, x1, sp):
    """贯穿上下两个谱表的竖线（含粗终止线）。"""
    seg = dark[int(round(top)):int(round(bottom)) + 1, x0:x1 + 1]
    full = seg.mean(axis=0) >= 0.97
    xs = []
    for a, b in runs(full):
        if b - a <= 0.9 * sp:
            xs.append((x0 + a, x0 + b - 1))
    return xs


def bars_from_lines(lines, x0, x1, sp):
    edges = [x0] + [l[1] for l in lines] + [x1]
    edges = sorted(set(edges))
    bars = []
    for a, b in zip(edges, edges[1:]):
        if b - a > 3 * sp:
            bars.append([int(a), int(b)])
    return bars


# ---------- 符号检测 ----------

def remove_thin_horizontals(dark, sp):
    """去掉谱线、加线（上下 r 行都空白的深色像素）。"""
    r = max(1, int(round(sp / 4)))
    up = np.zeros_like(dark)
    dn = np.zeros_like(dark)
    up[r:] = dark[:-r]
    dn[:-r] = dark[r:]
    clean = dark.copy()
    clean[dark & ~up & ~dn] = False
    return clean


def strip_stems(mask):
    """去掉 1 像素宽的竖线（符干），让音头与符杠分开。"""
    out = mask.copy()
    left = np.zeros_like(out)
    right = np.zeros_like(out)
    left[:, 1:] = out[:, :-1]
    right[:, :-1] = out[:, 1:]
    out[out & ~left & ~right] = False
    return out


def filled_heads(dark, sp):
    clean = remove_thin_horizontals(dark, sp)
    k = (max(2, int(round(0.6 * sp))), max(2, int(round(0.75 * sp))))
    mask = ndimage.binary_opening(clean, structure=np.ones(k))
    # 斜的双符杠在谱表内也可能留下音头大小的墨块；去掉符干后符杠仍是一长条，借此排除
    body_lab, _ = ndimage.label(strip_stems(clean))
    body_boxes = ndimage.find_objects(body_lab)
    lab, _ = ndimage.label(mask)
    heads = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if not (0.75 * sp <= w <= 3.2 * sp and 0.6 * sp <= h):
            continue
        part = lab[sl] == i
        # 二度并排的和弦：左右两列分别处理
        halves = [(sl[1].start, part)]
        if w > 1.9 * sp:
            mid = w // 2
            halves = [(sl[1].start, part[:, :mid]), (sl[1].start + mid, part[:, mid:])]
        for x0, p in halves:
            rows = np.where(p.any(axis=1))[0]
            cols = np.where(p.any(axis=0))[0]
            if not len(rows) or len(cols) < 0.6 * sp:
                continue
            top, bot = sl[0].start + rows[0], sl[0].start + rows[-1]
            hh = bot - top + 1
            n = max(1, int(round((hh - 0.85 * sp) / sp)) + 1)
            if hh > 1.35 * sp * n + sp:  # 太高（符干、粗线），不是音头
                continue
            cx = x0 + cols.mean()
            owner = body_lab[int(round((top + bot) / 2)), int(round(cx))]
            if owner and body_boxes[owner - 1][1].stop - body_boxes[owner - 1][1].start > 2.8 * sp:
                continue
            for j in range(n):
                cy = (top + bot) / 2 if n == 1 else top + 0.45 * sp + j * (hh - 0.9 * sp) / (n - 1)
                heads.append({'x': float(cx), 'y': float(cy), 'kind': 'filled'})
    return heads


def hollow_heads(dark, sp):
    """空心音头：墨迹围出的空洞，且填实后去掉谱线、符干仍是一个音头大小的椭圆。
    还原号、琶音波浪线、谱号、数字也有空洞，但填实后的宽度或形状对不上。"""
    # 谱线与小节线也会围出大片“空洞”，只保留音头大小的小空洞；
    # 全音符常与上下两条谱线相切，因此不能先删谱线
    closed = ndimage.binary_closing(dark, structure=np.ones((2, 2)))
    all_holes = ndimage.binary_fill_holes(closed) & ~closed
    hl, _ = ndimage.label(all_holes)
    holes = np.zeros_like(all_holes)
    for i, sl in enumerate(ndimage.find_objects(hl), 1):
        if sl[1].stop - sl[1].start <= 1.3 * sp and sl[0].stop - sl[0].start <= 1.1 * sp:
            holes[sl] |= hl[sl] == i
    # 填实小空洞后去掉谱线和符干，空心音头变成实心椭圆，用来核对外形
    body = strip_stems(remove_thin_horizontals(closed | holes, sp))
    body_lab, _ = ndimage.label(body)
    body_boxes = ndimage.find_objects(body_lab)
    lab, _ = ndimage.label(holes)
    cands = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        ys, xs = np.where(lab[sl] == i)
        if len(ys) < 3:
            continue
        cx, cy = sl[1].start + xs.mean(), sl[0].start + ys.mean()
        owner = body_lab[int(round(cy)), int(round(cx))]
        if not owner:
            continue
        box = body_boxes[owner - 1]
        w = box[1].stop - box[1].start
        h = box[0].stop - box[0].start
        if 1.0 * sp <= w <= 1.9 * sp and 0.6 * sp <= h:
            cands.append([cx, cy, len(ys)])
    # 谱线穿过时一个音头的空洞会被分成两块：先合并，再按空洞总面积筛选（文字、数字的空洞偏小或偏大）
    merged = []
    for cx, cy, area in sorted(cands):
        for m in merged:
            if abs(m[0] - cx) < 0.6 * sp and abs(m[1] - cy) < 0.6 * sp:
                total = m[2] + area
                m[0], m[1], m[2] = (m[0] * m[2] + cx * area) / total, (m[1] * m[2] + cy * area) / total, total
                break
        else:
            merged.append([cx, cy, area])
    return [{'x': float(x), 'y': float(y), 'kind': 'hollow'} for x, y, area in merged if 0.18 * sp * sp <= area <= 0.7 * sp * sp]


def dots(dark, sp):
    lab, _ = ndimage.label(dark)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if 0.25 * sp <= h <= 0.7 * sp and 0.25 * sp <= w <= 0.7 * sp:
            fill = (lab[sl] == i).mean()
            if fill >= 0.6:
                out.append(((sl[1].start + sl[1].stop) / 2, (sl[0].start + sl[0].stop) / 2))
    return out


def stem_and_beams(dark, head, sp, column_ys=None):
    """找音头的符干，数符干末端的符杠/符尾数量（只数和弦最外侧音头以外的部分）。返回 (有符干, 符尾数)。"""
    h, w = dark.shape
    x, y = head['x'], head['y']
    column_ys = column_ys or [y]
    best = None
    for sx in range(int(math.floor(x - 1.0 * sp)), int(math.ceil(x + 1.0 * sp)) + 1):
            if not 0 <= sx < w or abs(sx - x) < 0.3 * sp:
                continue
            for direction in (-1, 1):
                yy = int(round(y))
                length = 0
                while 0 <= yy < h and dark[yy, sx]:
                    yy += direction
                    length += 1
                if length >= 2.5 * sp and (best is None or length > best[2]):
                    best = (sx, direction, length)
    if best is None:
        return False, 0
    sx, direction, length = best
    end = int(round(y)) + direction * length
    outer = (max(column_ys) if direction > 0 else min(column_ys)) + direction * 0.7 * sp
    count = 0
    for offset in (int(0.6 * sp), -int(0.6 * sp)):
        cx = sx + offset
        if not 0 <= cx < w:
            continue
        lo, hi = sorted((end - direction * int(3.2 * sp), end))
        lo, hi = (max(lo, int(outer)), hi) if direction > 0 else (lo, min(hi, int(outer)))
        if hi <= lo:
            continue
        lo, hi = max(0, lo), min(h, hi + 1)
        column = dark[lo:hi, cx]
        strokes = [b - a for a, b in runs(column) if 0.3 * sp <= b - a <= 0.9 * sp]
        count = max(count, len(strokes))
    return True, min(count, 3)


def accidental_marks(dark, heads, sp):
    """识别音头左侧的临时记号：竖笔画 1 条为降号；2 条且左高右低为还原号；否则为升号。
    结果写入 head['accidental']（sharp/flat/natural），无法确定时只标 accidentalMark。"""
    # 删去谱线后，竖笔画在谱线处断开 1 像素，补上
    clean = ndimage.binary_closing(remove_long_runs(dark, sp), structure=np.ones((3, 1)))
    for hd in heads:
        hd['accidentalMark'] = False
        x0 = int(round(hd['x'] - 2.4 * sp))
        x1 = int(round(hd['x'] - 0.75 * sp))
        y0 = int(round(hd['y'] - 2.0 * sp))
        y1 = int(round(hd['y'] + 2.0 * sp))
        if x0 < 0 or y0 < 0 or y1 > dark.shape[0]:
            continue
        win = clean[y0:y1, x0:x1]
        strokes = []
        for c in range(win.shape[1]):
            for a, b in runs(win[:, c]):
                # 临时记号的竖笔画完整落在窗口内；穿出窗口的是相邻音符的符干
                if 1.5 * sp <= b - a <= 3.3 * sp and a > 0 and b < win.shape[0]:
                    strokes.append((c, a, b))
        if not strokes:
            continue
        # 相邻列的同一笔画合并
        groups = []
        for c, a, b in strokes:
            if groups and c - groups[-1][-1][0] <= 1 and abs(a - groups[-1][-1][1]) <= 3:
                groups[-1].append((c, a, b))
            else:
                groups.append([(c, a, b)])
        tops = [min(a for _, a, _ in g) for g in groups]
        bottoms = [max(b for _, _, b in g) for g in groups]
        centre = (min(tops) + max(bottoms)) / 2 + y0
        if abs(centre - hd['y']) > 1.0 * sp and len(groups) != 1:
            continue
        hd['accidentalMark'] = True
        if len(groups) == 1:
            sx = groups[0][-1][0] + 1
            belly = win[int(hd['y'] - y0 - 0.6 * sp):int(hd['y'] - y0 + 0.5 * sp), sx:sx + int(0.7 * sp)]
            if bottoms[0] + y0 > hd['y'] + 0.2 * sp and tops[0] + y0 < hd['y'] - 1.2 * sp and belly.size and belly.mean() > 0.25:
                hd['accidental'] = 'flat'
        elif len(groups) == 2:
            if tops[0] < tops[1] - 0.4 * sp and bottoms[1] > bottoms[0] + 0.4 * sp:
                hd['accidental'] = 'natural'
            else:
                hd['accidental'] = 'sharp'
    return heads


def ottava_rows(gray, sp):
    """8va/8vb 虚线：同一行内至少 5 段长度、间隔相近的细短横线（常为灰色，阈值放宽）。"""
    light = gray < 215
    h = light.shape[0]
    found = []
    for y in range(2, h - 2):
        segs = [(a, b) for a, b in runs(light[y]) if 0.4 * sp <= b - a <= 1.6 * sp]
        thin = sum(1 for a, b in segs if not light[y - 2, (a + b) // 2] and not light[y + 2, (a + b) // 2])
        if len(segs) < 5 or thin < 0.6 * len(segs):
            continue
        # 取间隔规则的最长一串短线，作为虚线的起止
        chains, chain = [], [segs[0]]
        for prev, cur in zip(segs, segs[1:]):
            if 0.8 * sp <= cur[0] - prev[0] <= 2.5 * sp:
                chain.append(cur)
            else:
                chains.append(chain)
                chain = [cur]
        chains.append(chain)
        best = max(chains, key=len)
        gaps = np.diff([a for a, _ in best])
        if len(best) >= 5 and np.ptp(gaps) <= 0.6 * sp:
            found.append((y, int(best[0][0]), int(best[-1][1])))
    merged = []
    for y, a, b in found:
        if merged and y - merged[-1][0] <= 2:
            continue
        merged.append((y, a, b))
    return merged


def remove_long_runs(mask, sp):
    """去掉每行中长于 1.5 个间距的横向墨迹（谱线、加线、符杠），保留附点等小符号。"""
    out = mask.copy()
    for y in range(out.shape[0]):
        for a, b in runs(out[y]):
            if b - a >= 1.5 * sp:
                out[y, a:b] = False
    return out


def clef_at(dark, staff, sp, x0, x1):
    """判断窗口内有无谱号：低音谱号右侧有两个上下相邻的点（夹着第四线），
    高音谱号是一笔纵跨 3 个间距以上的粗笔画。小号的换谱号同样适用。"""
    top, bottom = staff[0], staff[4]
    y0 = max(0, int(top - 3 * sp))
    y1 = min(dark.shape[0], int(bottom + 3 * sp))
    x0, x1 = max(0, int(x0)), min(dark.shape[1], int(x1))
    if x1 - x0 < sp:
        return None
    win = remove_long_runs(dark[y0:y1, x0:x1], sp)
    lab, _ = ndimage.label(win)
    blobs = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        blobs.append((x0 + sl[1].start, y0 + sl[0].start, w, h, x0 + sl[1].stop, y0 + sl[0].stop))
    dot_like = [b for b in blobs if 0.2 * sp <= b[2] <= 0.6 * sp and 0.2 * sp <= b[3] <= 0.6 * sp]
    for a in dot_like:
        for b in dot_like:
            ca, cb = a[1] + a[3] / 2, b[1] + b[3] / 2
            if b is a or not 0.5 * sp <= cb - ca <= 1.3 * sp or abs(a[0] - b[0]) > 0.3 * sp:
                continue
            middle = (ca + cb) / 2
            curve = any(c[4] <= a[0] + 1 and a[0] - c[4] < 1.2 * sp and c[3] >= 0.6 * sp for c in blobs)
            if abs(middle - (top + sp)) <= 0.45 * sp and curve:
                return 'bass', min(c[0] for c in blobs if c[4] <= a[4] + 1), a[4]
    # 谱线被去掉后高音谱号断成几段：竖向补上 1–2 像素的缺口再量高度
    joined = ndimage.binary_closing(win, structure=np.ones((5, 1)))
    jl, _ = ndimage.label(joined)
    blobs = [(x0 + sl[1].start, y0 + sl[0].start, sl[1].stop - sl[1].start, sl[0].stop - sl[0].start, x0 + sl[1].stop, y0 + sl[0].stop)
             for sl in ndimage.find_objects(jl)]

    def spread(b):
        part = joined[b[1] - y0:b[5] - y0, b[0] - x0:b[4] - x0]
        widths = [np.ptp(np.where(r)[0]) if r.any() else 0 for r in part]
        return np.mean([w >= 0.5 * sp for w in widths])
    # 高音谱号多为曲线，大部分行的墨迹横向展开；带符干的音符只有符头那几行展开
    tall = [b for b in blobs if b[3] >= 3.2 * sp and b[2] >= 0.9 * sp and spread(b) >= 0.45]
    if tall:
        t = max(tall, key=lambda b: b[3])
        return 'treble', t[0], t[4]
    return None


def clefs_in_system(dark, staff, sp, x0, barlines):
    """只在可能出现谱号的位置找：行首，以及每条小节线前后。"""
    found = []
    zones = [(x0 + 0.5 * sp, x0 + 4.5 * sp)]
    for a, b in barlines:
        zones.append((a - 3.8 * sp, a - 0.1 * sp))
    for z0, z1 in zones:
        hit = clef_at(dark, staff, sp, z0, z1)
        if hit:
            found.append((float(hit[1]), hit[0], float(hit[2])))
    return sorted(found)


# ---------- 音高与时值 ----------

def step_name(step, clef):
    letter, octave = TREBLE_BOTTOM if clef == 'treble' else BASS_BOTTOM
    index = LETTERS.index(letter) + step
    return LETTERS[index % 7], octave + index // 7


def key_alter(letter, key):
    if key > 0 and letter in SHARP_ORDER[:key]:
        return 1
    if key < 0 and letter in SHARP_ORDER[::-1][:-key]:
        return -1
    return 0


def pitch_label(letter, octave, alter):
    return letter + {1: '#', -1: 'b', 0: ''}[alter] + str(octave)


def guess_duration(kind, has_stem, flags, dotted):
    if kind == 'hollow':
        base = Fraction(2) if has_stem else Fraction(4)
    else:
        base = Fraction(1, 2 ** flags) if flags else Fraction(1)
    return base * Fraction(3, 2) if dotted else base


# ---------- detect ----------

def detect_page(path, page_no, args):
    gray = load_gray(path)
    dark = gray < 150
    staves, sp = find_staves(dark)
    if len(staves) % 2:
        raise SystemExit(f'{path}: 谱表数为 {len(staves)}，不是成对的钢琴大谱表。')
    heads = filled_heads(dark, sp) + hollow_heads(dark, sp)
    all_dots = dots(dark, sp)
    dashes = ottava_rows(gray, sp)
    systems = []
    for s in range(0, len(staves), 2):
        rh, lh = staves[s], staves[s + 1]
        x0, x1 = staff_x_range(dark, rh)
        lines = find_barlines(dark, rh[0], lh[4], x0, x1, sp)
        bars = bars_from_lines(lines, x0, x1, sp)
        half_gap = (rh[4] + lh[0]) / 2
        system = {'staves': {'right': rh, 'left': lh}, 'x': [x0, x1], 'bars': [], 'clefs': {}}
        inside = [hd for hd in heads if rh[0] - 6 * sp <= hd['y'] < lh[4] + 6 * sp and x0 <= hd['x'] <= x1]
        # 行首的谱号、调号、拍号不是音符：以第一个带符干的实心音头为界
        stemmed = [hd['x'] for hd in inside if hd['kind'] == 'filled' and stem_and_beams(dark, hd, sp)[0]]
        header_end = min(min(stemmed, default=x0 + 14 * sp) - 1.0 * sp, x0 + 16 * sp)
        system['headerEnd'] = float(header_end)
        for hand, staff, lo, hi in (('right', rh, rh[0] - 6 * sp, half_gap), ('left', lh, half_gap, lh[4] + 6 * sp)):
            clefs = clefs_in_system(dark, staff, sp, x0, lines)
            system['clefs'][hand] = [(x, kind) for x, kind, _ in clefs]
            for hd in inside:
                in_clef = any(cx - 0.3 * sp <= hd['x'] <= cend + 0.3 * sp for cx, _, cend in clefs)
                if hd['kind'] == 'hollow':
                    position = (staff[4] - hd['y']) / (sp / 2)
                    # 空心音头必须落在线或间上，且不在 8va 字样旁（虚线起点左侧）
                    near_8va = any(abs(hd['y'] - y) < 1.8 * sp and a - 4 * sp < hd['x'] < a + 0.5 * sp for y, a, _ in dashes)
                    if abs(position - round(position)) > 0.3 or near_8va or not staff[0] - 4.5 * sp < hd['y'] < staff[4] + 4.5 * sp:
                        continue
                if lo <= hd['y'] < hi and hd['x'] > header_end and not in_clef:
                    hd['hand'] = hand
                    hd['step'] = int(round((staff[4] - hd['y']) / (sp / 2)))
                    hd['system'] = s
        accidental_marks(dark, [hd for hd in inside if 'hand' in hd], sp)
        for b0, b1 in bars:
            bar = {'x': [b0, b1], 'right': [], 'left': [], 'ottava': []}
            for y, a, b in dashes:
                if a < b1 and b > b0 and rh[0] - 5 * sp < y < lh[4] + 2 * sp:
                    bar['ottava'].append('right' if y < half_gap else 'left')
            bar['ottava'] = sorted(set(bar['ottava']))
            for hand in ('right', 'left'):
                mine = sorted([h for h in heads if h.get('system') == s and h.get('hand') == hand and b0 < h['x'] < b1], key=lambda h: h['x'])
                columns = []
                for hd in mine:
                    if columns and (abs(columns[-1]['x'] - hd['x']) <= 0.8 * sp or
                                    (abs(columns[-1]['x'] - hd['x']) <= 1.5 * sp and min(abs(hd['step'] - s2) for s2 in columns[-1]['steps']) == 1)):
                        col = columns[-1]
                    else:
                        col = {'x': hd['x'], 'steps': [], 'kinds': [], 'heads': []}
                        columns.append(col)
                    if hd['step'] not in col['steps']:
                        col['steps'].append(hd['step'])
                        col['kinds'].append(hd['kind'])
                        col['heads'].append(hd)
                for col in columns:
                    stem, flags = False, 0
                    ys = [hd['y'] for hd in col['heads']]
                    for hd in col['heads']:
                        s_, f_ = stem_and_beams(dark, hd, sp, ys)
                        stem, flags = stem or s_, max(flags, f_)
                    right_edge = max(h['x'] for h in col['heads']) + 0.6 * sp
                    col['dotted'] = any(right_edge < dx < right_edge + 1.4 * sp and
                                        min(abs(dy - h['y']) for h in col['heads']) < 0.9 * sp for dx, dy in all_dots)
                    col['stem'] = stem
                    col['flags'] = flags
                    col['accidentalMark'] = any(h.get('accidentalMark') for h in col['heads'])
                    col['accidentals'] = [h.get('accidental') for h in col['heads']]
                    col['kind'] = 'hollow' if 'hollow' in col['kinds'] else 'filled'
                    col['x'] = float(np.mean([h['x'] for h in col['heads']]))
                    order = np.argsort(col['steps'])
                    col['steps'] = [int(col['steps'][i]) for i in order]
                    col['kinds'] = [col['kinds'][i] for i in order]
                    col['accidentals'] = [col['accidentals'][i] for i in order]
                    del col['heads']
                bar[hand] = columns
            system['bars'].append(bar)
        systems.append(system)
    return {'page': page_no, 'image': os.path.abspath(path), 'spacing': sp, 'size': list(gray.shape[::-1]), 'systems': systems}


def assign_clefs_and_numbers(pages, args):
    """按阅读顺序编号小节，推定每小节起始谱号，并生成音高草稿。"""
    current = {'right': 'treble', 'left': args.left_clef}
    number = 0
    for page in pages:
        for system in page['systems']:
            for bar in system['bars']:
                number += 1
                bar['number'] = number
                for hand in ('right', 'left'):
                    for x, clef in system['clefs'][hand]:
                        if x < bar['x'][0] + 4 * page['spacing']:
                            current[hand] = clef
                    bar.setdefault('clef', {})[hand] = current[hand]
                    carried = {}
                    for col in bar[hand]:
                        names = []
                        for step, acc in zip(col['steps'], col['accidentals']):
                            letter, octave = step_name(step, current[hand])
                            if acc:
                                carried[(letter, octave)] = {'sharp': 1, 'flat': -1, 'natural': 0}[acc]
                            alter = carried.get((letter, octave), key_alter(letter, args.key))
                            names.append(pitch_label(letter, octave, alter))
                        col['pitches'] = names
                        dur = guess_duration(col['kind'], col['stem'], col['flags'], col['dotted'])
                        col['duration'] = str(dur)
                # 小节末尾的换谱号作用于下一小节
                for hand in ('right', 'left'):
                    for x, clef in system['clefs'][hand]:
                        if bar['x'][1] - 4 * page['spacing'] < x <= bar['x'][1] + 1:
                            current[hand] = clef
                bar['endClef'] = dict(current)
    return number


def cmd_detect(args):
    os.makedirs(args.out, exist_ok=True)
    pages = [detect_page(p, i + 1, args) for i, p in enumerate(args.images)]
    count = assign_clefs_and_numbers(pages, args)
    num, den = map(int, args.time.split('/'))
    bar_beats = Fraction(4 * num, den)
    unsure = 0
    for page in pages:
        for system in page['systems']:
            for bar in system['bars']:
                bar['flags'] = []
                for hand in ('right', 'left'):
                    total = sum(Fraction(c['duration']) for c in bar[hand])
                    if total != bar_beats:
                        bar['flags'].append(f'{hand}: 推测时值合计 {total} 拍，应为 {bar_beats} 拍（可能有休止、连音或并行声部）')
                    if any(c['accidentalMark'] for c in bar[hand]):
                        bar['flags'].append(f'{hand}: 有临时记号疑点')
                if bar['ottava']:
                    bar['flags'].append('8va/8vb 虚线：' + ','.join(bar['ottava']))
                unsure += bool(bar['flags'])
    result = {'version': 1, 'key': args.key, 'time': args.time, 'bars': count, 'pages': pages}
    with open(os.path.join(args.out, 'detect.json'), 'w') as f:
        json.dump(result, f, ensure_ascii=False)
    print(f'检测完成：{len(pages)} 页，{count} 小节；{count - unsure} 小节自动草稿时值与音头一致，{unsure} 小节有待核对疑点。')


# ---------- repeats ----------

def iter_bars(detect):
    for page in detect['pages']:
        for si, system in enumerate(page['systems']):
            for bar in system['bars']:
                yield page, si, system, bar


def fingerprint(bar):
    """音乐语义指纹：起止谱号、8va、每列音名（已按调号与小节内临时记号推定）、空心/附点/符尾、临时记号。"""
    def cols(hand):
        width = bar['x'][1] - bar['x'][0]
        return [(round((c['x'] - bar['x'][0]) / width * 20), tuple(c['pitches']), c['kind'], c['dotted'], c['flags'],
                 c['accidentalMark'], tuple(a or '' for a in c['accidentals'])) for c in bar[hand]]
    return (bar['clef']['right'], bar['clef']['left'], bar.get('endClef', {}).get('right'), bar.get('endClef', {}).get('left'),
            tuple(bar['ottava']), tuple(cols('right')), tuple(cols('left')))


def bar_image(page, system, bar, height=160, width=480):
    gray = load_gray(page['image'])
    sp = page['spacing']
    top = int(system['staves']['right'][0] - 4 * sp)
    bot = int(system['staves']['left'][4] + 4 * sp)
    crop = Image.fromarray(gray[top:bot, int(bar['x'][0]) + 2:int(bar['x'][1]) - 1].astype(np.uint8))
    return np.asarray(crop.resize((width, height), Image.BILINEAR)) < 140


def cmd_repeats(args):
    detect = json.load(open(os.path.join(args.work, 'detect.json')))
    seen = []
    mapping = {}
    for page, si, system, bar in iter_bars(detect):
        fp = fingerprint(bar)
        img = bar_image(page, system, bar)
        same = None
        for number, fp2, img2 in seen:
            if fp2 == fp:
                inter = (img & img2).sum()
                union = (img | img2).sum() or 1
                if inter / union >= args.threshold:
                    same = number
                    break
        if same:
            mapping[bar['number']] = {'same': same, 'checks': ['谱号（起止）', '调号', '8va', '音名（含临时记号作用域）', '空心/附点/符尾', '像素相似度'],
                                      'unchecked': ['延音线/连音线（检测器不识别）', '休止符', '跨小节临时记号与跨页上下文']}
        else:
            seen.append((bar['number'], fp, img))
    json.dump({'repeats': mapping, 'note': '仅为候选：识读者必须对照原图确认，不确定就逐音识读。'}, open(os.path.join(args.work, 'repeats.json'), 'w'), ensure_ascii=False)
    print(f'{detect["bars"]} 小节中 {len(mapping)} 小节是重复候选（需识读者对照原图确认）。')
    for k, v in mapping.items():
        print(f'  第{k}小节 ≈ 第{v["same"]}小节')


# ---------- tasks ----------

def draft_events(bar, hand, bar_beats):
    parts = []
    for c in bar[hand]:
        parts.append('+'.join(c['pitches']) + ':' + c['duration'])
    total = sum(Fraction(c['duration']) for c in bar[hand])
    if total < bar_beats:
        parts.append(f'r:{bar_beats - total}?')
    return ' '.join(parts) if parts else f'r:{bar_beats}'


def cmd_tasks(args):
    detect = json.load(open(os.path.join(args.work, 'detect.json')))
    repeats = json.load(open(os.path.join(args.work, 'repeats.json')))['repeats'] if os.path.exists(os.path.join(args.work, 'repeats.json')) else {}
    repeats = {int(k): v['same'] for k, v in repeats.items()}
    num, den = map(int, detect['time'].split('/'))
    bar_beats = Fraction(4 * num, den)
    out = os.path.join(args.work, 'tasks')
    os.makedirs(out, exist_ok=True)
    tasks = []
    for page in detect['pages']:
        gray = Image.open(page['image']).convert('RGB')
        sp = page['spacing']
        for si, system in enumerate(page['systems']):
            todo = list(system['bars'])  # 每个小节都交给识读者对照原图；草稿与重复候选只作参考
            top = int(system['staves']['right'][0] - 6 * sp)
            bot = int(system['staves']['left'][4] + 6 * sp)
            x0 = max(0, int(system['x'][0] - 4 * sp))
            x1 = int(system['x'][1] + sp)
            crop = gray.crop((x0, top, x1, bot))
            crop = crop.resize((int(crop.width * args.scale), int(crop.height * args.scale)), Image.LANCZOS)
            draw = ImageDraw.Draw(crop)
            for b in system['bars']:
                bx = (b['x'][0] - x0) * args.scale + 4
                label = f'#{b["number"]}' + (f'={repeats[b["number"]]}' if b['number'] in repeats else '')
                draw.text((bx, 2), label, fill=(200, 0, 0))
            name = f'p{page["page"]}-s{si + 1}'
            crop.save(os.path.join(out, name + '.png'))
            lines = [f'# 任务 {name}：原图 {name}.png（放大 {args.scale} 倍，红色数字为小节号）',
                     f'# 调号 {detect["key"]}，拍号 {detect["time"]}；每小节每只手合计 {bar_beats} 拍。',
                     '# 格式：小节 R|L: 音名(+音名):时值 ...；r 为休止；时值以四分音符为 1；8va 写实际音高；末尾 ~ 表示连到下一个同音。',
                     '# 下面是程序草稿：音名来自音头位置和调号，时值来自空心/符干/符杠/附点推测。草稿可能整小节都错，',
                     '# 必须逐小节对照原图核对每个音（不只看疑点），休止、连线、装饰音、临时记号检测器可能漏掉。']
            for b in todo:
                start = b['clef']
                lines.append(f'# 第{b["number"]}小节起始谱号：右手 {start["right"]}，左手 {start["left"]}' + (f'；8va 虚线：{",".join(b["ottava"])}' if b['ottava'] else ''))
                if b['number'] in repeats:
                    lines.append(f'# 第{b["number"]}小节是第{repeats[b["number"]]}小节的重复候选：若对照原图确认完全相同（含延音线、休止、临时记号），可写 "{b["number"]} = {repeats[b["number"]]}"；不确定就逐音识读。')
                for flag in b['flags']:
                    lines.append(f'# 第{b["number"]}小节疑点：{flag}')
                lines.append(f'{b["number"]} R: {draft_events(b, "right", bar_beats)}')
                lines.append(f'{b["number"]} L: {draft_events(b, "left", bar_beats)}')
            with open(os.path.join(out, name + '.bars'), 'w') as f:
                f.write('\n'.join(lines) + '\n')
            tasks.append({'task': name, 'image': name + '.png', 'draft': name + '.bars', 'bars': [b['number'] for b in todo],
                          'flagged': [b['number'] for b in todo if b['flags']], 'repeatCandidates': [b['number'] for b in todo if b['number'] in repeats]})
    json.dump({'tasks': tasks, 'key': detect['key'], 'time': detect['time']}, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    flagged = sum(len(t['flagged']) for t in tasks)
    print(f'生成 {len(tasks)} 个互不依赖的识读任务，覆盖全部 {sum(len(t["bars"]) for t in tasks)} 小节（{flagged} 小节有疑点，{len(repeats)} 小节为重复候选）。')


# ---------- audit ----------

def dia(midi, key):
    pc = midi % 12
    names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] if key >= 0 else \
        ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
    return names[pc][0], midi // 12 - 1


def cmd_audit(args):
    detect = json.load(open(os.path.join(args.work, 'detect.json')))
    data = json.load(open(args.score))
    score = data.get('score', data)
    num, den = map(int, detect['time'].split('/'))
    bar_beats = 4 * num / den
    checked = matched = 0
    problems = []
    for page, si, system, bar in iter_bars(detect):
        n = bar['number']
        for hand in ('right', 'left'):
            onsets = {}
            for note in score['notes']:
                if note['hand'] == hand and (n - 1) * bar_beats - 1e-6 <= note['beat'] < n * bar_beats - 1e-6:
                    onsets.setdefault(round(note['beat'], 4), []).append(note['midi'])
            mine = [sorted(dia(m, detect['key'])[0] for m in v) for _, v in sorted(onsets.items())]
            seen = [sorted(p[0] for p in c['pitches']) for c in bar[hand]]
            mine_flat = [x for c in mine for x in c]
            seen_flat = [x for c in seen for x in c]
            checked += len(mine_flat)
            # 最长公共子序列：检测漏掉的音头不算错误，检测到而乐谱里没有的才要核对
            table = [[0] * (len(seen_flat) + 1) for _ in range(len(mine_flat) + 1)]
            for i, a in enumerate(mine_flat):
                for j, b in enumerate(seen_flat):
                    table[i + 1][j + 1] = table[i][j] + 1 if a == b else max(table[i][j + 1], table[i + 1][j])
            common = table[-1][-1]
            matched += common
            if common < len(seen_flat) and bar['ottava'] == []:
                problems.append(f'第{n}小节 {"右" if hand == "right" else "左"}手：检测到 {len(seen_flat)} 个音头，乐谱中只对上 {common} 个（检测 {" ".join("+".join(c) for c in seen)}；乐谱 {" ".join("+".join(c) for c in mine)}）')
    print(f'乐谱 {checked} 个音中 {matched} 个（{matched / max(1, checked):.1%}）有对应的检测音头；{len(problems)} 处检测音头未在乐谱中找到：')
    for p in problems:
        print('  ' + p)
    sys.exit(1 if problems and args.strict else 0)


# ---------- selftest ----------

def cmd_selftest(args):
    """合成一页大谱表（已知音符）检查检测结果，不依赖任何受版权保护的谱面。"""
    import tempfile
    sp = 10
    w, h = 900, 400
    img = Image.new('L', (w, h), 255)
    d = ImageDraw.Draw(img)
    rh_top, lh_top = 80, 220
    x0, x1 = 60, 860
    for top in (rh_top, lh_top):
        for i in range(5):
            d.line([(x0, top + i * sp), (x1, top + i * sp)], fill=0, width=1)
    for x in (x0, 460, x1):
        d.line([(x, rh_top), (x, lh_top + 4 * sp)], fill=0, width=2 if x == x1 else 1)

    def head(x, y, filled=True):
        box = [x - 6, y - 4, x + 6, y + 4]
        d.ellipse(box, fill=0 if filled else None, outline=0, width=2)

    def stem_up(x, y, length=35):
        d.line([(x + 5, y), (x + 5, y - length)], fill=0, width=1)
        return x + 5, y - length

    # 第1小节右手：四个四分音符 E4 G4 B4 D5（高音谱号底线 E4）
    for i, step in enumerate([0, 2, 4, 6]):
        y = rh_top + 4 * sp - step * sp / 2
        head(150 + i * 70, y)
        stem_up(150 + i * 70, y)
    # 第1小节左手：附点二分（空心+符干+附点）+ 四分，低音谱号底线 G2
    y = lh_top + 4 * sp - 2 * sp / 2  # B2
    head(150, y, filled=False)
    stem_up(150, y)
    d.ellipse([162, y - sp // 2 - 2, 166, y - sp // 2 + 2], fill=0)  # 线上音符的附点写在上方间里
    head(360, lh_top + 4 * sp)          # G2
    stem_up(360, lh_top + 4 * sp)
    # 第2小节右手：两个八分（共用符杠）+ 全音符；左手：全音符
    ends = []
    for i, step in enumerate([1, 3]):
        y = rh_top + 4 * sp - step * sp / 2
        head(520 + i * 40, y)
        ends.append(stem_up(520 + i * 40, y, 32))
    d.line([ends[0], ends[1]], fill=0, width=4)
    head(700, rh_top + 2 * sp, filled=False)  # B4 全音符
    head(600, lh_top + 2 * sp, filled=False)  # D3 全音符
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'synthetic.png')
        img.save(path)
        ns = argparse.Namespace(images=[path], key=0, time='4/4', left_clef='bass', out=tmp)
        cmd_detect(ns)
        detect = json.load(open(os.path.join(tmp, 'detect.json')))
    bars = detect['pages'][0]['systems'][0]['bars']
    got = [[(c['pitches'], c['duration']) for c in bar[hand]] for bar in bars for hand in ('right', 'left')]
    want = [
        [(['E4'], '1'), (['G4'], '1'), (['B4'], '1'), (['D5'], '1')],
        [(['B2'], '3'), (['G2'], '1')],
        [(['F4'], '1/2'), (['A4'], '1/2'), (['B4'], '4')],
        [(['D3'], '4')],
    ]
    if got != want:
        print('自检失败：\n期望 ' + json.dumps(want, ensure_ascii=False) + '\n实际 ' + json.dumps(got, ensure_ascii=False))
        sys.exit(1)
    print('自检通过：合成谱面的音高、时值、附点、空心音符与小节划分全部正确。')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    d = sub.add_parser('detect')
    d.add_argument('images', nargs='+')
    d.add_argument('--key', type=int, default=0, help='调号：升号数为正、降号数为负')
    d.add_argument('--time', default='4/4')
    d.add_argument('--left-clef', default='bass', choices=['bass', 'treble'], help='第一行左手谱号无法识别时的默认值')
    d.add_argument('--out', required=True)
    r = sub.add_parser('repeats')
    r.add_argument('work')
    r.add_argument('--threshold', type=float, default=0.8)
    t = sub.add_parser('tasks')
    t.add_argument('work')
    t.add_argument('--scale', type=float, default=2)
    a = sub.add_parser('audit')
    a.add_argument('work')
    a.add_argument('score')
    a.add_argument('--strict', action='store_true')
    sub.add_parser('selftest')
    args = parser.parse_args()
    {'detect': cmd_detect, 'repeats': cmd_repeats, 'tasks': cmd_tasks, 'audit': cmd_audit, 'selftest': cmd_selftest}[args.command](args)


if __name__ == '__main__':
    main()
