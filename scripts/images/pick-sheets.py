#!/usr/bin/env python3
"""把待挑图 SKU 按每屏 12 个排成评审图，供逐屏判断。

每行一个 SKU：左侧标签（序号 / SKU / 型号），右侧 1–4 张候选净图。
候选按主体占比排序，图下标 #序号 与占比。

用法：
  pick-sheets.py --data .local/recrawl/review-data.json --out .local/recrawl/picksheet [--per 12] [--brand 领普]
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

LABEL_W = 300
FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
def font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except Exception:
        return ImageFont.load_default()
F12, F11 = font(12), font(11)
CELL = 132
GAP = 6


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--per", type=int, default=12)
    ap.add_argument("--brand", default="")
    a = ap.parse_args()

    data = json.load(open(a.data, encoding="utf-8"))
    items = [d for d in data if d["cands"] and (not a.brand or a.brand in d["brand"])]
    items.sort(key=lambda d: (d["brand"], d["sku"]))
    os.makedirs(a.out, exist_ok=True)

    index = []
    for si in range(0, len(items), a.per):
        chunk = items[si:si + a.per]
        rows = len(chunk)
        W = LABEL_W + 4 * (CELL + GAP) + 10
        H = rows * (CELL + 20) + 8
        canvas = Image.new("RGB", (W, H), "white")
        dr = ImageDraw.Draw(canvas)
        for ri, it in enumerate(chunk):
            y = 8 + ri * (CELL + 20)
            dr.rectangle([0, y, LABEL_W - 6, y + CELL + 14], fill="#f1f5f9")
            dr.text((8, y + 6), f"{si + ri}", fill="#0f172a", font=F12)
            dr.text((8, y + 22), it["sku"][:34], fill="#0f172a", font=F12)
            dr.text((8, y + 40), it["name"][:22], fill="#475467", font=F11)
            if len(it["name"]) > 30:
                dr.text((8, y + 56), it["name"][22:44], fill="#475467", font=F11)
            dr.text((8, y + 74), it["brand"], fill="#0f766e", font=F11)
            index.append({"row": si + ri, "sku": it["sku"], "name": it["name"], "n": len(it["cands"])})
            for ci, c in enumerate(it["cands"][:4]):
                x = LABEL_W + ci * (CELL + GAP)
                try:
                    im = Image.open("." + c["file"][1:]).convert("RGBA")
                    im.thumbnail((CELL - 6, CELL - 6))
                    bg = Image.new("RGB", im.size, "#f0f2f5")
                    bg.paste(im, mask=im.split()[3])
                    canvas.paste(bg, (x + 3, y + 3))
                except Exception:
                    dr.rectangle([x + 3, y + 3, x + CELL, y + CELL], outline="red")
                dr.text((x + 3, y + CELL + 3), f"#{ci + 1} {c['cover']:.2f}", fill="#334155", font=F11)
        fn = os.path.join(a.out, f"p{si // a.per + 1:02d}.jpg")
        canvas.save(fn, quality=88)
        print(fn)

    json.dump(index, open(os.path.join(a.out, "index.json"), "w"), ensure_ascii=False, indent=1)
    print(f"{len(items)} 个 SKU / {(len(items) + a.per - 1) // a.per} 屏")


if __name__ == "__main__":
    main()
