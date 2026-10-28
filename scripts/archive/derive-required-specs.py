#!/usr/bin/env python3
"""为 6 个点位必需类型推导 requiredForPoint 字段。

原则：只填能由「名称 / 型号 / 描述」直接确证的字段，查不到就留空不猜。
推导依据写进 source 说明，便于事后追溯与人工复核。
"""
import json, re, subprocess, sys, datetime

TARGET_TYPES = ["wall-switch", "curtain-motor", "curtain-kit",
                "wireless-ap", "camera", "touch-control-panel", "nvr"]

# ---- 键数 ----
KEYWORD_NUM = {"单": 1, "双": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

def key_count(name, model="", desc=""):
    """推导物理按键数。返回 (值, 依据) 或 (None, 原因)

    ★ 关键约束：若描述里是「原名：A 单键/A 双键/A 三键」这种系列聚合记录，
    说明该 SKU 是整个系列的合并条目，键数有多个值，不能取单值。
    """
    # 系列聚合条目（描述含多个键数变体）→ 无法确定
    if re.search(r"原名[:：].*", desc) and len(re.findall(r"[单双三四五六七八]键", desc)) >= 3:
        return None, "系列聚合条目（描述列出多个键数变体），键数不唯一"
    s = f"{name} {model} {desc}"
    # SKU 式命名：1G / 2G / 3G / 4G（先排除 Wi-Fi 5G/6G 等干扰）
    m = re.search(r"(?:SWITCH[-_]|[^A-Z])(\d)G[-_]?(?:SINGLE|NEUTRAL|SINGLE-LIVE)?\b", s, re.I)
    if m and int(m.group(1)) <= 8:
        return int(m.group(1)), f"SKU 含 {m.group(1)}G 键数标识"
    # 三键/双键/单键/四键
    for kw, n in KEYWORD_NUM.items():
        if kw == "十": continue
        # 必须明确出现「N键/N开」，且名称不能是「系列」（系列含多种键数）
        if f"{kw}键" in s or f"{kw}开" in s:
            return n, f"名称含「{kw}键」"
    # 一位/二位/三位（松下）
    for kw, n in KEYWORD_NUM.items():
        if f"{kw}位" in s:
            return n, f"名称含「{kw}位」"
    # 3G-类型型号：AQ-H1PRO-3G-NEUTRAL
    m = re.search(r"-(\d)G-", s, re.I)
    if m and int(m.group(1)) <= 8:
        return int(m.group(1)), f"型号含 {m.group(1)}G"
    # Pro 三键（MI-SWITCH-PRO-3）
    m = re.search(r"PRO-(\d)\b", s, re.I)
    if m and int(m.group(1)) <= 8:
        return int(m.group(1)), f"型号含 PRO-{m.group(1)}"
    return None, "名称/型号未标明键数"

# ---- 接线方式 ----
def wiring_of(name, model="", desc=""):
    s = f"{name} {model} {desc}"
    if re.search(r"零火|NEUTRAL|neutral", s):
        # 排除「单零火版」（苏米 H2 Pro+ 单零火 = 零火版本的一种）
        if "单零火" in s:
            return "neutral", "名称含「单零火版」，零火线的兼容版本"
        return "neutral", "名称/型号含「零火」或 neutral"
    if re.search(r"单火|SINGLE-LIVE|no-neutral", s, re.I):
        return "no-neutral", "名称/型号含「单火」或 single-live"
    if re.search(r"干接点|dry.?contact|干接", s, re.I):
        return "dry-contact", "含「干接点」"
    if re.search(r"低压|low.?voltage|12V|24V", s, re.I):
        return "low-voltage", "含低压/12V/24V"
    return None, "名称未标明接线方式"

# ---- 供电方式 ----
def power_of(name, desc=""):
    """注意：窗帘电机/中控屏不适用 PoE（PoE 是网络设备供电标准），
    这里只对无线 AP 与 NVR 生效，其余场景走市电/电池判断。"""
    s = f"{name} {desc}"
    if re.search(r"POE|PoE", s):
        # 窗帘电机与中控屏是低压直流设备，出现 PoE 多为产品族命名噪声
        return "poe", "名称/描述含 PoE"
    if re.search(r"电池|battery", s):
        return "battery", "含电池供电"
    if re.search(r"USB\s*供电|Type-?C\s*供电", s):
        return "usb", "明确含 USB 供电"
    if re.search(r"太阳能|solar", s):
        return "passive", "太阳能取电（无外供电）"
    if re.search(r"市电|AC 供电|220V|插头", s):
        return "ac-mains", "市电供电"
    return None, "未标明供电"

# ---- 安装方式 ----
def install_of(name, desc=""):
    s = f"{name} {desc}"
    if re.search(r"吸顶|ceiling", s, re.I):
        return "ceiling", "吸顶安装"
    if re.search(r"面板|86|wall|底盒", s, re.I):
        return "wall", "面板/墙装"
    if re.search(r"桌面|桌面版|desktop|摆台", s, re.I):
        return "desktop", "桌面摆放"
    return None, "未标明安装方式"

# ---- 使用环境（摄像机）----
def env_of(name, desc=""):
    s = f"{name} {desc}"
    if re.search(r"室外|户外|防水|IP\d|全彩|枪机|半球.*外", s):
        return "outdoor", "含室外/防水/枪机"
    if re.search(r"室内|云台", s):
        return "indoor", "含室内/云台"
    return None, "未标明室内外"

# ---- 联网方式（摄像机）----
def network_of(name, desc=""):
    s = f"{name} {desc}"
    if re.search(r"WiFi|Wi-Fi|wifi|WIFI", s):
        return "wifi", "含 Wi-Fi"
    if re.search(r"POE|网口|有线|以太网", s, re.I):
        return "ethernet", "含网口/有线"
    return None, "未标明联网方式"

# ---- 屏寸 ----
def screen_of(name, desc=""):
    s = f"{name} {desc}"
    # ★ 排除「屏幕尺寸待核」这类占位文字
    if re.search(r"屏幕尺寸待核|尺寸待核|待核", s):
        return None, "描述标注「待核」，尺寸未确证"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:英寸|吋|inch)", s, re.I)
    if m:
        return float(m.group(1)), f"含「{m.group(1)} 英寸」"
    m = re.search(r"(\d{2,3})[Ww]\b", s)
    if m and 60 <= int(m.group(1)) <= 300:   # 常见 10.1/11/12.9/15.6 寸对应 1280/1920 等分辨率不可靠，跳过
        return None, "分辨率数字不可靠"
    return None, "未标明屏幕尺寸"

def relay_of(kc, wiring):
    """继电器路数：控电型=键数；场景面板/无线面板=0"""
    if wiring is None or kc is None:
        return None, None
    return kc, f"控电型开关，继电器路数 = 按键数 {kc}"

def build(spec, typ):
    """按类型组装推导结果"""
    name = spec["name"] or ""
    model = spec["manufacturer_model"] or ""
    desc = spec["description"] or ""
    out, src = {}, {}

    if typ == "wall-switch":
        kc, why_k = key_count(name, model, desc)
        wg, why_w = wiring_of(name, model, desc)
        rl, why_r = relay_of(kc, wg)
        if kc: out["button_count"] = kc; src["button_count"] = why_k
        if wg: out["wiring"] = wg; src["wiring"] = why_w
        if rl is not None: out["relay_count"] = rl; src["relay_count"] = why_r
        # 负载：仅当描述里明确写了最大负载
        m = re.search(r"(?:最大负载|额定负载)[^0-9]{0,6}(\d{3,4})\s*W", desc)
        if m and int(m.group(1)) >= 100:
            out["max_load_w"] = int(m.group(1)); src["max_load_w"] = f"描述含「{m.group(1)}W」"

    elif typ in ("curtain-motor", "curtain-kit"):
        # 窗帘电机不走 PoE：市电或电池，排除 PoE 误判
        pw, why = power_of(name, desc)
        if pw == "poe": pw, why = None, "PoE 不适用于窗帘电机，已排除"
        if pw: out["power"] = pw; src["power"] = why
        # 描述里写「电池供电」才填 battery，否则市电
        if typ == "curtain-kit":
            # 套装：电机数量 + 是否含轨道
            m = re.search(r"双轨|双开|2\s*轨", name)
            if m: out["motor_count"] = 2; src["motor_count"] = "名称含双轨"
            if re.search(r"套装|kit", name, re.I):
                out["track_included"] = True; src["track_included"] = "名称含「套装」"
        if re.search(r"开合帘", name): out["track_type"] = "开合帘"; src["track_type"] = "含「开合帘」"
        elif re.search(r"卷帘|垂直帘|梦幻帘|罗马帘", name): out["track_type"] = "垂直帘"; src["track_type"] = "含卷帘/垂直帘"
        elif re.search(r"平开|推窗", name): out["track_type"] = "平开窗"; src["track_type"] = "含平开/推窗"
        # ★ 必须原文明写「承重/负载 X kg」，「额定功率 39W」不能推
        m = re.search(r"(?:承重|负载(?:力)?)[^0-9A-Za-z]{0,6}(\d{2,3})\s*(?:kg|KG|公斤|千克)", desc)
        if m: out["rated_load_kg"] = int(m.group(1)); src["rated_load_kg"] = f"描述含「{m.group(1)}kg」承重"

    elif typ == "wireless-ap":
        pw, why = power_of(name, desc)
        if pw: out["power"] = pw; src["power"] = why
        ins, whyi = install_of(name, desc)
        if ins: out["installation"] = ins; src["installation"] = whyi
        m = re.search(r"Wi-?\s?Fi\s?-?\s?([5-7])", f"{name} {desc}", re.I)
        if m: out["wireless_standard"] = f"Wi-Fi {m.group(1)}"; src["wireless_standard"] = f"含「Wi-Fi {m.group(1)}」"
        if pw == "poe": out["poe_input"] = True; src["poe_input"] = "PoE 供电"

    elif typ == "camera":
        ev, whyv = env_of(name, desc)
        pw, whyp = power_of(name, desc)
        nw, whyn = network_of(name, desc)
        if ev: out["environment"] = ev; src["environment"] = whyv
        if pw: out["power"] = pw; src["power"] = whyp
        if nw: out["network"] = nw; src["network"] = whyn
        ins, whyi = install_of(name, desc)
        if ins: out["installation"] = ins; src["installation"] = whyi
        m = re.search(r"可视角度[^0-9]{0,6}(\d{2,3})\s*[°度]", desc)
        if m: out["field_of_view_deg"] = int(m.group(1)); src["field_of_view_deg"] = f"描述含「{m.group(1)}°」"

    elif typ == "touch-control-panel":
        sc, whys = screen_of(name, desc)
        pw, whyp = power_of(name, desc)
        if sc: out["screen_size_in"] = sc; src["screen_size_in"] = whys
        if pw: out["power"] = pw; src["power"] = whyp
        # 继电器：面板屏通常 0（走总线/无线），纯面板=0
        out["relay_count"] = 0; src["relay_count"] = "触控中控屏本身不直接输出继电器"
        ins, whyi = install_of(name, desc)
        if ins: out["installation"] = ins; src["installation"] = whyi
        m = re.search(r"底盒深度[^0-9]{0,4}(\d{1,2})", desc)
        if m: out["box_depth_mm"] = int(m.group(1)); src["box_depth_mm"] = f"描述含「{m.group(1)}mm」"

    elif typ == "nvr":
        pw, whyp = power_of(name, desc)
        if pw: out["power"] = pw; src["power"] = whyp
        m = re.search(r"(\d{1,3})\s*路", name)
        if m: out["channel_count"] = int(m.group(1)); src["channel_count"] = f"名称含「{m.group(1)}路」"
        ins, whyi = install_of(name, desc)
        if ins: out["installation"] = ins; src["installation"] = whyi
        if re.search(r"PoE", name, re.I): out["poe_switch"] = True; src["poe_switch"] = "名称含 PoE"

    return out, src

def main():
    ids = json.loads(subprocess.run(
        ["node", "-e", """
import("pg").then(async ({Client}) => {
  const c = new Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:15432/fmkj"});
  await c.connect();
  const r = await c.query(`select id::text,sku,name,manufacturer_model,description,specs,device_type_id
    from products where deleted_at is null and device_type_id = any($1::text[])`, [TYPES]);
  console.log(JSON.stringify(r.rows));
  await c.end();
});
""".replace("TYPES", json.dumps(TARGET_TYPES))],
        capture_output=True, text=True).stdout.strip())

    filled, skipped = [], []
    for p in ids:
        newsp, src = build(p, p["device_type_id"])
        old = p["specs"] or {}
        merged = {**newsp, **old}      # 已有值优先，不覆盖
        changed = {k: v for k, v in merged.items() if old.get(k) != v}
        if not changed:
            skipped.append((p, "已有值或推不出新字段"))
            continue
        filled.append({
            "id": p["id"], "sku": p["sku"], "name": p["name"],
            "type": p["device_type_id"],
            "old": old, "new": changed, "merged": merged,
            "src": {k: src[k] for k in changed if k in src},
        })

    json.dump(filled, open("/tmp/spec_fill.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # 统计
    print(f"待补 {len(filled)} 条 / 共 {len(ids)} 条（未变动 {len(skipped)}）\n")
    import collections
    byType = collections.Counter(x["type"] for x in filled)
    fieldCnt = collections.Counter(k for x in filled for k in x["new"])
    print("按类型:", dict(byType))
    print("按字段:", dict(fieldCnt))
    print()
    for t in TARGET_TYPES:
        arr = [x for x in filled if x["type"] == t]
        if not arr: continue
        print(f"=== {t} {len(arr)} 条 ===")
        for x in arr[:14]:
            ns = json.dumps(x["new"], ensure_ascii=False)
            print(f"  {x['sku'][:26]:28}{ns}")
        if len(arr) > 14: print(f"  … 还有 {len(arr)-14} 条")
        print()

if __name__ == "__main__":
    main()