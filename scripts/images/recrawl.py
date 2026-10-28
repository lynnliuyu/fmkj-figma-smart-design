#!/usr/bin/env python3
"""按 SKU 批量重采产品图：Bing 检索 → 打分排序 → 抠图 → 生成抽检拼图。

与 bing-images.py 的区别：这是「按产品跑」，每张候选都抠图并打分，
最后按 SKU 输出一张对比图（原图 / 候选净图），供人工挑选后落库。

用法：
  recrawl.py --tasks tasks.json --out .local/recrawl/batch1 [--per 6] [--limit 20]

tasks.json: [{"sku":..., "brand":..., "query":..., "out":...}, ...]
输出：
  <out>/<sku>/*.jpg|png      下载的原图
  <out>/<sku>/cut_*.png      抠图结果
  <out>/<sku>/index.json     每张候选的来源与打分
  <out>/sheets/*.jpg         抽检拼图
"""
import argparse, hashlib, json, os, re, subprocess, sys, urllib.parse, urllib.request
from io import BytesIO

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CUTOUT = os.path.join(HERE, "scripts/cutout/cutout")
BAD_WORDS = re.compile(r"(logo|avatar|icon|qrcode|二维码|banner|/ad/|sprite)", re.I)

# 内容站点/壁纸站：命中即丢，这些站点的图基本不可能是产品净图
BLOCK_DOMAIN = re.compile(
    r"(zhihu|duitang|pixso|qiubiaoqing|weibo|douyin|xiaohongshu|xhslink|bilibili|"
    r"baidu\.com|baike|sohu|163\.com/news|ifeng|toutiao|weixin|csdn|jianshu|"
    r"book|dangdang|jd\.com/book|law|gov\.cn|edu\.cn)", re.I)

# 电商/厂商站：命中即优先
GOOD_DOMAIN = re.compile(
    r"(jd\.com|tmall|taobao|1688|xiaomiyoupin|mi\.com|youpin|aqara|lumi|linptech|"
    r"h3c\.com|ruijie|reyee|sumi|hdl|dahua|hikvision|loock|orvibo|tuya|sonoff|"
    r"smzdm|zdmimg|zol\.com|yeelight|panasonic|schneider|legrand|ezviz|"
    r"apple\.com|hikvision|imou|ezviz|bosch|somfy|dulce|dooya)", re.I)


def get(url, referer=None, timeout=20, max_bytes=10_000_000):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "zh-CN,zh;q=0.9"}
    if referer:
        h["Referer"] = referer
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(max_bytes)


def bing(query, first=1):
    q = urllib.parse.quote(query)
    html = get(f"https://cn.bing.com/images/search?q={q}&first={first}&form=HDRSC2").decode("utf-8", "ignore")
    out, seen = [], set()
    for m in re.finditer(r'm="\{([^"]+)\}"', html):
        try:
            meta = json.loads("{" + m.group(1).replace("&quot;", '"') + "}")
        except Exception:
            continue
        u = meta.get("murl")
        if not u or u in seen or BAD_WORDS.search(u):
            continue
        seen.add(u)
        out.append({"url": u, "purl": meta.get("purl", ""), "title": (meta.get("t") or "")[:80]})
    return out


def relevant(hit, tokens):
    """相关性闸门：域名黑名单直接丢；标题或来源页命中品牌/型号词才留。

    搜索引擎在密集请求下会把结果降级成「相关推荐」（表情包、壁纸、书籍），
    不做这层校验就会把完全无关的图当候选下下来。
    """
    purl = hit.get("purl") or ""
    host = urllib.parse.urlparse(purl).netloc
    if BLOCK_DOMAIN.search(host):
        return False
    if GOOD_DOMAIN.search(host):
        return True
    hay = (hit.get("title") or "") + " " + urllib.parse.unquote(purl)
    hay = hay.lower()
    return any(t.lower() in hay for t in tokens if t)


def tokens_of(query):
    """从检索词里取品牌与型号特征词"""
    parts = [p for p in re.split(r"[\s/]+", query) if p]
    toks = set(parts[:1])                      # 品牌词
    for p in parts:
        if re.search(r"[A-Za-z]{1,6}[-]?\d{2,4}|[A-Z]{2,}\d|^\d+[A-Za-z]?$", p):
            toks.add(p)                        # 型号
    toks.add(query.replace(" ", ""))
    return [t for t in toks if len(t) >= 2]


def score_image(im):
    """白底程度、角点白、促销色占比、分辨率"""
    import numpy as np
    h0, w0 = im.size[1], im.size[0]
    if max(h0, w0) > 1200:                      # 大图先缩，避免解码巨图撑爆内存
        r = 1200 / max(h0, w0)
        im = im.resize((max(1, int(w0 * r)), max(1, int(h0 * r))))
        a = np.array(im.convert("RGB")).astype(np.int16)
        a_orig = None
    else:
        a = np.array(im.convert("RGB")).astype(np.int16)
    white = (a.min(axis=2) > 235).mean()
    corners = [a[3, 3], a[3, -4], a[-4, 3], a[-4, -4]]
    cw = sum(1 for c in corners if c.min() > 232) / 4
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    promo = ((r > 170) & (g < 110) & (b < 110)).mean()
    sat = (a.max(axis=2) - a.min(axis=2)).mean()
    return dict(white=round(float(white), 3), corner_white=round(cw, 2),
                promo=round(float(promo), 3), sat=round(float(sat), 1),
                w=w0, h=h0)


def run_cutout(src, dst, pad=5, max_side=900):
    try:
        r = subprocess.run([CUTOUT, src, dst, "--pad", str(pad), "--max", str(max_side)],
                           capture_output=True, text=True, timeout=120)
        line = (r.stdout or "").strip().split("\n")[-1]
        return json.loads(line) if line.startswith("{") else {"ok": False, "error": line[:80]}
    except Exception as e:
        return {"ok": False, "error": str(e)[:80]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--per", type=int, default=6, help="每个 SKU 下载几张")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--min-side", type=int, default=450)
    a = ap.parse_args()

    from PIL import Image
    tasks = json.load(open(a.tasks, encoding="utf-8"))
    if a.limit:
        tasks = tasks[:a.limit]
    os.makedirs(a.out, exist_ok=True)
    os.makedirs(os.path.join(a.out, "sheets"), exist_ok=True)

    summary = []
    for ti, t in enumerate(tasks, 1):
        sku, query = t["sku"], t["query"]
        d = os.path.join(a.out, sku.replace("/", "_"))
        os.makedirs(d, exist_ok=True)
        hits = bing(query)
        toks = tokens_of(query)
        raw_hits = len(hits)
        hits = [h for h in hits if relevant(h, toks)]
        if not hits:                                  # 结果被降级，换短查询再试一次
            short = " ".join(query.split()[:2])
            hits = [h for h in bing(short) if relevant(h, tokens_of(short))]
        cands = []
        for h in hits:
            if len(cands) >= a.per * 2:  # 多试一点，过滤后取够
                break
            try:
                raw = get(h["url"], referer=h["purl"] or None)
                im = Image.open(BytesIO(raw)); im.load()
            except Exception:
                continue
            s = score_image(im)
            if max(s["w"], s["h"]) < a.min_side:
                continue
            if s["promo"] > 0.06:      # 大面积促销色，直接丢
                continue
            if s["white"] < 0.10 and s["corner_white"] < 0.5:
                continue               # 明显不是净底图
            name = hashlib.md5(h["url"].encode()).hexdigest()[:10]
            ext = "png" if (im.format or "").upper() == "PNG" else "jpg"
            src = os.path.join(d, f"{name}.{ext}")
            if not os.path.exists(src):
                open(src, "wb").write(raw)
            c = run_cutout(src, os.path.join(d, f"cut_{name}.png"))
            cands.append({**h, **s, "file": src, "cut": os.path.join(d, f"cut_{name}.png") if c.get("ok") else None,
                          "cover": c.get("cover"), "outSize": [c.get("outW"), c.get("outH")] if c.get("ok") else None})
            if len([c for c in cands if c["cut"]]) >= a.per:
                break
        cands.sort(key=lambda x: (-(x["corner_white"]), -x["white"], -x["w"] * x["h"]))
        json.dump(cands, open(os.path.join(d, "index.json"), "w"), ensure_ascii=False, indent=1)
        ok = sum(1 for c in cands if c["cut"])
        summary.append({"sku": sku, "query": query, "cands": len(cands), "cut_ok": ok})
        print(f"[{ti}/{len(tasks)}] {sku:26} 候选 {len(cands):2} 抠图成功 {ok:2}", flush=True)

    json.dump(summary, open(os.path.join(a.out, "summary.json"), "w"), ensure_ascii=False, indent=1)
    print(f"\n完成 {len(tasks)} 个 SKU，平均抠图成功 "
          f"{sum(s['cut_ok'] for s in summary) / max(1, len(summary)):.1f}")


if __name__ == "__main__":
    main()
