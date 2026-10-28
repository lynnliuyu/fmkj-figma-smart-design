#!/usr/bin/env python3
"""给非单件记录（房型套餐 / 配件 / 灯带裸条）打标签，明确它们不参与单品选型。
不设 deviceTypeId —— catalogKind 只有 legacy/series/sku，字典里没有「套装」概念。
用法: tag-non-single.py --cookie "session=..." [--dry]
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

REASON_TAG = {
    "房型套餐": "非单品",
    "套餐（件数拼接）": "非单品",
    "套装": "非单品",
    "配件包": "配件",
    "灯带裸条（不含电源，非独立件）": "裸条无电源",
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    d = json.load(open(".local/product-catalog-collection/20261016-type-gap/plan2.json", encoding="utf-8"))
    parked = d["parked"]

    st, cur = api(args.cookie, "/api/products")
    if st != 200:
        print("读取失败", st, cur); sys.exit(1)
    byId = {p["id"]: p for p in (cur.get("products") or cur.get("data") or [])}
    KEEP = ["name", "sku", "brand", "platform", "category", "unit", "price", "cost",
            "stock", "image", "description", "tags", "channels", "status"]

    ok, fail = 0, []
    for x in parked:
        p = byId.get(x["id"])
        if not p:
            fail.append((x["sku"], "记录不存在")); continue
        tags = list(p.get("tags") or [])
        want = REASON_TAG.get(x["reason"], "待归类")
        add = []
        if want not in tags: add.append(want)
        if want in ("非单品", "配件") and "不参与选型" not in tags: add.append("不参与选型")
        if not add:
            continue
        payload = {k: p.get(k) for k in KEEP}
        payload["tags"] = tags + add
        note = f"｜未归设备类型：{x['reason']}"
        if note.strip("｜") not in (p.get("description") or ""):
            payload["description"] = (p.get("description") or "") + note
        if p.get("mappingRevision"): payload["mappingRevision"] = p["mappingRevision"]
        if args.dry:
            print(f"[dry] {x['sku'][:30]:30} +{'/'.join(add)}  ({x['reason']})"); ok += 1; continue
        st, resp = api(args.cookie, f"/api/admin/products/{p['id']}", "PATCH", payload)
        if st == 200:
            ok += 1
            if ok <= 8 or x["reason"] == "房型套餐":
                pass
        else:
            fail.append((x["sku"], f"{st} {resp}"))
        time.sleep(0.1)
    print(f"\n成功 {ok} / 失败 {len(fail)}")
    for s, r in fail: print(f"  {s}: {r}")

    import collections
    print("\n=== 标记分布 ===")
    for k, n in collections.Counter(REASON_TAG.get(x["reason"], "待归类") for x in parked).most_common():
        print(f"  {k:14} {n}")

if __name__ == "__main__":
    main()