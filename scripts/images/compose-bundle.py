#!/usr/bin/env python3
"""套装组合图：用同系列各件净图，按套餐配置拼成一张图。

为什么需要：易来的套装（2室1厅 客厅灯*1+主卧*1+次卧*1）没有厂家实拍套装图，
海报上是多灯拼贴 + 促销角标，抠出来留白斑。用已有的单件净图按配置横排，
比拿一只卧室灯冒充整个套餐可信。

规则：
  · 只拼同系列的单件（跨系列外观不同，不能混）
  · 组件缺图就不拼，不猜
  · 每个件按其量级给相对大小（客厅灯最大，次卧最小）
  · 输出透明底 PNG

用法：
  compose-bundle.py --out .local/recrawl/bundle --report report.json
"""
import argparse, json, os, re, subprocess

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# 相对最大边的目标尺寸：客厅灯 / 主卧 / 次卧
SIZE = {"living": 470, "bed1": 340, "bed2": 292}
ORDER = ["living", "bed1", "bed2"]
CANVAS_W, CANVAS_H = 1320, 700
GAP = 26


def db_rows():
    sql = """select coalesce(json_agg(row_to_json(t)),'[]') from (
      select p.sku, p.name, v.image from products p
      join product_visual_assets v on v.product_id=p.id
      where p.deleted_at is null and p.brand like '易来%') t"""
    out = subprocess.run(["docker", "exec", "fmkj-v3-db", "psql", "-U", "postgres",
                          "-d", "fmkj", "-At", "-c", sql], capture_output=True, text=True).stdout
    return json.loads(out)


MODEL = re.compile(r"^(YL[A-Z]{2,4}-\d{2,4}|YLYTD-\d+)$")


def series_of(name):
    """系列名 = 型号编码后面那一段；没有型号编码时就是第一段"""
    p = name.split()
    if len(p) >= 3 and MODEL.match(p[1]):
        return p[2]
    return p[1] if len(p) >= 2 else None


def role_of(name):
    if "客厅灯" in name:
        return "living"
    if "次卧" in name:
        return "bed2"
    if "主卧" in name or "卧室灯" in name:
        return "bed1"
    return None


def parse_bundle(name):
    """从套餐名解析件数：{'living':1,'bed1':1,'bed2':1}，解析不出返回 None"""
    m = re.search(r"客厅灯\*(\d+)", name)
    parts = {}
    if m:
        parts["living"] = int(m.group(1))
    m = re.search(r"主卧\*(\d+)", name)
    if m:
        parts["bed1"] = int(m.group(1))
    m = re.search(r"次卧\*(\d+)", name)
    if m:
        parts["bed2"] = int(m.group(1))
    # 只有「客厅灯*1+主卧*1」这种明写件数的才处理；带餐吊灯/风扇灯等无图配件的跳过
    if not parts:
        return None
    if re.search(r"(餐吊|吊灯|风扇灯|浴霸|凉霸|安装|测量)", name):
        return None
    return parts


def _load(path, target_h):
    im = Image.open(os.path.join(ROOT, "public" + path)).convert("RGBA")
    s = target_h / im.height
    return im.resize((max(1, int(im.width * s)), target_h), Image.LANCZOS)


def _fit(imgs, max_w):
    total = sum(i.width for i in imgs) + GAP * (len(imgs) - 1)
    if total <= max_w:
        return imgs, total
    k = (max_w - GAP * (len(imgs) - 1)) / sum(i.width for i in imgs)
    imgs = [i.resize((max(1, int(i.width * k)), max(1, int(i.height * k))), Image.LANCZOS) for i in imgs]
    return imgs, sum(i.width for i in imgs) + GAP * (len(imgs) - 1)


def compose(parts, comp, out_path):
    """客厅灯单独一行，卧室灯另起一行 —— 吸顶灯很扁，排一行会宽得没法看"""
    missing = [k for k in ORDER if parts.get(k) and k not in comp]
    if missing:
        return False, f"缺组件 {missing[0]}"

    rows = []
    if parts.get("living"):
        rows.append(([_load(comp["living"], 300) for _ in range(parts["living"])], 300))
    beds = []
    for k in ("bed1", "bed2"):
        if parts.get(k):
            beds += [_load(comp[k], 210) for _ in range(parts[k])]
    if beds:
        rows.append((beds, 210))
    if not rows:
        return False, "无组件"

    MAXW = 1060
    laid = []
    for imgs, h in rows:
        imgs, w = _fit(imgs, MAXW)
        laid.append((imgs, w, max(i.height for i in imgs)))

    total_w = max(w for _, w, _ in laid)
    total_h = sum(h for _, _, h in laid) + 24 * (len(laid) - 1)
    canvas = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    y = 0
    for imgs, w, h in laid:
        x = (total_w - w) // 2
        for im in imgs:
            canvas.alpha_composite(im, (x, y + (h - im.height) // 2))
            x += im.width + GAP
        y += h + 24

    bbox = canvas.split()[3].getbbox()
    if bbox:
        pad = 26
        canvas = canvas.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                              min(canvas.width, bbox[2] + pad), min(canvas.height, bbox[3] + pad)))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path, "PNG", optimize=True)
    return True, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--report", required=True)
    a = ap.parse_args()

    rows = db_rows()
    comp = {}
    for r in rows:
        if re.search(r"(室1厅|室两厅|\*1\+)", r["name"]):
            continue
        s, role = series_of(r["name"]), role_of(r["name"])
        if s and role:
            comp.setdefault(s, {}).setdefault(role, r["image"])

    # 待处理的套装
    pend = [r for r in json.load(open(os.path.join(ROOT, ".local/recrawl/review-data.json"), encoding="utf-8"))
            if r["kind"] == "bundle"]

    ok, skipped = [], []
    for r in pend:
        s = series_of(r["name"])
        parts = parse_bundle(r["name"])
        if not parts:
            skipped.append({**r, "why": "配置解析不出或含无图配件"})
            continue
        if s not in comp:
            skipped.append({**r, "why": f"系列 {s} 无单件净图"})
            continue
        out = os.path.join(a.out, r["sku"].replace("/", "_") + ".png")
        good, why = compose(parts, comp[s], out)
        if good:
            ok.append({"sku": r["sku"], "name": r["name"], "image": "/" + os.path.relpath(out, ROOT),
                       "parts": parts, "series": s,
                       "comp": {k: comp[s][k] for k in parts if k in comp[s]}})
        else:
            skipped.append({**r, "why": why})

    json.dump({"ok": ok, "skipped": skipped}, open(a.report, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"可拼 {len(ok)} 条，跳过 {len(skipped)} 条")
    from collections import Counter
    print(Counter(s["why"] for s in skipped).most_common())


if __name__ == "__main__":
    main()
