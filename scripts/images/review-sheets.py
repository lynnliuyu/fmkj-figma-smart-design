#!/usr/bin/env python3
"""把 recrawl 结果排成人工抽检拼图：每个 SKU 一行，最多 4 个候选净图。

行首标 SKU 与自动评分，图下标候选文件短名与主体占比，
方便按编号在 picks.json 里登记选择。

用法：
  review-sheets.py --dir .local/recrawl/batch1 [--per-sheet 12] [--only SKU1,SKU2]
"""
import argparse, glob, json, os
from PIL import Image, ImageDraw

CELL = 168
LABEL_W = 236
GAP = 8


def best_score(c):
    cov = c.get("cover") or 0
    # 主体占比落在 0.25~0.80 最像「单一产品净图」
    if cov < 0.12:
        cov_s = cov / 0.12 * 0.4
    elif cov <= 0.80:
        cov_s = 1.0
    else:
        cov_s = max(0.0, 1 - (cov - 0.80) * 3)
    return round(0.5 * c.get("corner_white", 0) + 0.2 * min(c.get("white", 0), 1) + 0.3 * cov_s, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--per-sheet", type=int, default=12)
    ap.add_argument("--only", default="")
    a = ap.parse_args()

    dirs = [d for d in sorted(glob.glob(os.path.join(a.dir, "*")))
            if os.path.isdir(d) and os.path.basename(d) != "sheets"]
    if a.only:
        want = set(a.only.split(","))
        dirs = [d for d in dirs if os.path.basename(d) in want]

    os.makedirs(os.path.join(a.dir, "sheets"), exist_ok=True)
    made = 0
    for si in range(0, len(dirs), a.per_sheet):
        chunk = dirs[si:si + a.per_sheet]
        rows = []
        for d in chunk:
            p = os.path.join(d, "index.json")
            if not os.path.exists(p):
                continue
            cands = [c for c in json.load(open(p)) if c.get("cut") and os.path.exists(c["cut"])]
            for c in cands:
                c["score"] = best_score(c)
            cands.sort(key=lambda c: -c["score"])
            rows.append((os.path.basename(d), cands[:4]))
        if not rows:
            continue
        h = len(rows) * (CELL + 26)
        canvas = Image.new("RGB", (LABEL_W + 4 * (CELL + GAP), h), "white")
        dr = ImageDraw.Draw(canvas)
        for ri, (sku, cands) in enumerate(rows):
            y = ri * (CELL + 26)
            dr.rectangle([0, y, LABEL_W - 6, y + CELL + 24], fill="#eef2f7")
            dr.text((8, y + 8), sku[:30], fill="#0f172a")
            if cands:
                dr.text((8, y + 26), f"最佳 {cands[0]['score']:.2f}", fill="#0f766e")
            for ci, c in enumerate(cands):
                x = LABEL_W + ci * (CELL + GAP)
                im = Image.open(c["cut"]).convert("RGBA")
                im.thumbnail((CELL - 6, CELL - 6))
                bg = Image.new("RGB", im.size, "#f4f4f4")
                bg.paste(im, mask=im.split()[3])
                canvas.paste(bg, (x + 3, y + 3))
                dr.text((x + 3, y + CELL + 4),
                        f"#{ci + 1} {os.path.basename(c['cut'])[4:14]} cov{c.get('cover') or 0:.2f}",
                        fill="#334155")
        fn = os.path.join(a.dir, "sheets", f"review{si // a.per_sheet + 1}.jpg")
        canvas.save(fn, quality=90)
        made += 1
        print(fn)
    print(f"共 {made} 张抽检图，覆盖 {len(dirs)} 个 SKU")


if __name__ == "__main__":
    main()
