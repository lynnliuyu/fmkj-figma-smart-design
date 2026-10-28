#!/usr/bin/env python3
"""下载 Aqara 官网产品图并装入项目 public/assets/products/aqara/。
用法: download-aqara-images.py
"""
import json, os, re, ssl, time, urllib.request, urllib.parse
from PIL import Image

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Referer':'https://www.aqara.com/'}
SRC = ".local/product-catalog-collection/20261016-aqara-price/aqara-official-pages.json"
DEST = "public/assets/products/aqara"
TMP = "/tmp/aqara_imgs"

# 站点素材/文案图，不是产品本体
BAD_PAT = re.compile(r'fenlogo|/img/|icon|logo|qrcode|无定制|-scaled|无图|noimg', re.I)
# 详情轮播里排除带「_01」的营销横幅
BANNER_PAT = re.compile(r'[_-]0?1[_-]|@1x(?!\d)', re.I)

def enc(u):
    """URL 里的中文需百分号编码，否则 urllib 报 ascii codec 错"""
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit((p.scheme, p.netloc,
        urllib.parse.quote(p.path, safe="/%:@&=+$,~()!*';"), p.query, p.fragment))

def slug(name):
    """sku → ASCII 文件名（避免中文文件名）"""
    s = name.replace("AQARA-", "")
    # SKU 里中文 → 音节化简表（覆盖库内实际用词）
    trans = {"智能": "smart", "可视": "video", "门铃": "doorbell", "门锁": "door-lock",
             "自动": "auto", "推拉": "push-pull", "墙壁": "wall", "开": "", "关": "",
             "摄像": "camera", "机": "", "窗帘": "curtain", "电": "", "伴侣": "combo-driver",
             "卷帘": "roller-shade", "空调": "ac", "人体": "motion", "传感器": "sensor",
             "集悦": "magicpad", "妙控": "magic", "屏": "panel", "零火": "neutral",
             "单火": "no-neutral", "线": "wire", "双键": "2-key", "三键": "3-key",
             "单键": "1-key", "四键": "4-key", "版": "", "无线": "wireless", "贴墙式": "onwall",
             "插座": "socket", "灯泡": "bulb", "可调色温": "tunable-white", "网关": "hub",
             "调光": "dimmer", "灯": "light", "面板": "panel", "式": "", "灯带": "strip",
             "情景": "scene", "场景": "scene"}
    for k, v in trans.items():
        s = s.replace(k, v + ("-" if v else ""))
    s = re.sub(r'[^A-Za-z0-9]+', '-', s)
    s = re.sub(r'-{2,}', '-', s).strip('-').lower()
    return s or "aqara-product"

def main():
    os.makedirs(DEST, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    pages = json.load(open(SRC, encoding="utf-8"))
    report = []
    for p in pages:
        cands = [u for u in p.get("images", []) if not BAD_PAT.search(u)]
        # 优先详情轮播（jeditor 02+），其次任何非横幅
        detail = [u for u in cands if not BANNER_PAT.search(u)]
        order = detail + [u for u in cands if u not in detail]
        if not order:
            print(f"✗ {p['sku']:34} 无候选图"); continue
        saved = None
        for u in order[:5]:
            try:
                r = urllib.request.urlopen(urllib.request.Request(enc(u), headers=UA),
                                           timeout=25, context=CTX)
                b = r.read()
                if len(b) < 5000: continue
                tmp = os.path.join(TMP, "t.img")
                open(tmp, "wb").write(b)
                im = Image.open(tmp)
                if im.format == "GIF": continue
                w, h = im.size
                if w / h > 3.2: continue          # 跳过超宽横幅
                if w < 400 and h < 400: continue  # 跳过小图标
                ext = ".png" if im.format == "PNG" else ".jpg"
                fn = slug(p["sku"]) + ext
                fp = os.path.join(DEST, fn)
                if ext == ".jpg":
                    im.convert("RGB").save(fp, "JPEG", quality=92, optimize=True)
                else:
                    im.save(fp, "PNG", optimize=True)
                sz = Image.open(fp).size
                report.append({"sku": p["sku"], "model": p["model"],
                               "file": f"/assets/products/aqara/{fn}",
                               "sourceUrl": u, "pageUrl": p["url"], "title": p["title"],
                               "size": f"{sz[0]}x{sz[1]}", "kb": os.path.getsize(fp)//1024})
                print(f"✓ {p['sku']:34} {sz[0]}x{sz[1]:<5} {os.path.getsize(fp)//1024:>4}KB  {p['title'][:32]}")
                saved = fn
                break
            except Exception:
                continue
        if not saved:
            print(f"✗ {p['sku']:34} 未找到合格图（横幅/小图/下载失败）")
        time.sleep(0.5)
    json.dump(report, open(".local/product-catalog-collection/20261016-aqara-price/downloaded.json","w",encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n下载 {len(report)} 张 → {DEST}")
    print(f"唯一文件 {len(set(r['file'] for r in report))} 个（多款共用同系列图属正常）")

if __name__ == "__main__":
    main()