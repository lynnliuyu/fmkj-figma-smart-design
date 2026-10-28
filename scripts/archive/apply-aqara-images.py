#!/usr/bin/env python3
"""把下载好的 Aqara 官网产品图写入产品库（管理员 API PATCH，只改 image + 描述追加来源）。
用法: apply-aqara-images.py --cookie "session=..." [--dry]
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

    rep = json.load(open(".local/product-catalog-collection/20261016-aqara-price/downloaded.json",
                         encoding="utf-8"))

    st, cur = api(args.cookie, "/api/products")
    if st != 200:
        print("读取产品列表失败", st, cur); sys.exit(1)
    products = cur.get("products") or cur.get("data") or []
    bySku = {p["sku"]: p for p in products}
    print(f"库内 {len(products)} 条\n")

    KEEP = ["name", "sku", "brand", "platform", "category", "unit", "price", "cost",
            "stock", "image", "description", "tags", "channels", "status"]

    # 下载记录里补上两处手工修正
    rep = [r for r in rep if r["sku"] not in ("AQARA-智能摄像机-G3-网关版",)]
    ok, fail = 0, []
    for r in rep:
        sku = r["sku"]; p = bySku.get(sku)
        if not p:
            fail.append((sku, "记录不存在")); continue
        # 已指向 aqara 目录的图则跳过（避免覆盖旧的合适图）
        if p.get("image") and "/aqara/" in p["image"] and "aqara-presence" not in p["image"]:
            continue
        src = f"｜图源：Aqara 官网 {r['title'].split('-')[0].strip()}（{r['pageUrl'].split('/')[-1]}）"
        desc = (p.get("description") or "")
        if "图源：Aqara 官网" not in desc:
            desc = (desc + src).strip("｜")
        payload = {k: p.get(k) for k in KEEP}
        payload["image"] = r["file"]
        payload["description"] = desc
        if p.get("mappingRevision"): payload["mappingRevision"] = p["mappingRevision"]
        if args.dry:
            print(f"[dry] {sku:34} → {r['file']}"); ok += 1; continue
        st, resp = api(args.cookie, f"/api/admin/products/{p['id']}", "PATCH", payload)
        if st == 200:
            ok += 1; print(f"✓ {sku:34} {r['size']:>10} {r['file'].split('/')[-1]}")
        else:
            fail.append((sku, f"{st} {resp}")); print(f"✗ {sku:34} {st} {resp}")
        time.sleep(0.12)

    print(f"\n成功 {ok} / 失败 {len(fail)}")
    for s, w in fail: print(f"  {s}: {w}")

if __name__ == "__main__":
    main()