#!/usr/bin/env python3
"""把人工选定的重采净图写入 product_visual_assets。

流程：
  1. 拷贝 .local 下的候选净图到 public/assets/products/recrawl/<sku-slug>.png
  2. 读当前展示图 revision（走单产品接口，列表接口不返回 visual）
  3. PATCH /api/admin/products/{id}/visual 写入，reviewStatus 保持 pending

只写展示图，不动 products.image（原图保留可追溯）。

用法：
  apply-picked.py --picks .local/recrawl/picks.json [--dry]
  picks.json: [{"sku":"AQ-CUBE-T1-PRO","cut":"...png","source":"https://...","page":"https://..."}]
"""
import argparse, json, os, re, shutil, subprocess, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEST_DIR = os.path.join(ROOT, "public/assets/products/recrawl")


def slug(sku):
    s = re.sub(r"[^a-z0-9]+", "-", sku.lower()).strip("-")
    return s or "sku"


def cookie():
    out = subprocess.run(["node", "scripts/mint-session.mjs"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout.strip()
    return out


def api(ck, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request("http://localhost:3000" + path, data=data, method=method,
                                 headers={"Cookie": ck, "Content-Type": "application/json",
                                          "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def product_ids():
    sql = "select sku||'\t'||id from products where deleted_at is null"
    out = subprocess.run(["docker", "exec", "fmkj-v3-db", "psql", "-U", "postgres", "-d", "fmkj",
                          "-At", "-F", "\t", "-c", sql], capture_output=True, text=True).stdout
    m = {}
    for line in out.strip().split("\n"):
        if "\t" in line:
            sku, pid = line.split("\t", 1)
            m[sku] = pid.strip()
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--picks", help="picks.json（列表）")
    ap.add_argument("--from-ui", help="筛选页保存的 picks-ui.json（{sku: {...}}）")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--force", action="store_true", help="目标路径已存在时也重写（换图用）")
    a = ap.parse_args()

    if a.from_ui:
        ui = json.load(open(a.from_ui, encoding="utf-8"))
        picks = []
        for sku, v in ui.items():
            if v.get("kind") != "pick" or not v.get("file"):
                continue
            cut = v["file"]
            if cut.startswith("/local/"):
                cut = "." + cut              # /local/recrawl/... → .local/recrawl/...
            picks.append({"sku": sku, "cut": cut, "source": v.get("src", ""),
                          "page": v.get("page", "")})
        print(f"筛选页选图 {len(picks)} 条（其余为保持原图/暂不处理，不入库）")
    elif a.picks:
        picks = json.load(open(a.picks, encoding="utf-8"))
    else:
        ap.error("需要 --picks 或 --from-ui")
    ids = product_ids()
    ck = cookie()
    os.makedirs(DEST_DIR, exist_ok=True)

    ok = skip = fail = 0
    errors = {}
    applied = []
    for p in picks:
        sku, cut = p["sku"], p["cut"]
        pid = ids.get(sku)
        if not pid:
            errors.setdefault("SKU 不存在", []).append(sku); fail += 1; continue
        if not os.path.exists(cut):
            errors.setdefault("净图文件缺失", []).append(sku); fail += 1; continue

        dest = os.path.join(DEST_DIR, slug(sku) + ".png")
        rel = "/assets/products/recrawl/" + os.path.basename(dest)
        if not a.dry:
            shutil.copyfile(cut, dest)

        src = p.get("source") or ""
        page = p.get("page") or ""
        if p.get("note") == "bundle":
            evidence = (
                "套装组合图：由该套餐各件已有的单件净图按套餐配置拼接，背景透明。"
                + (f" 组件：{p.get('comp')}。" if p.get("comp") else "")
                + " 非厂家实拍套装图，各件按实际配置数量与相对大小排布；"
                "单件图仅去除背景，未改变外观。图片状态保持待核。"
            )
        elif p.get("note") == "series":
            evidence = (
                f"背景已去除，仅保留产品本体。同系列共用图：取自同系列条目 {p.get('seriesSource')} 的净图，"
                "同系列不同功率/尺寸外观一致，未按本 SKU 单独实拍核图。"
                f" 来源原图：{src}。抠图仅移除背景，未改变产品外观、颜色与结构；图片状态保持待核。"
            )
        else:
            evidence = (
                "背景已去除，仅保留产品本体（重采原图为厂家/渠道白底产品图，"
                "macOS Vision 主体提取）。"
                + (f" 来源页：{page}。" if page else "")
                + (f" 原图：{src}。" if src else "")
                + " 抠图仅移除背景，未改变产品外观、颜色与结构；"
                "未按厂家型号页逐项核图，图片状态保持待核。"
            )

        try:
            cur = api(ck, f"/api/admin/products/{pid}/visual").get("visual") or {}
            if cur.get("image") == rel and not a.force:
                skip += 1
                continue
            body = {"image": rel, "sourceImage": src or cur.get("sourceImage") or "",
                    "crop": None, "scale": 1, "reviewStatus": "pending",
                    "evidence": evidence, "expectedRevision": cur.get("revision", 0) or 0}
            if a.dry:
                print(f"○ {sku:28}{rel}")
                ok += 1
                continue
            api(ck, f"/api/admin/products/{pid}/visual", "PATCH", body)
            applied.append({"sku": sku, "productId": pid, "image": rel, "source": src, "page": page})
            ok += 1
            if ok % 25 == 0:
                print(f"  ... {ok}", flush=True)
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:120]
            errors.setdefault(msg, []).append(sku); fail += 1
        except Exception as e:
            errors.setdefault(str(e)[:80], []).append(sku); fail += 1

    print(f"\n{'将写入' if a.dry else '已写入'} {ok} | 跳过 {skip} | 失败 {fail}")
    for m, skus in list(errors.items())[:6]:
        print(f"  [{len(skus)}] {m[:100]} → {', '.join(skus[:4])}")
    if not a.dry and applied:
        out = ".local/recrawl/applied.json"
        old = json.load(open(out, encoding="utf-8")) if os.path.exists(out) else []
        json.dump(old + applied, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"  清单 → {out}")


if __name__ == "__main__":
    main()
