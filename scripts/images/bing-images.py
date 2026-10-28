#!/usr/bin/env python3
"""Bing 图片检索 → 候选下载 → 白底/清晰度过滤，供人工挑图与抠图使用。

用法：
  bing-images.py --q "易来 纤玉3.0 吸顶灯" --n 8 --out .local/recrawl/fiber3

输出：
  <out>/candidates.json   每张候选的来源页、直链、尺寸、白底率
  <out>/*.jpg|png         下载到的图

只做检索与下载，不做抠图，不改库。
"""
import argparse, hashlib, json, os, re, sys, urllib.parse, urllib.request
from io import BytesIO

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def get(url, referer=None, timeout=25, max_bytes=12_000_000):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "zh-CN,zh;q=0.9"}
    if referer:
        h["Referer"] = referer
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(max_bytes)
    return data, r.geturl()


def bing_search(query, n=30, first=1):
    """返回 [{murl, purl, t}]，murl 为原图直链，purl 为来源页"""
    q = urllib.parse.quote(query)
    url = f"https://cn.bing.com/images/search?q={q}&first={first}&count={n}&form=HDRSC2"
    html, _ = get(url)
    html = html.decode("utf-8", "ignore")
    out, seen = [], set()
    for m in re.finditer(r'm="\{([^"]+)\}"', html):
        try:
            meta = json.loads("{" + m.group(1).replace('&quot;', '"') + "}")
        except Exception:
            continue
        murl = meta.get("murl")
        if not murl or murl in seen:
            continue
        seen.add(murl)
        out.append({"murl": murl, "purl": meta.get("purl", ""), "t": meta.get("t", "")})
    if not out:  # 兼容旧结构
        for m in re.finditer(r'murl&quot;:&quot;([^&]+)', html):
            u = m.group(1)
            if u not in seen:
                seen.add(u)
                out.append({"murl": u, "purl": "", "t": ""})
    return out


def whiteness(im):
    """返回 (白底率, 四角一致性, 长边) —— 白底率 = 边缘 8px 环内近白像素占比"""
    from PIL import Image
    import numpy as np
    w, h = im.size
    a = np.array(im.convert("RGB")).astype(np.int16)
    band = 8
    ring = np.concatenate([
        a[:band].reshape(-1, 3), a[-band:].reshape(-1, 3),
        a[:, :band].reshape(-1, 3), a[:, -band:].reshape(-1, 3)])
    near_white = (ring.min(axis=1) > 238).mean()
    corners = [a[2, 2], a[2, -3], a[-3, 2], a[-3, -3]].__len__()
    med = np.median(ring, axis=0)
    spread = float(np.median(np.abs(ring - med).sum(axis=1)))
    return float(near_white), spread, max(w, h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--q", required=True, help="检索词")
    ap.add_argument("--n", type=int, default=30, help="抓多少条候选")
    ap.add_argument("--keep", type=int, default=8, help="下载前多少张")
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-side", type=int, default=500)
    ap.add_argument("--referer", default=None, help="部分图床需要来源页 Referer")
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    hits = bing_search(a.q, a.n)
    print(f"检索到 {len(hits)} 条候选", flush=True)

    rows, saved = [], 0
    for h in hits:
        if saved >= a.keep:
            break
        url = h["murl"]
        try:
            data, _ = get(url, referer=a.referer or h["purl"] or None)
        except Exception as e:
            rows.append({"url": url, "err": str(e)[:60]})
            continue
        try:
            from PIL import Image
            im = Image.open(BytesIO(data))
            im.load()
        except Exception as e:
            rows.append({"url": url, "err": f"解码失败 {str(e)[:40]}"})
            continue
        w, hh = im.size
        if max(w, hh) < a.min_side:
            rows.append({"url": url, "err": f"太小 {w}x{hh}"})
            continue
        wr, spread, side = whiteness(im)
        ext = "png" if (im.format or "").upper() == "PNG" else "jpg"
        name = hashlib.md5(url.encode()).hexdigest()[:10] + "." + ext
        path = os.path.join(a.out, name)
        with open(path, "wb") as f:
            f.write(data)
        saved += 1
        rows.append({"url": url, "purl": h["purl"], "file": path, "size": [w, hh],
                     "white": round(wr, 3), "spread": round(spread, 1), "title": h["t"][:80]})
        print(f"  ✓ {name} {w}x{hh} 白底率 {wr:.0%} {h['t'][:40]}", flush=True)

    json.dump({"query": a.q, "rows": rows}, open(os.path.join(a.out, "candidates.json"), "w"),
              ensure_ascii=False, indent=1)
    print(f"\n下载 {saved} 张 → {a.out}")


if __name__ == "__main__":
    main()
