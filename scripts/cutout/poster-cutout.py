#!/usr/bin/env python3
"""电商详情页海报 → 产品净图（v2：多候选定位 + Vision 逐个试）。

海报没有白底产品照，但主图区一定有一张产品实拍。做法：
  1. 在左侧主图区找出若干「亮、低饱和、块状」的候选区域
  2. 按矩形度 × 面积 排序，逐个裁出、放大，交 Vision 抠图
  3. 取主体占比落在合理区间、且不过度吞并背景的那个结果
  4. 填实主体内部镂空（中空环形吸顶灯会被挖空）

用法：
  poster-cutout.py <原图> <输出png> [--debug] [--all]
输出 JSON：{"ok":true,"box":[x0,y0,x1,y1],"cover":..,"outW":..,"outH":..,"tries":n}
"""
import json, os, subprocess, sys, tempfile
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

CUTOUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cutout")
WORK = 260


def components(mask):
    h, w = mask.shape
    seen = np.zeros((h, w), bool)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            n = 0
            miny = maxy = y
            minx = maxx = x
            while q:
                cy, cx = q.popleft()
                n += 1
                if cy < miny: miny = cy
                if cy > maxy: maxy = cy
                if cx < minx: minx = cx
                if cx > maxx: maxx = cx
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            out.append((n, minx, miny, maxx, maxy))
    return out


def candidate_boxes(im):
    """返回按可信度排序的候选裁切框（原图坐标）"""
    w, h = im.size
    cut_w = int(w * 0.70)
    region = im.crop((0, 0, cut_w, int(h * 0.88)))
    rw, rh = region.size
    s = min(WORK / rw, WORK / rh, 1.0)
    small = region.resize((max(40, int(rw * s)), max(40, int(rh * s))), Image.LANCZOS)
    a = np.array(small.convert("RGB")).astype(np.int16)
    v = a.max(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)

    boxes = []
    for pct, sat_max in ((88, 32), (94, 26), (80, 38)):
        thr = max(np.percentile(v, pct), 205)
        mask = (v >= thr) & (sat <= sat_max)
        mask[:2] = False; mask[-2:] = False
        mask[:, :2] = False; mask[:, -2:] = False
        H, W = mask.shape
        total = H * W
        for n, x0, y0, x1, y1 in components(mask):
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            area = bw * bh
            if n < total * 0.015 or n > total * 0.45:
                continue
            rect = n / area
            ar = bw / bh
            if rect < 0.55 or not (0.18 <= ar <= 5.5):
                continue
            if bw < W * 0.16 or bh < H * 0.08:
                continue
            # 产品在画面上半部；底部多为卖点图标条与版权行
            if (y0 + y1) / 2 > H * 0.56:
                continue
            boxes.append((n * rect, [int(x0 / s), int(y0 / s), int(x1 / s), int(y1 / s)]))
    boxes.sort(key=lambda t: -t[0])
    out, seen = [], set()
    for _, b in boxes:
        key = (b[0] // 20, b[1] // 20, b[2] // 20, b[3] // 20)
        if key in seen:
            continue
        seen.add(key)
        pad = int(max(b[2] - b[0], b[3] - b[1]) * 0.14)
        out.append([max(0, b[0] - pad), max(0, b[1] - pad),
                    min(cut_w, b[2] + pad), min(rh, b[3] + pad)])
        if len(out) >= 4:
            break
    # 兜底：海报构图高度一致，产品几乎总在左上主图区
    for fx0, fy0, fx1, fy1 in ((0.00, 0.00, 0.98, 0.55), (0.00, 0.00, 0.98, 0.75),
                               (0.00, 0.00, 0.98, 0.40)):
        out.append([int(cut_w * fx0), int(rh * fy0), int(cut_w * fx1), int(rh * fy1)])
    return out


def fill_holes(png_path):
    im = Image.open(png_path).convert("RGBA")
    a = np.array(im)
    alpha = a[:, :, 3] > 24
    h, w = alpha.shape
    outside = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not alpha[y, x] and not outside[y, x]:
                outside[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not alpha[y, x] and not outside[y, x]:
                outside[y, x] = True; q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not alpha[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True; q.append((ny, nx))
    holes = (~alpha) & (~outside)
    frac = float(holes.mean())
    if 0.004 < frac < 0.35:
        a[:, :, 3][holes] = 255
        Image.fromarray(a, "RGBA").save(png_path, "PNG", optimize=True)
        return frac
    return 0.0


def strip_promo(im):
    """抹掉促销红角标/红条：用周围中位色覆盖饱和红区域。

    只看「红得过分」的像素（R 远高于 G/B），正常产品红色部件面积小，受保护。
    """
    import numpy as np
    from PIL import ImageFilter
    a = np.array(im.convert("RGB")).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    red = (r > 150) & (r - g > 55) & (r - b > 55)
    if red.mean() < 0.002 or red.mean() > 0.35:
        return im, 0.0
    # 膨胀一下，盖住描边
    m = Image.fromarray((red * 255).astype("uint8")).filter(ImageFilter.MaxFilter(9))
    red2 = np.array(m) > 128
    # 用整图（去掉红区）的中位色填充，避免把周围内容拖进来
    fill = np.median(a[~red2].reshape(-1, 3), axis=0).astype(np.int16)
    out = a.copy()
    out[red2] = fill
    return Image.fromarray(out.astype("uint8")), float(red2.mean())


def run(src, dst, debug=False, max_tries=4):
    im = Image.open(src)
    im, promo = strip_promo(im)
    boxes = candidate_boxes(im)
    if not boxes:
        return {"ok": False, "error": "未定位到候选区域"}
    best = None
    tries = 0
    for box in boxes[:max_tries + 3]:
        crop = im.crop(tuple(box))
        if crop.width < 120 or crop.height < 60:
            continue
        if min(crop.size) < 700:
            k = 700 / min(crop.size)
            crop = crop.resize((int(crop.width * k), int(crop.height * k)), Image.LANCZOS)
        crop = crop.filter(ImageFilter.SMOOTH)
        tmp = tempfile.mktemp(suffix=".png")
        crop.save(tmp)
        tries += 1
        r = subprocess.run([CUTOUT, tmp, dst, "--pad", "6", "--max", "1000"],
                           capture_output=True, text=True, timeout=180)
        os.unlink(tmp)
        line = (r.stdout or "").strip().split("\n")[-1]
        try:
            out = json.loads(line)
        except Exception:
            continue
        if not out.get("ok"):
            continue
        cover = out.get("cover") or 0
        # 好结果：主体占 25%~88%，太高说明把背景一起吞了
        score = cover if cover <= 0.88 else 0.88 - (cover - 0.88)
        if best is None or score > best[0]:
            best = (score, box, out, dst)
            if debug:
                crop.save(dst.replace(".png", f"-crop{tries}.png"))
        if cover >= 0.30 and cover <= 0.80:
            break
    if not best:
        return {"ok": False, "error": "所有候选区域均抠图失败", "tries": tries}
    score, box, out, _ = best
    filled = fill_holes(dst)
    out.update({"box": box, "filled": round(filled, 4), "tries": tries,
                "score": round(float(score), 3), "promo": round(promo, 4)})
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: poster-cutout.py <原图> <输出png> [--debug]")
        sys.exit(1)
    print(json.dumps(run(sys.argv[1], sys.argv[2], "--debug" in sys.argv), ensure_ascii=False))
