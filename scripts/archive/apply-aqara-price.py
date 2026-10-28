#!/usr/bin/env python3
"""把已确认的 Aqara 价格与描述写入产品库（走管理员 API PATCH）。
用法: apply-aqara-price.py --cookie "session=..." [--dry]
"""
import json, sys, urllib.request, urllib.error, argparse, time

BASE = "https://localhost:3000"
BASE = "http://localhost:3000"

def api(cookie, path, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "Cookie": cookie, "Content-Type": "application/json",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:300]
    except Exception as e:
        return 0, str(e)[:200]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    changes = json.load(open(".local/product-catalog-collection/20261016-aqara-price/price-changes.json",
                             encoding="utf-8"))["changes"]

    st, cur = api(args.cookie, "/api/products")
    if st != 200:
        print("读取产品列表失败", st, cur); sys.exit(1)
    products = cur.get("products") or cur.get("data") or []
    byId = {p["id"]: p for p in products}
    print(f"库内产品 {len(products)} 条\n")

    # 基础字段白名单（PATCH 必须携带，否则会被清空）
    KEEP = ["name", "sku", "brand", "platform", "category", "unit", "price", "cost",
            "stock", "image", "description", "tags", "channels", "status"]
    ok, fail = 0, []
    for c in changes:
        after = c["after"]
        if "price" not in after:
            continue
        pid = c["productId"]
        cur_p = byId.get(pid)
        if not cur_p:
            fail.append((c["sku"], "记录不存在")); continue
        payload = {k: cur_p.get(k) for k in KEEP}
        payload["price"] = after["price"]
        if "description" in after:
            payload["description"] = after["description"]
        if "tags" in after:
            payload["tags"] = after["tags"]
        if "mappingRevision" in cur_p:
            payload["mappingRevision"] = cur_p["mappingRevision"]
        if args.dry:
            print(f"[dry] {c['sku']:44} ￥{after['price']}")
            ok += 1; continue
        st, resp = api(args.cookie, f"/api/admin/products/{pid}", "PATCH", payload)
        if st == 200:
            ok += 1
            print(f"✓ {c['sku']:44} ￥{after['price']}")
        else:
            fail.append((c["sku"], f"{st} {resp}"))
            print(f"✗ {c['sku']:44} {st} {resp}")
        time.sleep(0.12)

    print(f"\n成功 {ok} / 失败 {len(fail)}")
    for s, r in fail:
        print(f"  {s}: {r}")

if __name__ == "__main__":
    main()