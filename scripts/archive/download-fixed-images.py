#!/usr/bin/env python3
"""统一下载修正后的产品图：处理 PDF URL 渲染、尺寸校验、md5 去重、拼图抽检。
用法: download-fixed-images.py
"""
import json, os, re, ssl, time, urllib.request, urllib.parse, io, hashlib
from PIL import Image

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept-Language':'zh-CN,zh;q=0.9'}
DEST = "public/assets/products"
TMP = "/tmp/fixed_img"
BASE = ".local/product-catalog-collection/20261016-fix-images"

def enc(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc,
        urllib.parse.quote(p.path, safe="/%:@&=+$,~()!*';"), p.query, p.fragment))

def slug(sku):
    s = sku.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s

def headers_for(u):
    """部分站点有防盗链，需要 Referer"""
    h = dict(UA)
    host = urllib.parse.urlsplit(u).netloc.lower()
    if "orvibo" in host:
        h["Referer"] = "https://www.orvibo.com/"
    elif "dahuatech" in host:
        h["Referer"] = "https://store.dahuatech.com/"
    return h

def render_pdf(url, page, clip, zoom, out_p):
    """从 PDF 指定页渲染为 PNG。
    clip 形如 x1,y1,x2,y2（PDF 点，1pt=1/72inch）；若不是 4 个数字（如锚点名）则渲染整页。"""
    import pymupdf as fitz
    data = urllib.request.urlopen(urllib.request.Request(enc(url.split('#')[0]), headers=UA),
                                  timeout=40, context=CTX).read()
    doc = fitz.open(stream=data, filetype="pdf")
    pg = doc[max(0, page-1)]
    parts = clip.split(",") if clip else []
    r = fitz.Rect(*[float(v) for v in parts]) if len(parts) == 4 else pg.rect
    # 整页时裁到内容区，避免大片空白
    if len(parts) != 4:
        try:
            bbox = pg.get_image_bbox(doc[0].get_images(full=True)[0]) if pg.get_images(full=True) else None
        except Exception:
            bbox = None
        pix = pg.get_pixmap(matrix=fitz.Matrix(zoom or 3, zoom or 3), clip=r)
    else:
        pix = pg.get_pixmap(matrix=fitz.Matrix(zoom or 3, zoom or 3), clip=r)
    pix.save(out_p)
    doc.close()
    return out_p

def main():
    os.makedirs(TMP, exist_ok=True)
    items = json.load(open(f"{BASE}/merged.json", encoding="utf-8"))
    report, skipped, small = [], [], []

    for x in items:
        sku = x["sku"]; u = x.get("imageUrl")
        if not u:
            skipped.append((sku, "无图（代理已穷尽渠道）")); continue

        fn = slug(sku)
        try:
            if "#page=" in u or "#" in u:
                # 约定后缀：url#page=N&clip=x1,y1,x2,y2&zoom=N
                frag = urllib.parse.urlsplit(u).fragment
                q = dict(p.split("=", 1) for p in frag.split("&") if "=" in p)
                tmp_pdf = os.path.join(TMP, fn + ".png")
                render_pdf(u, int(q.get("page", 1)), q.get("clip"), int(q.get("zoom", 3)), tmp_pdf)
                im = Image.open(tmp_pdf)
                if min(im.size) < 400:
                    small.append((sku, f"{im.size} 偏小")); continue
                fp = os.path.join(DEST, fn + ".png")
                im.save(fp, "PNG", optimize=True)
            else:
                r = urllib.request.urlopen(urllib.request.Request(enc(u), headers=headers_for(u)),
                                           timeout=35, context=CTX)
                b = r.read()
                if len(b) < 3000:
                    skipped.append((sku, f"响应过小 {len(b)}B")); continue
                tmp = os.path.join(TMP, "t.img"); open(tmp, "wb").write(b)
                im = Image.open(tmp)
                if im.format == "GIF":
                    skipped.append((sku, "GIF 跳过")); continue
                w, h = im.size
                if min(w, h) < 400:
                    small.append((sku, f"{w}x{h} 短边<400")); continue
                if w / h > 3.2:
                    skipped.append((sku, f"超宽横幅 {w}x{h}")); continue
                fp = os.path.join(DEST, fn + (".png" if im.format == "PNG" else ".jpg"))
                if fp.endswith(".jpg"): im.convert("RGB").save(fp, "JPEG", quality=92, optimize=True)
                else: im.save(fp, "PNG", optimize=True)

            sz = Image.open(fp).size
            md5 = hashlib.md5(open(fp, "rb").read()).hexdigest()[:8]
            rel = "/" + os.path.relpath(fp, "public").replace(os.sep, "/")
            report.append({"sku": sku, "file": rel, "size": f"{sz[0]}x{sz[1]}",
                           "kb": os.path.getsize(fp) // 1024, "md5": md5,
                           "sourceUrl": u, "pageUrl": x.get("pageUrl", ""),
                           "source": x.get("source", ""), "verified": x.get("verified", "")})
            print(f"✓ {sku:34} {sz[0]}x{sz[1]:<5} {os.path.getsize(fp)//1024:>4}KB {rel.split('/')[-1]}")
        except Exception as e:
            skipped.append((sku, f"ERR {str(e)[:56]}"))
        time.sleep(0.4)

    # md5 去重检测
    print("\n=== md5 去重 ===")
    byMd5 = {}
    for r in report: byMd5.setdefault(r["md5"], []).append(r["file"])
    dup = {k: v for k, v in byMd5.items() if len(v) > 1}
    if dup:
        for k, v in dup.items():
            print(f"  ★ {k} 重复 {len(v)} 张:")
            for f in v: print(f"      {f}")
    else:
        print("  无重复 ✓")

    print(f"\n成功 {len(report)} | 跳过 {len(skipped)} | 尺寸不足 {len(small)}")
    for s, w in skipped: print(f"  跳过 {s}: {w}")
    for s, w in small: print(f"  尺寸不足 {s}: {w}")
    json.dump(report, open(f"{BASE}/downloaded.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 拼图
    if report:
        cell = 260; cols = 6; rows = (len(report)+cols-1)//cols
        c = Image.new("RGB", (cols*cell, rows*(cell+22)), "white")
        from PIL import ImageDraw; d = ImageDraw.Draw(c)
        for k, r in enumerate(report):
            im = Image.open("public" + r["file"]).convert("RGB"); im.thumbnail((cell-10, cell-10))
            x = (k % cols)*cell+5; y = (k//cols)*(cell+22)+5
            c.paste(im, (x, y)); d.text((x, y+cell-14), r["sku"][:32], fill="black")
        c.save("/tmp/fixed_montage.jpg", quality=88)
        print("\n拼图: /tmp/fixed_montage.jpg")

if __name__ == "__main__":
    main()