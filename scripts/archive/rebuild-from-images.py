#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用图片文件名反查，重建丢失的产品记录。

背景：旧产品库数据丢失（远程库 10.0.0.176 不可达），但 public/assets/products/
      下的图片完整保留。图片命名含品牌与型号信息，可据此重建骨架记录。

用法：python3 rebuild-from-images.py            # 只预览，不写库
      python3 rebuild-from-images.py --apply    # 实际写入数据库
"""
import os, re, json, sys, argparse

ROOT = "/Users/noonebook/Documents/ChatGPT/繁梦空间设计站"
IMG_DIRS = [
    ("", "根目录"),      # public/assets/products/*.png
    ("imported/", "Excel导入"),
    ("scraped/", "1688抓取"),
]

# 文件名前缀 → 品牌（对齐 products_brand_whitelist_check）
BRAND_MAP = {
    "linptech": "领普/Linptech",
    "ptx": "平头熊/PTX",
    "yeelight": "易来/yeelight",
    "aqara": "Aqara",
    "xiaomi": "小米/xiaomi",
    "ruijie": "锐捷/Ruijie",
    "panasonic": "其他",   # 松下，白名单里没有
    "h3c": "其他",         # 华三，白名单里没有
    "tplink": "其他",
    "loock": "鹿客",
    "kcz": "金闪",
    "huawei": "华为",
    "futurehome": "其他",
}

# 品牌 → platform（对齐 products_platform_whitelist_check）
PLATFORM_MAP = {
    "领普/Linptech": "米家",
    "平头熊/PTX": "米家",
    "易来/yeelight": "米家",
    "Aqara": "绿米",
    "小米/xiaomi": "米家",
    "锐捷/Ruijie": "其他",
    "鹿客": "其他",
    "金闪": "其他",
}

# 文件名关键词 → category（对齐 products_standard_category_check）
CATEGORY_RULES = [
    (r"lock|门锁|猫眼", "门锁"),
    (r"camera|摄像|门铃|camera", "监控"),
    (r"sensor|传感|presence|人体|门磁|水浸|温湿", "传感器"),
    (r"curtain|窗帘|motor|电机", "窗帘"),
    (r"socket|插座", "插座"),
    (r"switch|开关|knob|旋钮|panel|面板", "开关"),
    (r"hub|gateway|网关|中控|host", "网关中控"),
    (r"ap-|ap$|ap_|ap-|wifi|ap|路由|switch|交换机|路由", "全屋wifi"),
    (r"hvac|空调|温控|vrf", "暖通控制"),
    (r"light|灯|downlight|筒灯|射灯|灯带", "智能灯具"),
]


def guess_brand(fname):
    stem = fname.lower()
    for key, brand in BRAND_MAP.items():
        if stem.startswith(key) or f"-{key}-" in stem or f"_{key}" in stem:
            return brand, key
    return None, None


def guess_category(fname):
    stem = fname.lower()
    for pat, cat in CATEGORY_RULES:
        if re.search(pat, stem):
            return cat
    return "其他"


def guess_platform(brand):
    return PLATFORM_MAP.get(brand, "其他")


def clean_name(fname):
    """从文件名生成可读产品名"""
    stem = os.path.splitext(fname)[0]
    stem = re.sub(r"^(linptech|ptx|yeelight|aqara|xiaomi|ruijie|panasonic|h3c|tplink|loock|kcz|huawei|futurehome)[-_]", "", stem, flags=re.I)
    words = stem.replace("_", " ").replace("-", " ").strip()
    return re.sub(r"\s+", " ", words)


def sku_for(fname, idx):
    stem = os.path.splitext(fname)[0]
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", stem).strip("-").upper()[:48]
    # scraped/ 目录对应原 SCRAPED-xxxx 规则，imported/ 对应 XLSX-CLEAN-xxxx
    return f"REBUILD-{slug[:40]}-{idx}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="实际写库（默认只预览）")
    args = ap.parse_args()

    rows = []
    seen = set()
    for sub, source in IMG_DIRS:
        d = os.path.join(ROOT, "public/assets/products", sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
                continue
            key = f.lower()
            if key in seen:
                continue
            seen.add(key)

            brand, prefix = guess_brand(f)
            if not brand:
                continue  # 无法判断品牌的先跳过，人工确认

            rel = f"/assets/products/{sub}{f}"
            rows.append({
                "sku": sku_for(f, len(rows) + 1),
                "name": clean_name(f)[:96],
                "brand": brand,
                "platform": guess_platform(brand),
                "category": guess_category(f),
                "image": rel,
                "unit": "个",
                "source": source,
                "originalFile": f,
            })

    print(f"从图片文件名解析出 {len(rows)} 条候选记录\n")
    by_brand = {}
    for r in rows:
        by_brand.setdefault(r["brand"], []).append(r)
    for b, items in sorted(by_brand.items(), key=lambda x: -len(x[1])):
        print(f"  {b:16} {len(items):>3} 条")
    print(f"\n分类分布: ", end="")
    cats = {}
    for r in rows:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    print(", ".join(f"{k}={v}" for k, v in sorted(cats.items(), key=lambda x: -x[1])))

    out = os.path.join(ROOT, "scripts/data/rebuilt-from-images.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(rows, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n候选记录已保存: {out}")

    if not args.apply:
        print("\n⚠️  这是预览模式，未写库。")
        print("   确认无误后运行:  python3 rebuild-from-images.py --apply")
        print("\n注意：price / cost / stock / description 均为空，需人工补齐或再从源 Excel 导入。")
        return

    # 写库
    import subprocess
    sql = []
    for r in rows:
        v = [r["sku"], r["name"], r["brand"], r["platform"], r["category"],
             r["unit"], r["image"], f"由图片文件名重建（原图 {r['originalFile']}，来源 {r['source']}）",
             json.dumps([r["brand"], r["category"], "图片反查重建"], ensure_ascii=False),
             json.dumps([f"重建自{r['source']}"], ensure_ascii=False)]
        sql.append("$$" + "$$".join("'" + str(x).replace("'", "''") + "'" for x in v) + "$$")
    print(f"\n准备写入 {len(sql)} 条…")
    print("请改用 scripts/rebuild-products-from-images.mjs 执行写库（含约束校验与备份）。")


if __name__ == "__main__":
    main()
