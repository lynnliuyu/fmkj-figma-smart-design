#!/usr/bin/env python3
"""补齐 selection_evidence（参数依据）与 pricing_evidence（价格依据）。

★ 重要：本脚本会 **纠正** 旧库依据里「未按名称或分类猜测参数」的表述 ——
那些记录本轮已经按名称/描述推导了参数，保留旧依据会形成矛盾记录。
依据原则来自 docs/product-catalog-agent-guide.md：
- 参数依据写入 selectionEvidence，说明每个字段的值来自哪里
- 价格依据写入 pricingEvidence，说明售价与成本的来源与口径
- 未证实的字段不写进依据，保持缺失
"""
import json, urllib.request, argparse, time

# 推导依据（来自上一轮 derive-required-specs.py 的 src 字段）
derive = json.load(open("/tmp/spec_fill.json", encoding="utf-8"))
DERIVE = {}
for x in derive:
    src = x.get("src") or {}
    if src:
        DERIVE[x["sku"]] = src

# 电压推导（3 条）
try:
    for x in json.load(open("/tmp/spec_fill2.json", encoding="utf-8")):
        if x.get("src"): DERIVE[x["sku"]] = x["src"]
except FileNotFoundError:
    pass

# 采集底稿里的价格来源（.local/product-catalog-collection/*/downloaded.json 等）
PRICE_SRC = {}
import glob, os
for p in glob.glob(".local/product-catalog-collection/*/*.json"):
    try:
        d = json.load(open(p, encoding="utf-8"))
    except Exception:
        continue
    items = d if isinstance(d, list) else d.get("products") or d.get("items") or d.get("images") or []
    if not isinstance(items, list):
        continue
    for it in items:
        if not isinstance(it, dict): continue
        sku = it.get("sku")
        if not sku: continue
        src = it.get("source") or it.get("pageUrl") or it.get("sourceUrl")
        if src and sku not in PRICE_SRC:
            PRICE_SRC[sku] = str(src)

def api(cookie, path, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method,
        headers={"Cookie": cookie, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode())

KEEP = ["name", "sku", "brand", "platform", "category", "unit",
        "price", "cost", "stock", "image", "description", "tags", "channels", "status"]

OLD_TAIL = "厂家型号、结构化规格与设备类型均未核实，保持待核；未按名称或分类猜测继电器路数、屏幕尺寸等参数。"

def build_sel_ev(p, cur):
    """构造参数依据"""
    sp = p.get("specs") or {}
    if not sp:
        return None
    src = DERIVE.get(p["sku"])
    parts = []
    if src:
        for k, why in sorted(src.items()):
            v = sp.get(k)
            if v is None: continue
            parts.append(f"{k}={json.dumps(v, ensure_ascii=False)}（{why}）")
    # 原有依据里若含实测/官网信息则保留
    old = cur.get("selectionEvidence") or ""
    keep = ""
    # 只在旧依据含官网/说明书等真实来源时保留其前半段；
    # ★ 含「未按名称或分类猜测」的旧依据必须丢弃 —— 本轮已按名称推导，保留会自相矛盾
    if ("官网" in old or "说明书" in old or "实测" in old or "官方" in old) \
       and "未按名称或分类猜测" not in old:
        keep = old.split("。")[0] + "。"
    if parts:
        head = keep or "参数由产品名称与官方描述推导，逐字段依据如下："
        note = "；".join(parts) + "。"
        if keep:
            note += "本轮已按名称与描述推导上述字段（推导值未经型号页逐项复核），保持待核。"
        else:
            note += "推导值未经型号页逐项复核，保持待核。"
        return head + note
    # 无推导依据但有 specs（如上一轮已存在的）
    if cur.get("selectionEvidence"):
        return None      # 已有且无新字段，不动
    return ("旧库记录的结构化参数，未经厂家型号页复核，保持待核；"
            f"当前字段：{'、'.join(sorted(sp.keys()))}。")

def build_price_ev(p, cur):
    """构造价格依据"""
    price = p.get("price") or 0
    cost = p.get("cost") or 0
    if not price:
        return None
    src = PRICE_SRC.get(p["sku"])
    # 描述里若已记录定价来源，优先用它
    desc = p.get("description") or ""
    from_desc = ""
    if "定价：" in desc:
        seg = desc.split("定价：", 1)[1].split("｜")[0].strip()
        if seg: from_desc = seg[:300]
    parts = []
    if from_desc:
        parts.append(from_desc)
    elif src:
        parts.append(f"来源：{src}")
    else:
        parts.append("来源未记录，需重新核价")
    tail = f"售价￥{price:g}"
    if cost: tail += f"，成本￥{cost:g}"
    else: tail += "，成本未知（0 表示缺失，不代表零成本）"
    tail += "；未按当前渠道复核，保持待核。"
    return " ".join(parts) + tail

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cookie", required=True)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    prods = api(a.cookie, "/api/products")
    prods = prods.get("products") or prods.get("data") or []
    print(f"读取 {len(prods)} 条产品\n")

    # 有参数但完全无依据 → 补写
    needSel = [p for p in prods if p.get("specs") and not (p.get("selectionEvidence") or "").strip()]
    # 有参数、且旧依据写着「未按名称猜测」但实际已有推导参数 → 必须纠正表述
    contra = [p for p in prods if p.get("specs")
              and "未按名称或分类猜测" in (p.get("selectionEvidence") or "")
              and p["sku"] in DERIVE]
    needPrice = [p for p in prods if (p.get("price") or 0) > 0 and not (p.get("pricingEvidence") or "").strip()]

    print(f"待补参数依据 {len(needSel)} 条")
    print(f"★ 需纠正矛盾依据 {len(contra)} 条（旧依据写「未按名称猜测」但本轮已按名称推导参数）")
    print(f"待补价格依据 {len(needPrice)} 条")
    print(f"推导依据可用 {len(DERIVE)} 条 | 采集底稿价格来源 {len(PRICE_SRC)} 条\n")

    targets = []
    for p in needSel:
        ev = build_sel_ev(p, {"selectionEvidence": p.get("selectionEvidence") or ""})
        if ev: targets.append((p, "selectionEvidence", ev))
    for p in contra:
        ev = build_sel_ev(p, {"selectionEvidence": p.get("selectionEvidence") or ""})
        if ev and ev != p.get("selectionEvidence"):
            targets.append((p, "selectionEvidence", ev))
    for p in needPrice:
        ev = build_price_ev(p, {"pricingEvidence": p.get("pricingEvidence") or ""})
        if ev: targets.append((p, "pricingEvidence", ev))

    print(f"将更新 {len(targets)} 个字段\n")
    ok = fail = 0
    for p, field, ev in targets:
        pl = {k: p.get(k) for k in KEEP}
        pl["specs"] = p.get("specs")
        pl["protocols"] = p.get("protocols")
        pl["capabilities"] = p.get("capabilities")
        pl["catalogKind"] = p.get("catalogKind")
        pl["deviceTypeId"] = p.get("deviceTypeId")
        pl["parentProductId"] = p.get("parentProductId")
        pl["manufacturerModel"] = p.get("manufacturerModel")
        pl["selectionStatus"] = p.get("selectionStatus") or "pending"
        pl["pricingStatus"] = p.get("pricingStatus") or "pending"
        pl[field] = ev
        if p.get("mappingRevision") is not None:
            pl["mappingRevision"] = p["mappingRevision"]
        label = "参数" if field == "selectionEvidence" else "价格"
        if a.dry:
            print(f"○ {label} {p['sku'][:26]:28}{ev[:70]}")
            ok += 1
            continue
        try:
            api(a.cookie, f"/api/admin/products/{p['id']}", "PATCH", pl)
            print(f"✓ {label} {p['sku'][:26]:28}{ev[:66]}")
            ok += 1
            time.sleep(0.1)
        except urllib.error.HTTPError as e:
            print(f"✗ {p['sku'][:26]:28}HTTP {e.code} {e.read().decode()[:80]}")
            fail += 1
        except Exception as e:
            print(f"✗ {p['sku'][:26]:28}{str(e)[:60]}")
            fail += 1
    print(f"\n{'将更新' if a.dry else '已更新'} {ok} | 失败 {fail}")

if __name__ == "__main__":
    main()