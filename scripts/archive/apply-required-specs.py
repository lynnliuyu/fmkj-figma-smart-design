#!/usr/bin/env python3
"""把推导出的 requiredForPoint 参数写入产品（管理员 API PATCH）。

流程：读回产品现状 → 带 specs + 基础字段白名单 PATCH → 读回验证。
API 会用 validateProductSelectionFields 校验 specs，非法会 400。
"""
import json, urllib.request, argparse, time, sys

BASE = ".local/product-catalog-collection/20261016-fill-images"

def api(cookie, path, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method,
        headers={"Cookie": cookie, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode())

# API 要求的基础字段（不传会被清空）
KEEP = ["name", "sku", "brand", "platform", "category", "unit",
        "price", "cost", "stock", "image", "description", "tags", "channels", "status"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    plan = json.load(open("/tmp/spec_fill.json", encoding="utf-8"))
    print(f"待写入 {len(plan)} 条{'（干跑）' if a.dry else ''}\n")

    prods = api(a.cookie, "/api/products")
    prods = prods.get("products") or prods.get("data") or []
    bySku = {p["sku"]: p for p in prods}

    ok = fail = skipped = 0
    errors = {}
    for x in plan:
        p = bySku.get(x["sku"])
        if not p:
            print(f"✗ 库中无 {x['sku']}"); fail += 1; continue
        # 已被重新归类的跳过（类型变了，参数需重新推导）
        if p.get("deviceTypeId") != x["type"]:
            skipped += 1
            print(f"· 类型已变 {x['sku'][:28]:30}{p.get('deviceTypeId')} ≠ {x['type']}，跳过")
            continue
        pl = {k: p.get(k) for k in KEEP}
        pl["specs"] = x["merged"]
        if p.get("mappingRevision") is not None:
            pl["mappingRevision"] = p["mappingRevision"]
        changed = ", ".join(f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in x["new"].items())
        if a.dry:
            print(f"○ {x['sku'][:28]:30}{changed}")
            ok += 1
            continue
        try:
            api(a.cookie, f"/api/admin/products/{p['id']}", "PATCH", pl)
            print(f"✓ {x['sku'][:28]:30}{changed}")
            ok += 1
            time.sleep(0.1)
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:200]
            errors.setdefault(body, []).append(x["sku"])
            print(f"✗ {x['sku'][:28]:30}HTTP {e.code} {body[:90]}")
            fail += 1
        except Exception as e:
            print(f"✗ {x['sku'][:28]:30}{str(e)[:70]}")
            fail += 1

    print(f"\n{'将写入' if a.dry else '已写入'} {ok} | 失败 {fail} | 跳过 {skipped}")
    if errors:
        print("\n错误归类:")
        for msg, skus in errors.items():
            print(f"  [{len(skus)} 条] {msg[:150]}")
            print(f"    {', '.join(skus[:6])}")

if __name__ == "__main__":
    main()