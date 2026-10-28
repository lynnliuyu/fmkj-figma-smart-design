#!/usr/bin/env python3
"""下载补采的产品图：重试 + 尺寸校验 + md5 跨产品去重 + 拼图抽检"""
import json, os, re, ssl, time, hashlib, threading, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

BASE = ".local/product-catalog-collection/20261016-fill-images"
DEST = "public/assets/products"
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9'}

def ref_for(u):
    """Referer 策略（实测）：
    · aliyuncs.com 图床（锐捷）：带任何 Referer 都 403，必须不带
    · smzdm 图床：必须带 https://wiki.smzdm.com/ 否则 403
    · 官网 CDN：带同域或省略一般都行，省略最省事
    """
    host = urllib.parse.urlsplit(u).netloc.lower()
    if "aliyuncs.com" in host or "aliyun" in host:
        return None            # 阿里云 OSS：必须无 Referer
    if "smzdm" in host:
        return "https://wiki.smzdm.com/"
    return None                # 其余一律不带，最大限度避免防盗链误判

BAD = ('logo', 'icon', 'qrcode', 'weibo', 'weixin', 'erweima', 'qr_', 'banner', 'foot', 'head')

def enc(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc,
        urllib.parse.quote(p.path, safe="/%:@&=+$,~()!*';[]"), p.query, p.fragment))

def slug(sku, used):
    s = sku.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    if not s: s = 'img'
    # 中文全被替换会造成不同 SKU 撞名，加短 hash 保证唯一
    if s in used:
        s = f"{s}-{hashlib.md5(sku.encode()).hexdigest()[:4]}"
    used.add(s)
    return s

def fetch(u, tries=4):
    last = None
    for k in range(tries):
        try:
            hd = dict(UA)
            rf = ref_for(u)
            if rf: hd['Referer'] = rf
            return urllib.request.urlopen(urllib.request.Request(enc(u), headers=hd),
                                          timeout=35, context=CTX).read()
        except Exception as e:
            last = e; time.sleep(1.2 * (k + 1))
    raise last

def one(item, fname):
    url = item.get("imageUrl")
    if not url: return None
    sku = item["sku"]
    try:
        b = fetch(url)
    except Exception as e:
        return {"sku": sku, "ok": False, "err": f"下载失败 {str(e)[:60]}"}
    if len(b) < 4000:
        return {"sku": sku, "ok": False, "err": f"过小 {len(b)}B"}
    tmp = f"/tmp/_fill_{os.getpid()}_{threading.get_ident() % 10000}.img"; open(tmp, "wb").write(b)
    try:
        im = Image.open(tmp)
        im.load()   # 提前触发解码，截断文件在这里报错而不是存图时
    except Exception as e:
        try: os.remove(tmp)
        except OSError: pass
        return {"sku": sku, "ok": False, "err": f"解码失败 {str(e)[:44]}"}
    w, h = im.size
    if w / h > 3.2:
        return {"sku": sku, "ok": False, "err": f"横幅 {w}x{h}"}
    if min(w, h) < 300:
        return {"sku": sku, "ok": False, "err": f"尺寸小 {w}x{h}"}
    ext = ".png" if im.format == "PNG" else ".jpg"
    fn = fname + ext
    fp = os.path.join(DEST, fn)
    if ext == ".jpg":
        im.convert("RGB").save(fp, "JPEG", quality=92, optimize=True)
    else:
        im.save(fp, "PNG", optimize=True)
    try:
        sz = Image.open(fp).size
    except Exception as e:
        return {"sku": sku, "ok": False, "err": f"存图后校验失败 {str(e)[:40]}"}
    try: os.remove(tmp)
    except OSError: pass
    md5 = hashlib.md5(open(fp, "rb").read()).hexdigest()[:10]
    return {"sku": sku, "ok": True, "file": "/" + fp.replace("public/", ""),
            "size": f"{sz[0]}x{sz[1]}", "kb": os.path.getsize(fp) // 1024, "md5": md5,
            "brand": item.get("brand", ""), "productName": item.get("productName", ""),
            "source": item.get("source", ""), "sourceUrl": url, "pageUrl": item.get("pageUrl", ""),
            "verified": item.get("verified", ""), "note": item.get("note", "")}

def main():
    os.makedirs(DEST, exist_ok=True)
    items = json.load(open(f"{BASE}/merged.json", encoding="utf-8"))
    ok = [x for x in items if x.get("imageUrl")]
    print(f"待下载 {len(ok)} 张（串行 + 重试）\n")
    used = set(os.path.splitext(f)[0] for f in os.listdir(DEST)) if os.path.isdir(DEST) else set()
    names = [slug(x["sku"], used) for x in ok]
    dupn = [n for n in names if names.count(n) > 1]
    if dupn:
        print(f"⚠ 文件名仍冲突: {set(dupn)}")
    results = []
    for x, nm in zip(ok, names):
        results.append(one(x, nm))
    good = [r for r in results if r and r.get("ok")]
    bad = [r for r in results if r and not r.get("ok")]
    for r in sorted(good, key=lambda x: x["sku"]):
        print(f"✓ {r['sku'][:30]:32} {r['size']:>11} {r['kb']:>5}KB  {r['md5']}  {r['productName'][:30]}")
    print()
    for r in bad:
        print(f"✗ {r['sku'][:30]:32} {r['err']}")
    # md5 重复检查
    seen = {}
    for r in good:
        seen.setdefault(r["md5"], []).append(r["sku"])
    dup = {k: v for k, v in seen.items() if len(v) > 1}
    print(f"\nmd5 重复组 {len(dup)}:")
    for k, v in dup.items():
        print(f"  {k}: {v}")
    json.dump(good, open(f"{BASE}/downloaded.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump([r for r in results if r], open(f"{BASE}/failed.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n成功 {len(good)} / 失败 {len(bad)} → {BASE}/downloaded.json")

if __name__ == "__main__":
    main()