#!/usr/bin/env python3
"""对一批海报类原图批量跑 poster-cutout，输出到指定目录并记录结果。

用法：poster-batch.py --tasks .local/recrawl/poster-tasks.json --out .local/recrawl/poster-all
"""
import argparse, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PY = sys.executable
SCRIPT = os.path.join(ROOT, "scripts/cutout/poster-cutout.py")


def one(t, outdir):
    src = os.path.join(ROOT, "public" + t["image"])
    if not os.path.exists(src):
        return {**t, "ok": False, "error": "原图缺失"}
    dst = os.path.join(outdir, t["sku"].replace("/", "_") + ".png")
    try:
        r = subprocess.run([PY, SCRIPT, src, dst], capture_output=True, text=True, timeout=300)
        line = (r.stdout or "").strip().split("\n")[-1]
        res = json.loads(line)
    except Exception as e:
        return {**t, "ok": False, "error": str(e)[:80]}
    return {**t, **res, "out": "/" + os.path.relpath(dst, ROOT)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    tasks = json.load(open(os.path.join(ROOT, a.tasks), encoding="utf-8"))
    outdir = os.path.join(ROOT, a.out)
    os.makedirs(outdir, exist_ok=True)
    rows = []
    done = 0
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(one, t, outdir) for t in tasks]
        for f in futs:
            row = f.result()
            rows.append(row)
            done += 1
            if done % 10 == 0 or done == len(tasks):
                ok = sum(1 for r in rows if r.get("ok"))
                print(f"  {done}/{len(tasks)}  成功 {ok}", flush=True)
    json.dump(rows, open(os.path.join(outdir, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ok = sum(1 for r in rows if r.get("ok"))
    print(f"完成 {len(rows)}，成功 {ok}，失败 {len(rows) - ok}")


if __name__ == "__main__":
    main()
