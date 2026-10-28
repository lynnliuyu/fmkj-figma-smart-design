#!/usr/bin/env python3
"""把抠图结果写入商品展示图库（product_visual_assets）。

关键设计：
  · 只写 visual.image，**不动 products.image** —— 原图保留可追溯
  · reviewStatus 保持 pending —— 抠图只去背景，不代表「准确型号净图」已核验
  · evidence 写清来源与处理方式，满足可复核要求
  · 点位图优先读 visualAsset.image，所以写入后自动生效

只处理视觉抽检合格的图（triaged ok + suspect 中人工确认的）。
"""
import json, os, urllib.request, argparse, time

TRIAGE = ".local/image-cutout/triage.json"
BAD = "/tmp/bad_imgs.json"

# suspect 档里人工确认可用的（视觉抽检时逐张看过）
SUSPECT_ACCEPT = [
    "/assets/products/ruijie/rg-eg105g-p-e-v2.jpg",
    "/assets/products/ruijie/rg-eg210g-p-v2.jpg",
    "/assets/products/ruijie/rg-es110gds-p-e.jpg",
    "/assets/products/ruijie/rg-nbc.png",
    "/assets/products/ruijie/rg-nbr6135-e.jpg",
    "/assets/products/ruijie/rg-nbs3000-26g2fp.png",
    "/assets/products/ruijie/rg-ap820-av3.png",
    "/assets/products/sumi/sumi-mesh-2-0.png",
    "/assets/products/sumi/sumi-mesh2-0.png",
    "/assets/products/sumi/sumi-1.png",
    "/assets/products/sumi/sumi-socket-trk.png",
    "/assets/products/sumi/sumi-y1.png",
    "/assets/products/loock-v5-air.jpg",
    "/assets/products/loock-v7-max-product.png",
    "/assets/products/xlsx-clean-0065-1fbdb8b415.jpg",
    "/assets/products/imported/xlsx-clean-0125-7578eded5b.jpg",
    "/assets/products/imported/xlsx-clean-0312-fd9e5cd1b7.jpg",
    "/assets/products/imported/xlsx-clean-0313-bd6d3fa664.jpg",
]

KEEP = ["name", "sku", "brand", "platform", "category", "unit", "price", "cost",
        "stock", "image", "description", "tags", "channels", "status"]

# ★ 跨品牌共用图：抠图只改背景，不修正「图用错品牌」。
# 这些 SKU 的图属于别的品牌，写展示图等于把错误固化，必须排除、留待重新采集。
WRONG_BRAND_SKUS = {
    # aqara-dimmer-controller-t2.png 被当成 HDL 继电器 / 易来调光开关
    "HDL-RELAY-8CH", "YEELIGHT-DIMMER-SWITCH-PRO", "AQ-H1PRO-3G-NEUTRAL",
    # aqara-s1-plus-panel-product.png 被当成 HDL Granite 面板
    "HDL-GRANITE-PANEL",
    # aqara-camera-g5-pro-official.webp 被当成大华摄像机 / NVR
    "DAHUA-4MP-FULLCOLOR", "DAHUA-NVR-8POE",
}


def api(cookie, path, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method,
        headers={"Cookie": cookie, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    triage = json.load(open(TRIAGE, encoding="utf-8"))
    bad = set(json.load(open(BAD, encoding="utf-8")))
    accept_extra = set(SUSPECT_ACCEPT)

    # 可入库 = (triage ok 且不在剔除表) 或 (suspect 且人工确认)
    usable = []
    for x in triage:
        if x["status"] != "ok" or not x.get("out"):
            continue
        if x["img"] in bad:
            continue
        if x["triage"] == "ok" or x["img"] in accept_extra:
            usable.append(x)

    print(f"可入库 {len(usable)} 张（ok {sum(1 for x in triage if x['triage']=='ok')} "
          f"- 剔除 {len(bad)} + suspect 人工确认 {len(accept_extra)}）")

    # 检查输出文件都在
    missing = [x for x in usable if not os.path.exists("./public" + x["out"])]
    if missing:
        print(f"⚠ 输出文件缺失 {len(missing)} 张，跳过")
        usable = [x for x in usable if os.path.exists("./public" + x["out"])]

    # 读产品，建立 image → [productIds] 映射
    prods = api(a.cookie, "/api/admin/products")
    prods = prods.get("products") or prods.get("data") or []
    byImage = {}
    for p in prods:
        if p.get("image"):
            byImage.setdefault(p["image"], []).append(p)
    print(f"产品 {len(prods)} 条 | 涉及图片 {len(byImage)} 张\n")

    tasks = []
    excluded = []
    for x in usable:
        for p in byImage.get(x["img"], []):
            if p["sku"] in WRONG_BRAND_SKUS:
                excluded.append((x, p))
                continue
            tasks.append((x, p))
    if excluded:
        print(f"\n排除 {len(excluded)} 条跨品牌错图（不改背景，留待换图）：")
        for x, p in excluded:
            print(f"  {p['sku']:28}{x['img'].split('/')[-1]}")
    print(f"需写展示图的产品记录 {len(tasks)} 条（同一图可能被多条产品共用）")
    if a.limit:
        tasks = tasks[:a.limit]
        print(f"本次限 {a.limit} 条")

    ok = skip = fail = 0
    errors = {}
    rev_cache = {}
    for x, p in tasks:
        # ★ 列表 API 不返回 visualAsset，必须用单产品接口读真实 revision，
        #   否则重跑时 expectedRevision 恒为 0，已写入的记录会全部 409。
        if p["id"] not in rev_cache:
            try:
                v = api(a.cookie, f"/api/admin/products/{p['id']}/visual")
                rev_cache[p["id"]] = v.get("visual") or {}
            except Exception:
                rev_cache[p["id"]] = {}
        cur = rev_cache.get(p["id"])
        # 已有展示图且指向同一张抠图 → 跳过（幂等）
        if cur and cur.get("image") == x["out"]:
            skip += 1
            continue
        evidence = (
            f"背景已去除，仅保留产品本体（macOS Vision 主体提取 / 纯色底泛洪，处理于 2026-10-21）。"
            f"原图：{x['img']}。抠图仅移除背景，未改变产品外观、颜色与结构；"
            f"未按厂家型号页重新核图，图片状态保持待核。"
            + (f" 原图主体占画面 {x['cover']:.1%}。" if x.get("cover") is not None else "")
        )
        body = {
            "image": x["out"],
            "sourceImage": x["img"],
            "crop": None,
            "scale": 1,
            "reviewStatus": "pending",
            "evidence": evidence,
            "expectedRevision": (cur or {}).get("revision", 0) or 0,
        }
        if a.dry:
            if ok < 8:
                print(f"○ {p['sku'][:28]:30}{x['out'].split('/')[-1][:34]:36}rev={body['expectedRevision']}")
            ok += 1
            continue
        try:
            api(a.cookie, f"/api/admin/products/{p['id']}/visual", "PATCH", body)
            ok += 1
            if ok % 50 == 0:
                print(f"  ... {ok}/{len(tasks)}", flush=True)
            time.sleep(0.05)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:150]
            errors.setdefault(msg, []).append(p["sku"])
            fail += 1
        except Exception as e:
            errors.setdefault(str(e)[:80], []).append(p["sku"])
            fail += 1

    print(f"\n{'将写入' if a.dry else '已写入'} {ok} | 跳过（已是最新）{skip} | 失败 {fail}")
    if errors:
        print("\n错误归类:")
        for m, skus in list(errors.items())[:5]:
            print(f"  [{len(skus)} 条] {m[:120]}")
            print(f"    {', '.join(skus[:4])}")

    # 存清单
    json.dump([{"sku": p["sku"], "productId": p["id"], "image": x["out"], "source": x["img"]}
               for x, p in tasks], open(".local/image-cutout/applied.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()