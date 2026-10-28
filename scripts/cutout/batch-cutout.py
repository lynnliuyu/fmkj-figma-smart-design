#!/usr/bin/env python3
"""批量产品图抠图：Vision 主体提取优先，纯色底泛洪回退。

输入：/tmp/img_kinds.json（678 张唯一图清单）
输出：
  public/assets/products/cutout/<扁平名>.png   透明背景净图
  .local/image-cutout/cutout-report.json        每张的处理结果与依据

两级策略：
  1) scripts/cutout/cutout  (macOS Vision)  —— 场景图/海报/深色底都能处理
  2) 纯色底泛洪去除                          —— Vision 检测不到主体时用（白底净图常见）

不做的事：
  · 不覆盖原图（products.image 保留）
  · 不猜产品外观（只去背景，不改产品）
"""
import json, os, subprocess, sys, time
from collections import Counter, deque
from PIL import Image
import numpy as np

CUTOUT_BIN = "scripts/cutout/cutout"
OUT_DIR = "public/assets/products/cutout"
REPORT = ".local/image-cutout/cutout-report.json"


def flat_name(img_path):
    """assets 路径 → 扁平的输出文件名（保留目录信息避免撞名）"""
    rel = img_path.replace("/assets/products/", "")
    rel = rel.replace("/", "__")
    base = os.path.splitext(rel)[0]
    return base + ".png"


def run_vision(src, dst, pad=5, max_side=1000, square=False):
    """调用 Vision 抠图，返回解析后的结果 dict"""
    cmd = [CUTOUT_BIN, src, dst, "--pad", str(pad), "--max", str(max_side)]
    if square:
        cmd.append("--square")
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        line = (r.stdout or "").strip().split("\n")[-1]
        return json.loads(line) if line.startswith("{") else {"ok": False, "error": (line or r.stderr)[:120]}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "超时"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:100]}


def solid_bg_cutout(src, dst, tol=26, pad_pct=5, max_side=1000):
    """纯色/近似纯色底泛洪去除。

    只从图像四边向内扩散，遇到颜色跳变即停 —— 白色产品被深色描边包住时不会被吃掉。
    返回 (ok, info)
    """
    try:
        im = Image.open(src)
    except Exception as e:
        return False, {"error": f"读图失败 {str(e)[:60]}"}
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        arr = np.array(im)
        # 已有透明像素占比高 → 视为已抠好，只做裁边
        if (arr[:, :, 3] < 16).mean() > 0.05:
            return trim_png(im, dst, pad_pct, max_side, note="原本就是透明底，仅裁切留白")
    rgb = im.convert("RGB")
    a = np.array(rgb).astype(np.int16)
    h, w = a.shape[:2]
    if w < 40 or h < 40:
        return False, {"error": f"图太小 {w}x{h}"}

    # 取四边中位数作为底色
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(edge, axis=0)
    # 边缘一致性太低说明是复杂背景，泛洪不可靠
    dist_edge = np.abs(edge - bg).sum(axis=1)
    if np.median(dist_edge) > tol * 2:
        return False, {"error": f"边缘非纯色（中位差 {np.median(dist_edge):.0f}）"}

    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y, x] and np.abs(a[y, x] - bg).sum() <= tol:
                visited[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y, x] and np.abs(a[y, x] - bg).sum() <= tol:
                visited[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                if np.abs(a[ny, nx] - bg).sum() <= tol:
                    visited[ny, nx] = True
                    q.append((ny, nx))
    removed = visited.mean()
    if removed < 0.02:
        return False, {"error": f"可去除底色仅 {removed:.1%}，判断失败"}
    if removed > 0.985:
        return False, {"error": f"底色占 {removed:.1%}，几乎整张图都被当成背景"}

    out = np.dstack([np.array(rgb), np.full((h, w), 255, dtype=np.uint8)])
    out[visited, 3] = 0
    # 主体外接框
    keep = ~visited
    ys, xs = np.where(keep)
    if len(ys) == 0:
        return False, {"error": "去除后无剩余内容"}
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = int(max(y1 - y0, x1 - x0) * pad_pct / 100)
    y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
    y1 = min(h - 1, y1 + pad); x1 = min(w - 1, x1 + pad)
    crop = Image.fromarray(out[y0:y1 + 1, x0:x1 + 1], "RGBA")
    long_side = max(crop.size)
    if long_side > max_side:
        s = max_side / long_side
        crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    crop.save(dst, "PNG", optimize=True)
    return True, {"bg": [int(v) for v in bg], "removed": round(float(removed), 3),
                  "outW": crop.width, "outH": crop.height,
                  "kb": os.path.getsize(dst) // 1024}


def trim_png(im, dst, pad_pct, max_side, note=""):
    """已是透明图：只裁到内容边界并补留白"""
    a = np.array(im.convert("RGBA"))
    alpha = a[:, :, 3]
    ys, xs = np.where(alpha > 16)
    if len(ys) == 0:
        return False, {"error": "全透明"}
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = int(max(y1 - y0, x1 - x0) * pad_pct / 100)
    y0 = max(0, y0 - pad); x0 = max(0, x0 - pad)
    y1 = min(a.shape[0] - 1, y1 + pad); x1 = min(a.shape[1] - 1, x1 + pad)
    crop = im.crop((x0, y0, x1 + 1, y1 + 1))
    long_side = max(crop.size)
    if long_side > max_side:
        s = max_side / long_side
        crop = crop.resize((max(1, int(crop.width * s)), max(1, int(crop.height * s))), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    crop.save(dst, "PNG", optimize=True)
    return True, {"note": note, "outW": crop.width, "outH": crop.height,
                  "kb": os.path.getsize(dst) // 1024}


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    kinds = json.load(open("/tmp/img_kinds.json", encoding="utf-8"))
    targets = [k for k in kinds if not k["img"].lower().endswith(".svg")]
    if limit: targets = targets[:limit]
    print(f"待处理 {len(targets)} 张（跳过 SVG）\n")

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(".local/image-cutout", exist_ok=True)
    results = []
    stat = Counter()
    t0 = time.time()

    for i, k in enumerate(targets, 1):
        src = "./public" + k["img"]
        dst = f"{OUT_DIR}/{flat_name(k['img'])}"
        if not os.path.exists(src):
            results.append({**k, "status": "missing", "method": None})
            stat["missing"] += 1
            continue

        r = run_vision(src, dst)
        if r.get("ok"):
            row = {**k, "out": "/" + dst.replace("public/", ""), "status": "ok",
                   "method": "vision", "outSize": [r["outW"], r["outH"]],
                   "cover": r.get("cover"), "instances": r.get("instances"), "kb": r.get("kb")}
            stat["vision"] += 1
        else:
            ok, info = solid_bg_cutout(src, dst)
            if ok:
                row = {**k, "out": "/" + dst.replace("public/", ""), "status": "ok",
                       "method": "flood", "outSize": [info["outW"], info["outH"]],
                       "note": info.get("note"), "removed": info.get("removed"), "kb": info.get("kb")}
                stat["flood"] += 1
            else:
                row = {**k, "status": "fail", "method": None,
                       "visionError": r.get("error"), "floodError": info.get("error")}
                stat["fail"] += 1

        results.append(row)
        if i % 25 == 0 or i == len(targets):
            el = time.time() - t0
            print(f"  {i}/{len(targets)}  {el:.0f}s  预计剩余 {el/max(i,1)*(len(targets)-i):.0f}s  "
                  f"| vision {stat['vision']} flood {stat['flood']} fail {stat['fail']}", flush=True)

    json.dump(results, open(REPORT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n完成 {len(results)} 张，用时 {time.time()-t0:.0f}s")
    print(f"  Vision {stat['vision']} | 泛洪回退 {stat['flood']} | 失败 {stat['fail']} | 缺文件 {stat['missing']}")
    print(f"  → {REPORT}")


if __name__ == "__main__":
    main()