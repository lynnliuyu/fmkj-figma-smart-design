#!/usr/bin/env python3
"""把补采的产品图写入数据库（管理员 API PATCH）"""
import json, os, sys, time, urllib.request, argparse

BASE = ".local/product-catalog-collection/20261016-fill-images"

def api(cookie, path, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method,
        headers={"Cookie": cookie, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    items = json.load(open(f"{BASE}/downloaded.json", encoding="utf-8"))
    # 合并重抓后的 3 张（覆盖原记录）
    picked = json.load(open("/tmp/aq_picked.json", encoding="utf-8"))
    bySku = {x["sku"]: x for x in items}
    for p in picked:
        bySku[p["sku"]] = {**bySku.get(p["sku"], {}), **p}
    items = list(bySku.values())

    # 文件必须真实存在
    items = [x for x in items if x.get("file") and os.path.exists("./public" + x["file"])]
    print(f"待写入 {len(items)} 条{'（干跑）' if a.dry else ''}\n")

    prods = api(a.cookie, "/api/products")
    prods = prods.get("products") or prods.get("data") or []
    bySkuDb = {p["sku"]: p for p in prods}

    KEEP = ["name","sku","brand","platform","category","unit","price","cost","stock",
            "image","description","tags","channels","status"]
    ok = fail = 0
    for x in items:
        p = bySkuDb.get(x["sku"])
        if not p:
            print(f"✗ 库中无此 SKU {x['sku']}"); fail += 1; continue
        if p.get("image"):
            print(f"· 已有图  {x['sku'][:30]:32}{p['image']}"); continue
        old = (p.get("description") or "")
        note = f"｜图源：{x.get('source') or x.get('sourceUrl','')[:60]}"
        if x.get("note"):
            note += f"｜{x['note']}"
        pl = {k: p.get(k) for k in KEEP}
        pl["image"] = x["file"]
        tags = [t for t in (p.get("tags") or []) if t != "图片待补"]
        pl["tags"] = tags
        pl["description"] = (old + note).strip("｜")
        if p.get("mappingRevision"):
            pl["mappingRevision"] = p["mappingRevision"]
        print(f"{'○' if a.dry else '✓'} {x['sku'][:30]:32}{x.get('size',''):>11}  {x['file'].split('/')[-1][:38]}")
        if not a.dry:
            try:
                api(a.cookie, f"/api/admin/products/{p['id']}", "PATCH", pl)
                ok += 1
            except Exception as e:
                print(f"    ERR {str(e)[:70]}"); fail += 1
                continue
        else:
            ok += 1
        time.sleep(0.12)
    print(f"\n{'将写入' if a.dry else '已写入'} {ok} 条 | 失败 {fail}")

if __name__ == "__main__":
    main()