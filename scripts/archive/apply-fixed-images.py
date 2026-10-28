#!/usr/bin/env python3
"""把重采的产品图写入产品库（管理员 API PATCH）。
用法: apply-fixed-images.py --cookie "session=..." [--dry]
"""
import json, sys, time, urllib.request, urllib.error, argparse

def api(cookie, path, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method,
                                 headers={"Cookie": cookie, "Content-Type": "application/json",
                                          "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:250]
    except Exception as e:
        return 0, str(e)[:200]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    rep = json.load(open(".local/product-catalog-collection/20261016-fix-images/downloaded.json",
                         encoding="utf-8"))
    # 去重（同 SKU 保留最后一条）
    bySku = {}
    for r in rep: bySku[r["sku"]] = r
    rep = list(bySku.values())
    print(f"待写入 {len(rep)} 条\n")

    st, cur = api(args.cookie, "/api/products")
    if st != 200:
        print("读取产品列表失败", st, cur); sys.exit(1)
    products = cur.get("products") or cur.get("data") or []
    byId = {p["id"]: p for p in products}
    bySkuName = {p["sku"]: p for p in products}

    KEEP = ["name", "sku", "brand", "platform", "category", "unit", "price", "cost",
            "stock", "image", "description", "tags", "channels", "status"]

    ok, fail, missing = 0, [], []
    for r in rep:
        sku = r["sku"]
        p = bySkuName.get(sku) or byId.get(sku)
        if not p:
            missing.append(sku); continue
        oldImg = p.get("image") or ""
        src = f"｜图源：{r.get('source','官网')}（{r.get('pageUrl') or r.get('sourceUrl','')}）"
        desc = p.get("description") or ""
        if "图源：" not in desc:
            desc = (desc + src).strip("｜")
        payload = {k: p.get(k) for k in KEEP}
        payload["image"] = r["file"]
        payload["description"] = desc
        if p.get("mappingRevision"): payload["mappingRevision"] = p["mappingRevision"]
        if args.dry:
            print(f"[dry] {sku:34} {oldImg.split('/')[-1] or '(无)':38} → {r['file'].split('/')[-1]}")
            ok += 1; continue
        st, resp = api(args.cookie, f"/api/admin/products/{p['id']}", "PATCH", payload)
        if st == 200:
            ok += 1
            print(f"✓ {sku:34} {r['size']:>10}  {oldImg.split('/')[-1] or '(无)'} → {r['file'].split('/')[-1]}")
        else:
            fail.append((sku, f"{st} {resp}"))
        time.sleep(0.12)

    print(f"\n成功 {ok} | 失败 {len(fail)} | 库中无此SKU {len(missing)}")
    for s, w in fail: print(f"  失败 {s}: {w}")
    for s in missing: print(f"  缺记录 {s}")

if __name__ == "__main__":
    main()