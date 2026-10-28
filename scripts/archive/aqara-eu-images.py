#!/usr/bin/env python3
"""从 Aqara 欧盟站产品页抓取真实产品图，按型号锚定下载。
用法: aqara-eu-images.py <输出json>
"""
import sys, re, ssl, gzip, json, time, os, urllib.request

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
UA = {'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept-Language':'zh-CN,zh;q=0.9','Referer':'https://www.aqara.com/'}

# 库内待补图产品 → 官网产品页 slug（从 sitemap.xml 实测确认，型号已锚定）
TARGETS = [
 ("AQARA-网关-M2",                   "ZHWG12LM",  "Hub-M2"),
 ("AQARA-智能门锁-N100",              "ZNMS16LM",  "Smart-Door-Lock-N100-Pro"),
 ("AQARA-智能门锁-A100-PRO",          "ZNMS02ES",  "Aqara-Smart-Door-Lock-A100-Pro"),
 ("AQARA-全自动智能推拉锁-D100",       "ZNMS20LM",  "smart-door-lock-d100"),
 ("AQARA-智能可视门铃-G410-网关版",    "ZNKSML05",  "doorbell_G410"),
 ("AQARA-智能可视门铃-G400",          "ZNKSML11LM", "doorbell_camera_g400"),
 ("AQARA-智能摄像机-G3-网关版",        "ZNSXJ13LM", "Camera-Hub-G3"),
 ("AQARA-智能摄像机-E1",              "ZNSXJ16LM", "camera-e1"),
 ("AQARA-智能摄像机-G100",            "ZNSXJ22LM", "Camera-G100"),
 ("AQARA-智能窗帘电机-C2",            "ZNCLDJ14LM", "curtain_controller_c2"),
 ("AQARA-空调伴侣-P3",               "KTBL12LM",  "Air-Conditioning-Controller-P3"),
 ("AQARA-人体传感器-E1",              "RTCGO15LM", "Motion-Sensor-E1"),
 ("AQARA-集悦妙控屏-S1-PLUS-桌面版",  "JYMKP03LM", "MagicPad-S1-Plus-Siri"),
 ("AQARA-妙控开关-S1E",              "CJPKG01LM", "Smart-Magic-Switch-S1E"),
 ("AQARA-智能墙壁开关-H1-单火线-单键版",   "QBKG27LM", "Smart-Switch-H1-Elite"),
 ("AQARA-智能墙壁开关-H1-单火线-双键版",   "QBKG28LM", "Smart-Switch-H1-Elite"),
 ("AQARA-智能墙壁开关-L1-零火-单键",  "ZNQBKG80LM", "Smart-Switch-L1"),
 ("AQARA-智能墙壁开关-L1-零火-双键",  "ZNQBKG81LM", "Smart-Switch-L1"),
 ("AQARA-智能墙壁开关-L1-零火-三键",  "ZNQBKG82LM", "Smart-Switch-L1"),
 ("AQARA-智能墙壁开关-L1-单火-单键",  "ZNQBKG83LM", "Smart-Switch-L1"),
 ("AQARA-智能墙壁开关-L1-单火-双键",  "ZNQBKG84LM", "Smart-Switch-L1"),
 ("AQARA-LED-灯泡-T1-可调色温",        "ZNLDP13LM", "led_light_t1"),
 ("AQARA-智能窗帘伴侣-E1",            "ZNCLBL01LM", "curtain-controller-e1"),
 ("AQARA-智能卷帘伴侣-E1",            "ZNJLBL01LM", "Roller_Shade_Driver_E1"),
]

BAD = ['logo', 'icon', 'qrcode', 'applehome', 'footer', 'banner', 'avatar',
       'news-', 'contact-', 'reseller', 'operator', 'integrator', 'award']

def get(url, timeout=25):
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout, context=CTX)
    b = r.read()
    if r.headers.get('Content-Encoding') == 'gzip': b = gzip.decompress(b)
    return b.decode('utf-8', 'ignore')

def pick_images(page_html):
    """取产品图：og:image 优先，再取 static-resource / wp-content 的正方形大图"""
    out = []
    for m in re.finditer(r'<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content="([^"]+)"', page_html):
        out.append(("og", m.group(1)))
    pats = [
        r'(https?://(?:static-resource|cdn)\.aqara\.com/[^"\'\s<>]+?\.(?:jpg|jpeg|png|webp))',
        r'(https?://(?:www\.)?aqara\.com/wp-content/uploads/[^"\'\s<>]+?\.(?:jpg|jpeg|png|webp))',
    ]
    for p in pats:
        for u in re.findall(p, page_html):
            low = u.lower()
            if any(k in low for k in BAD): continue
            # 排除明显是站点素材而非产品图
            if re.search(r'/(news|contact|reseller|operator|integrator|award|logo|icon)/', low): continue
            out.append(("asset", u))
    seen, res = set(), []
    for _, u in out:
        if u in seen: continue
        seen.add(u); res.append(u)
    return res

def main():
    results = []
    for sku, model, slug in TARGETS:
        got = None
        for suffix in ("_overview.html", "_spec.html"):
            url = f"https://www.aqara.com/{slug}{suffix}"
            try:
                st = get(url)
            except Exception:
                continue
            title = re.search(r'<title>(.*?)</title>', st, re.S)
            title = title.group(1).strip()[:70] if title else ''
            modelHit = model.lower() in st.lower()
            imgs = pick_images(st)
            if imgs:
                got = {"sku": sku, "model": model, "slug": slug, "url": url,
                       "ok": 200, "title": title, "modelInPage": modelHit,
                       "images": imgs[:8]}
                break
        if got:
            results.append(got)
            flag = "✓型号命中" if got["modelInPage"] else "  型号未现"
            print(f"{flag} {sku:34} 图{len(got['images']):>2} {got['title'][:40]}", flush=True)
            for u in got["images"][:2]:
                print(f"      {u[:114]}")
        else:
            results.append({"sku": sku, "model": model, "slug": slug, "ok": 0, "images": []})
            print(f"✗ {sku:34} 未取到图片", flush=True)
        time.sleep(1.4)

    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/aqara_pages.json"
    json.dump(results, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ok = sum(1 for r in results if r.get("images"))
    hit = sum(1 for r in results if r.get("modelInPage"))
    print(f"\n取到图片 {ok}/{len(results)} | 型号在页面命中 {hit}/{len(results)} → {out}")

if __name__ == '__main__':
    main()