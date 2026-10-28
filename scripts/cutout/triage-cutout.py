#!/usr/bin/env python3
"""抠图质量分诊 + 分批拼图抽检。

用途：把 678 张抠图结果分成「可信 / 可疑 / 失败」三档，
可疑的生成拼图供人眼核对，避免把「营销图/拆解图/长图切片」当成产品净图入库。

判定规则（启发式，只用于排序，最终以视觉抽检为准）：
  fail   抠图未成功
  blank  输出几乎全透明（alpha 不透明占比 < 1%）—— 抠图 bug 或主体丢失
  tiny   输出短边 < 150px —— 主体太小，出图会糊
  flat   长宽比 > 3.5 或 < 0.28 —— 长图切片/极端形状
  small  主体占原图 < 6% —— 多为营销图（产品只占画面一角）
  full   主体占原图 > 97% —— 可能整张图都被当主体，背景没去掉
  thin   输出文件 < 8KB —— 内容极少
  ok     以上都不是
"""
import json, os, sys
from PIL import Image, ImageDraw

REPORT = ".local/image-cutout/cutout-report.json"
TRIAGE = ".local/image-cutout/triage.json"
SHEET_DIR = "/tmp/cutout_sheets"


def triage_one(x):
    if x["status"] != "ok":
        return "fail"
    out = "./public" + x["out"]
    if not os.path.exists(out):
        return "fail"
    w, h = x.get("outSize") or [0, 0]
    kb = x.get("kb") or 0
    if min(w, h) < 150:
        return "tiny"
    if w and h:
        ar = w / h
        if ar > 3.5 or ar < 0.28:
            return "flat"
    # ★ 必查：输出是否几乎全透明（Vision 报成功但内容丢失）
    try:
        import numpy as np
        im = Image.open(out).convert("RGBA")
        occ = (np.array(im)[:, :, 3] > 16).mean()
        x["occupancy"] = round(float(occ), 4)
        if occ < 0.01:
            return "blank"
    except Exception:
        return "fail"
    cover = x.get("cover")
    if cover is not None:
        if cover < 0.06:
            return "small"
        if cover > 0.97:
            return "full"
    if kb < 8:
        return "thin"
    return "ok"


def checker(w, h, cell=14):
    im = Image.new("RGB", (w, h), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    for bx in range(0, w, cell):
        for by in range(0, h, cell):
            if (bx // cell + by // cell) % 2 == 0:
                dr.rectangle([bx, by, bx + cell - 1, by + cell - 1], fill=(222, 222, 222))
    return im


def make_sheet(items, out_path, cell=200, cols=8):
    rows = (len(items) + cols - 1) // cols
    c = Image.new("RGB", (cols * cell, rows * (cell + 16)), (252, 252, 252))
    dr = ImageDraw.Draw(c)
    for i, x in enumerate(items):
        px = (i % cols) * cell
        py = (i // cols) * (cell + 16)
        src = "./public" + x["out"] if x.get("out") else None
        if src and os.path.exists(src):
            try:
                ci = Image.open(src)
                if ci.mode != "RGBA":
                    ci = ci.convert("RGBA")
                ci.thumbnail((cell - 8, cell - 8))
                bg = checker(cell, cell)
                bg.paste(ci, ((cell - ci.width) // 2, (cell - ci.height) // 2), ci)
                c.paste(bg, (px, py))
            except Exception:
                dr.rectangle([px + 2, py + 2, px + cell - 3, py + cell - 3], fill=(255, 220, 220))
        else:
            dr.rectangle([px + 2, py + 2, px + cell - 3, py + cell - 3], fill=(255, 220, 220))
        label = x["img"].split("/")[-1][:26]
        dr.text((px + 3, py + cell + 1), label, fill="black")
    c.save(out_path, quality=86)
    return c.size


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "triage"
    d = json.load(open(REPORT, encoding="utf-8"))

    if mode == "triage":
        from collections import Counter
        for x in d:
            x["triage"] = triage_one(x)
        cnt = Counter(x["triage"] for x in d)
        json.dump(d, open(TRIAGE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"共 {len(d)} 张")
        for k in ["ok", "blank", "small", "flat", "tiny", "full", "thin", "fail"]:
            if cnt[k]:
                print(f"  {k:6} {cnt[k]:4}")
        print(f"\n→ {TRIAGE}")
        return

    # mode == sheet：按分档生成拼图
    items = json.load(open(TRIAGE, encoding="utf-8"))
    target = sys.argv[2] if len(sys.argv) > 2 else "suspect"
    if target == "suspect":
        arr = [x for x in items if x["triage"] in ("blank", "small", "flat", "tiny", "full", "thin")]
    elif target == "fail":
        arr = [x for x in items if x["triage"] == "fail"]
    else:
        arr = [x for x in items if x["triage"] == "ok"]

    os.makedirs(SHEET_DIR, exist_ok=True)
    print(f"{target}: {len(arr)} 张")
    per = 40
    for i in range(0, len(arr), per):
        chunk = arr[i:i + per]
        p = f"{SHEET_DIR}/{target}_{i // per:02d}.jpg"
        size = make_sheet(chunk, p)
        print(f"  {p}  {len(chunk)} 张  {size}")


if __name__ == "__main__":
    main()