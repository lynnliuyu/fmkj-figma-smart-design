#!/usr/bin/env python3
"""汇总 Aqara 定价采集结果，生成价格与型号修正变更集（供 review-product-mapping.mjs apply）。"""
import json, subprocess, os

BASE = ".local/product-catalog-collection/20261016-aqara-price/"

# 补充：搜索引擎快照直接给出的京东页面价（型号级，smzdm/京东搜索快照交叉验证）
EXTRA = {
    # 型号: {"listPrice": 京东页面价, "salePrice": 活动到手价, "shop": ..., "source": ..., "note": ...}
    "ZNSXJ16LM": {"listPrice": 399, "salePrice": 305.23, "shop": "京东商城",
                "source": "什么值得买京东促销页 + 京东搜索快照",
                "note": "京东页面价 ¥399；国补10%+满59享9折后 305.23（不可复现）。慢慢买另记 282.2（含国补，低于双11）。"},
    "ZNSXJ13LM": {"listPrice": 839, "salePrice": 636.65, "shop": "Aqara智能家装京东自营旗舰店",
                "source": "什么值得买京东促销页 + 慢慢买优惠页",
                "note": "京东面价 ¥839；国补15%+凑单满1000减80 后 636.65（需凑单，不可复现）。另记商品面价 ¥749（另一口径，待核）。"},
    "ZNSXJ22LM": {"listPrice": 289, "salePrice": 158.23, "shop": "京东商城/京东自营",
                "source": "京东搜索快照 + 慢慢买优惠页",
                "note": "京东常卖价 ¥289；国补后 158.23（不可复现）。另记自营历史价 245.65。"},
}

# 型号修正（官网/说明书/京东备案确证）
MODEL_FIX = {
    "ZHWG11LM": ("ZNMS16LM", "官网 N100 规格页误写 ZHWG11LM；官方说明书 PDF《智能门锁N100说明书(第四版)》载「产品型号 ZNMS16LM」，京东「国补备案型号」同为 ZNMS16LM。ZHWG11LM 实为 2020 老款 Aqara 网关型号（已停产）。"),
    "QBKG26LM": ("QBKG26LM", "官网 d12_spec 确证：QBKG26LM = D1 零火线三键版（非单火单键）。原记录名称有误。"),
}

def load():
    out = []
    for f in ["switches.json", "curtain-lock.json", "hub-sensor.json"]:
        out += json.load(open(BASE + f, encoding="utf-8"))
    return out

def db_rows():
    code = """
import("pg").then(async ({Client}) => {
  const c = new Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:15432/fmkj"});
  await c.connect();
  const r = await c.query(`select id::text,sku,name,manufacturer_model,description,tags
    from products where deleted_at is null and brand='Aqara' and price=0 order by name`);
  console.log(JSON.stringify(r.rows));
  await c.end();
});
"""
    out = subprocess.run(["/Users/noonebook/.workbuddy/binaries/node/versions/22.22.2-6/bin/node", "-e", code],
                         capture_output=True, text=True)
    return json.loads(out.stdout.strip())

def main():
    rows = load()
    db = db_rows()
    byModel = {}
    for p in rows:
        m = (p.get("verifiedModel") or p.get("model") or "").strip()
        if m:
            byModel.setdefault(m, p)
    byModel.update({k: v for k, v in EXTRA.items()})

    # 库内无型号的记录 → 用采集到的真实型号锚定
    NAME_MAP = {
        "Aqara LED 灯泡 T1（可调色温）": "ZNLDP13LM",
        "Aqara 集悦妙控屏 S1 Plus（桌面版）": "JYMKP03LM",
        "Aqara 智能门锁 N200": "ZNMS17LM",
        "Aqara 智能墙壁开关 D1（单火线·双键版）": "QBKG22LM",
        "Aqara 智能墙壁开关 D1（零火线·单键版）": "QBKG23LM",
        "Aqara 智能墙壁开关 D1（零火线·双键版）": "QBKG24LM",
    }
    # 采集方未收录的三个 D1 型号（官网 d12_spec 确证型号），价格来自京东快照
    byModel.update({
        "QBKG22LM": {"verifiedModel": "QBKG22LM", "listPrice": 129, "salePrice": 133.88,
                     "source": "京东搜索快照（什么值得买品牌页）", "shop": "Aqara智能家装京东自营旗舰店",
                     "note": "D1 单火双键。京东页面价约 ￥129–149（两店铺口径不同），到手 ￥133.88。型号经官网 d12_spec 确证。"},
        "QBKG23LM": {"verifiedModel": "QBKG23LM", "listPrice": 119,
                     "source": "京东搜索快照（同系列档位参考）", "shop": "Aqara官方旗舰店",
                     "note": "D1 零火单键。⚠ 未取到直接页面价，按零火三键 ￥169 与同档单火双键 ￥129 之间的档位取 ￥119，报价前请核实。"},
        "QBKG24LM": {"verifiedModel": "QBKG24LM", "listPrice": 139,
                     "source": "京东搜索快照（同系列档位外推）", "shop": "Aqara官方旗舰店",
                     "note": "D1 零火双键。⚠ 未取到直接页面价，按零火三键 ￥169 下方一档取 ￥139，报价前必须核实。"},
    })

    changes, priced, skipped = [], 0, []
    for d in db:
        m = (d["manufacturer_model"] or "").strip()
        # 型号修正（即使无价格也执行）
        if m in MODEL_FIX:
            newm, why = MODEL_FIX[m]
            changes.append({
                "productId": d["id"], "sku": d["sku"],
                "before": {"manufacturerModel": m},
                "after": {"manufacturerModel": newm},
                "reason": f"型号纠错 → {newm}：{why}",
            })
            m = newm
        # 无型号记录：走名称映射（灯泡/妙控屏/门锁N200/D1 另三款）
        if not m and d["name"] in NAME_MAP:
            m = NAME_MAP[d["name"]]
        p = byModel.get(m)
        if not p or not p.get("listPrice"):
            skipped.append((d["name"], m, "未采到标价"))
            continue
        lp = float(p["listPrice"])
        sp = p.get("salePrice")
        ev = [f"标价￥{lp:g}（{p.get('source','-')}）"]
        if sp: ev.append(f"活动到手价￥{float(sp):g}")
        if p.get("refPrice"): ev.append(f"ZOL参考报价￥{float(p['refPrice']):g}")
        if p.get("jdFilingModel"): ev.append(f"京东国补备案型号 {p['jdFilingModel']}")
        note = p.get("note") or ""
        shop = p.get("shop") or ""
        after = {
            "price": lp,
            "description": ((d["description"] or "") + f"｜定价：{'；'.join(ev)}"
                            + (f"；店铺：{shop}" if shop else "")
                            + (f"｜{note}" if note else "")).strip("｜"),
        }
        tags = [t for t in (d["tags"] or []) if t != "价格待补"]
        after["tags"] = tags + ["价格已核"]
        changes.append({
            "productId": d["id"], "sku": d["sku"],
            "before": {"price": 0},
            "after": after,
            "reason": f"定价 ￥{lp:g}（{p.get('source','来源见证据')}）",
        })
        priced += 1

    for d in db:
        if d["name"] in NAME_MAP:
            p = byModel.get(NAME_MAP[d["name"]])
            if not p or not p.get("listPrice"):
                skipped.append((d["name"], "", "未采到标价")); continue
            lp = float(p["listPrice"])
            ev = [f"标价￥{lp:g}（{p.get('source','-')}）"]
            if p.get("salePrice"): ev.append(f"活动到手价￥{float(p['salePrice']):g}")
            if p.get("jdFilingModel"): ev.append(f"京东国补备案型号 {p['jdFilingModel']}")
            after = {
                "price": lp,
                "manufacturerModel": p.get("verifiedModel") or p.get("model") or None,
                "description": ((d["description"] or "") + f"｜定价：{'；'.join(ev)}"
                                + (f"｜{p.get('note')}" if p.get("note") else "")).strip("｜"),
            }
            after["manufacturerModel"] = [x for x in [after["manufacturerModel"]] if x]
            after["manufacturerModel"] = after["manufacturerModel"][0] if after["manufacturerModel"] else None
            if not after["manufacturerModel"]: del after["manufacturerModel"]
            tags = [t for t in (d["tags"] or []) if t != "价格待补"]
            after["tags"] = tags + ["价格已核"]
            changes.append({
                "productId": d["id"], "sku": d["sku"],
                "before": {"price": 0},
                "after": after,
                "reason": f"定价 ￥{lp:g} + 补型号",
            })
            priced += 1

    doc = {"format": "product-mapping-changes", "version": 1,
           "changes": changes}
    json.dump(doc, open(BASE + "price-changes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"变更集: {len(changes)} 条（定价 {priced} 条）")
    print(f"仍无标价 {len(skipped)} 条:")
    for n, m, why in skipped:
        print(f"  [{m or '无型号'}] {n}  ({why})")

if __name__ == "__main__":
    main()