#!/usr/bin/env python3
"""为带营销文案/效果图的记录重抓干净产品图。

思路：overview 页的 `_01` / `_02` 序号图通常是纯产品图或首屏 banner，
带文案的详情图序号更大。这里按「序号小 + 尺寸接近方形」筛，再视觉抽检。
"""
import json, os, re, ssl, time, hashlib, urllib.request, urllib.parse
from PIL import Image, ImageDraw

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9'}
BASE = ".local/product-catalog-collection/20261016-fill-images"
RAW = "/tmp/aq2"

def enc(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc,
        urllib.parse.quote(p.path, safe="/%:@&=+$,~()!*';[]"), p.query, p.fragment))

def get(u, tries=3):
    for k in range(tries):
        try:
            b = urllib.request.urlopen(urllib.request.Request(enc(u), headers=UA),
                                       timeout=30, context=CTX).read()
            if b[:2] == b'\x1f\x8b':
                import gzip; b = gzip.decompress(b)
            return b.decode('utf-8', 'ignore')
        except Exception as e:
            if k == tries - 1: raise
            time.sleep(1.5 * (k + 1))

# 需要重抓的：slug -> 目标 SKU 列表
TARGETS = {
 "d13":       ["AQARA-无线开关-D1-贴墙式-单键", "AQARA-无线开关-D1-贴墙式-双键"],
 "d12":       ["AQARA-智能墙壁开关-D1-单火线-单键版", "AQARA-智能墙壁开关-D1-单火线-双键版",
               "AQARA-智能墙壁开关-D1-零火线-单键版", "AQARA-智能墙壁开关-D1-零火线-双键版"],
 "smart-wall-switch-h1-no-neutral": ["AQARA-智能墙壁开关-H1-单火线-三键版"],
 "d27":       ["AQARA-智能墙壁开关-H1-PRO-零火-单键版", "AQARA-智能墙壁开关-H1-PRO-零火-双键版"],
 "Smart_Vertical_Blinds_Controller_H1": ["AQARA-智能梦幻帘-H1"],
 "curtain-c3": ["AQARA-智能窗帘电机-C3"],
 "curtain-t2": ["AQARA-智能窗帘电机-T2"],
 "Smart-Dimmer-Controller-T1-Pro": ["AQARA-双色温驱动器-T1-Pro"],
 "Don-Spotlight-T3": ["AQARA-单色温一体式筒射灯-T3"],
 "d4_3":      ["AQARA-智能墙壁插座-ZIGBEE-版"],
}

def seq_no(u):
    """从文件名提取详情图序号，如 _22_1657098195176 → 22"""
    m = re.search(r'_(\d{1,2})_(\d{10,})', u)
    return int(m.group(1)) if m else 99

def main():
    os.makedirs(RAW, exist_ok=True)
    got = {}
    for slug, skus in TARGETS.items():
        url = f"https://www.aqara.com/{slug}_overview.html"
        try:
            t = get(url)
        except Exception as e:
            print(f"✗ {slug:36} ERR {str(e)[:44]}")
            continue
        imgs = [i for i in dict.fromkeys(re.findall(
            r'(https?://static-resource\.aqara\.com/jeditor/[^\s"\'<>()]+?\.(?:jpg|jpeg|png|webp))', t))]
        imgs = [i for i in imgs if not any(k in i.lower() for k in ('icon', 'logo', '锁区'))]
        # 序号小的优先（通常是首屏产品图）
        cands = sorted(imgs, key=lambda u: seq_no(u))
        print(f"\n=== {slug} | {len(imgs)} 张，序号最小: {[seq_no(u) for u in cands[:8]]}")
        picked = []
        for u in cands[:10]:
            try:
                b = urllib.request.urlopen(urllib.request.Request(enc(u), headers=UA),
                                           timeout=25, context=CTX).read()
            except Exception:
                continue
            if len(b) < 6000: continue
            fn = f"{RAW}/{slug}_{seq_no(u)}.img"
            open(fn, "wb").write(b)
            try:
                im = Image.open(fn); im.load()
            except Exception:
                continue
            w, h = im.size
            flag = ""
            if w / h > 3.2 or h / w > 3.2: flag = "长图"
            elif min(w, h) < 300: flag = "小图"
            print(f"   #{seq_no(u):<3} {w}x{h:<5} {len(b)//1024:>4}KB {flag}")
            picked.append((fn, u, f"{w}x{h}"))
        # 拼图供视觉抽检
        if picked:
            cell = 300; cols = 5
            rows = (len(picked)+cols-1)//cols
            c = Image.new('RGB', (cols*cell, rows*(cell+26)), 'white')
            dr = ImageDraw.Draw(c)
            for i, (fn, u, sz) in enumerate(picked):
                im = Image.open(fn).convert('RGB'); im.thumbnail((cell-10, cell-10))
                px = (i%cols)*cell+5; py = (i//cols)*(cell+26)+5
                c.paste(im, (px, py))
                dr.text((px, py+cell-20), f"#{seq_no(picked[i][1])} {sz}", fill="black")
            c.save(f"{RAW}/{slug}_sheet.jpg", quality=88)
            got[slug] = picked
        time.sleep(1.2)
    json.dump({k: [(f, u, s) for f, u, s in v] for k, v in got.items()},
              open(f"{BASE}/recrawl.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n→ {BASE}/recrawl.json")

if __name__ == "__main__":
    main()