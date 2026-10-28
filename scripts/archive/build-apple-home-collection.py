import json, os, re, datetime

BASE = "/Users/noonebook/Documents/ChatGPT/繁梦空间设计站"
AQ = json.load(open(f"{BASE}/.local/product-catalog-collection/20261016-aqara-home/collected-aqara.json", encoding="utf-8"))
AP = json.load(open(f"{BASE}/.local/product-catalog-collection/20261016-apple-home/collected-apple.json", encoding="utf-8"))
TODAY = "2026-10-16"

hk = [p for p in AQ["products"] if p.get("homekitSupport") and any("Apple" in x for x in p["homekitSupport"])]
pending = [p for p in hk if not p.get("existingSku")]

# ---------- 设备类型与参数映射（逐条人工核定，不用名称猜） ----------
# key: 产品名 -> (deviceTypeId, category, unit, protocols, capabilities, note)
M = {
 "Aqara 智能墙壁开关 H1 Pro（零火·单键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"H1 Pro 系列；HomeKit 下按键与配网能力与 Aqara Home 一致"),
 "Aqara 智能墙壁开关 H1 Pro（零火·双键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"H1 Pro 系列"),
 "Aqara 智能墙壁开关 H1（单火线·单键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"H1 系列（单火）"),
 "Aqara 智能墙壁开关 H1（单火线·双键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"H1 系列（单火）"),
 "Aqara 智能墙壁开关 H1（单火线·三键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"H1 系列（单火）"),
 "Aqara 智能墙壁开关 D1（单火线·单键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"D1 系列；官网明示 HomeKit 仅支持单键/双键版"),
 "Aqara 智能墙壁开关 D1（单火线·双键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"D1 系列；官网明示 HomeKit 仅支持单键/双键版"),
 "Aqara 智能墙壁开关 D1（零火线·单键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"D1 系列"),
 "Aqara 智能墙壁开关 D1（零火线·双键版）": ("wall-switch","开关","个",["zigbee"],["load-control"],"D1 系列"),
 "Aqara 智能墙壁开关 L1（零火·单键）": ("wall-switch","开关","个",["zigbee"],["load-control"],"L1 系列，低价位；同时支持米家"),
 "Aqara 智能墙壁开关 L1（零火·双键）": ("wall-switch","开关","个",["zigbee"],["load-control"],"L1 系列"),
 "Aqara 智能墙壁开关 L1（零火·三键）": ("wall-switch","开关","个",["zigbee"],["load-control"],"L1 系列"),
 "Aqara 智能墙壁开关 L1（单火·单键）": ("wall-switch","开关","个",["zigbee"],["load-control"],"L1 系列"),
 "Aqara 智能墙壁开关 L1（单火·双键）": ("wall-switch","开关","个",["zigbee"],["load-control"],"L1 系列"),
 "Aqara 智能墙壁插座（Zigbee 版）": ("socket","插座","个",["zigbee"],["load-control"],"同时支持米家"),
 "Aqara 单色温一体式筒射灯 T3": ("downlight","智能灯具","个",["zigbee"],["dimming"],"⚠ HomeKit 下色温锁死 3500K/4000K，自适应照明不可用"),
 "Aqara LED 灯泡 T1（可调色温）": (None,"智能灯具","个",["zigbee"],["dimming"],"类型字典缺「灯泡」，角色待确认"),
 "Aqara 双色温驱动器 T1 Pro": ("dimmer-controller","开关","个",["zigbee"],["dimming","load-control"],"驱动类，调光方式待核"),
 "Aqara 人体传感器 E1": ("motion-sensor","传感器","个",["zigbee"],["sensing"],"PIR 人体移动；同时支持米家"),
 "Aqara 智能门锁 A100 Pro": ("door-lock","门锁","个",["bluetooth","zigbee","wifi"],[],"支持 Apple 家庭钥匙；锁体/门型参数待核"),
 "Aqara 智能门锁 N100": ("door-lock","门锁","个",["bluetooth","zigbee","wifi"],[],"同时支持米家；锁体/门型参数待核"),
 "Aqara 智能门锁 N200": ("door-lock","门锁","个",["bluetooth","zigbee","wifi"],[],"官网未公布型号代码；锁体/门型参数待核"),
 "Aqara 全自动智能推拉锁 D100": ("door-lock","门锁","个",["bluetooth","zigbee","wifi"],[],"推拉锁；锁体/门型参数待核"),
 "Aqara 智能窗帘电机 C2": ("curtain-motor","窗帘","个",["zigbee"],["curtain-control"],"开合帘电机；适配轨道类型待核"),
 "Aqara 智能窗帘电机 C3": ("curtain-motor","窗帘","个",["zigbee"],["curtain-control"],"开合帘电机；适配轨道类型待核"),
 "Aqara 智能窗帘电机 T2": ("curtain-motor","窗帘","个",["zigbee"],["curtain-control"],"电机；适配轨道类型待核"),
 "Aqara 智能梦幻帘 H1": ("curtain-motor","窗帘","个",["zigbee"],["curtain-control"],"梦幻帘（开合帘）；适配轨道类型待核"),
 "Aqara 智能窗帘伴侣 E1": ("accessory","其他","个",["zigbee"],["curtain-control"],"窗帘伴侣，需外配电机，非独立电机"),
 "Aqara 智能卷帘伴侣 E1": ("accessory","其他","个",["zigbee"],["curtain-control"],"卷帘伴侣，需外配电机"),
 "Aqara 智能摄像机 G3（网关版）": ("camera","监控","台",["wifi","zigbee"],["monitoring","gateway"],"摄像机内置 Zigbee 网关；HomeKit 下仅实时画面与对讲，本地 AI 识别不可用"),
 "Aqara 智能摄像机 G100": ("camera","监控","台",["wifi"],["monitoring"],"HomeKit 下仅实时画面与对讲"),
 "Aqara 智能摄像机 E1": ("camera","监控","台",["wifi"],["monitoring"],"HomeKit 下仅实时画面与对讲"),
 "Aqara 智能可视门铃 G400": ("doorbell","门锁","台",["wifi","zigbee"],["monitoring"],"HomeKit 下不含本地 AI 识别"),
 "Aqara 智能可视门铃 G410（网关版）": ("doorbell","门锁","台",["wifi","zigbee"],["monitoring","gateway"],"门铃内置 Zigbee 网关"),
 "Aqara 网关 M2": ("smart-home-gateway","网关中控","台",["wifi","zigbee","bluetooth","infrared"],["gateway"],"Zigbee→HomeKit 桥接 + 红外网关；接入容量待核"),
 "Aqara 集悦妙控屏 S1 Plus（桌面版）": ("touch-control-panel","网关中控","台",["wifi","zigbee"],["scene-trigger"],"桌面版；屏幕尺寸待核"),
 "Aqara 妙控开关 S1E": (None,"开关","个",["zigbee"],["scene-trigger"],"类型字典缺「场景面板」，角色为场景触发非负载控制"),
 "Aqara 空调伴侣 P3": ("hvac-controller","暖通控制","个",["zigbee","infrared"],["hvac-control"],"空调伴侣，控制既有空调；适配机型待核"),
 "Aqara 无线开关 D1（贴墙式·单键）": (None,"开关","个",["zigbee"],["scene-trigger"],"无线场景开关（免布线），类型字典缺「场景面板」"),
 "Aqara 无线开关 D1（贴墙式·双键）": (None,"开关","个",["zigbee"],["scene-trigger"],"无线场景开关（免布线），类型字典缺「场景面板」"),
}

def num(s):
    if s is None: return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", str(s).replace(",", ""))
    return float(m.group(1)) if m else None

WIRING = {"零火线(neutral)": "neutral", "单火线(no-neutral)": "no-neutral",
          "零火": "neutral", "单火": "no-neutral"}

def build_specs(p, dtype):
    ks = p.get("keySpecs") or {}
    s = {}
    if dtype == "wall-switch":
        if ks.get("按键数") is not None: s["button_count"] = int(ks["按键数"])
        w = ks.get("接线方式")
        if w:
            for k, v in WIRING.items():
                if k in str(w): s["wiring"] = v; break
        load = num(ks.get("最大负载"))
        if load: s["max_load_w"] = load
        # relay_count 未知 —— 规范要求仅在证实无继电器输出时才填 0
    elif dtype == "socket":
        cur = num(ks.get("额定电流") or ks.get("额定参数") or ks.get("额定电压"))
        if cur and cur < 100: s["rated_current_a"] = cur
    elif dtype == "dimmer-controller":
        s["dimming"] = "双色温"   # 产品名明示双色温
    elif dtype == "curtain-motor":
        s["power"] = "ac-mains"
        t = ks.get("电机类型")
        if t: s["track_type"] = str(t)
    elif dtype == "camera":
        env = "indoor" if "室内" in p["name"] else None
        if env: s["environment"] = env
        s["network"] = "wifi"
    elif dtype == "doorbell":
        s["power"] = "battery" if "电池" in str(ks) else None
        if not s["power"]: del s["power"]
        s["environment"] = "outdoor"
    elif dtype == "motion-sensor":
        s["power"] = "battery"
    elif dtype == "smart-home-gateway":
        s["power"] = "dc"
    elif dtype == "accessory":
        s["accessory_compatibility"] = "Aqara 窗帘电机（需外配）"
    elif dtype == "hvac-controller":
        s["power"] = "dc"
    return {k: v for k, v in s.items() if v is not None}

def sku_of(name, model):
    m = re.sub(r"^Aqara\s*", "", name)
    m = re.sub(r"[（）()·\s]+", "-", m)
    m = re.sub(r"-+", "-", m).strip("-")
    return "AQARA-" + m.upper()[:48]

records = []

# ---------- Aqara 40 款 ----------
for p in pending:
    name = p["name"]
    if name not in M:
        print("!! 未映射，跳过:", name); continue
    dtype, cat, unit, proto, caps, note = M[name]
    ks = p.get("keySpecs") or {}
    ev = f"型号与参数来源：Aqara 官网产品参数页 {p.get('sourceUrl')}（采集 {TODAY}）。" \
         f"Apple 家庭支持依据：该页列明支持 {', '.join(p.get('homekitSupport') or [])}。" \
         f"继电器路数官网未标注，按规范留空不猜填。"
    desc_bits = [f"支持 {'、'.join(p.get('homekitSupport') or [])}"]
    for k in ["无线连接", "无线协议"]:
        if ks.get(k): desc_bits.append(f"{k}：{ks[k]}"); break
    for k, v in ks.items():
        if k in ("按键数", "接线方式", "最大负载", "额定参数", "额定电压", "额定功率", "产品尺寸", "开孔尺寸",
                 "光束角", "色温", "显色指数", "开锁方式", "锁体", "电池", "应急供电", "分辨率", "可视角度",
                 "云台角度", "本地存储", "输入电压", "电机类型", "工作温度", "产品净重", "执行标准", "芯片", "麦克风数量"):
            desc_bits.append(f"{k}：{v}")
    if note: desc_bits.append(note)
    records.append({
        "action": "create", "applyReady": True, "existingProductId": None, "expectedMappingRevision": None,
        "deduplication": {"checkedAt": TODAY, "matchedProductIds": [], "decision": "new", "reason": "按品牌+型号+键数/接线方式查重，库中无同型号记录"},
        "product": {
            "name": name, "sku": sku_of(name, p.get("model")), "brand": "Aqara", "platform": "Apple Home",
            "category": cat, "unit": unit, "price": 0, "cost": 0, "stock": 0, "image": None,
            "description": "；".join(str(x) for x in desc_bits if x),
            "tags": ["Apple Home", "HomeKit"] + (["Aqara Home 双平台"] if any("米家" in x for x in (p.get("homekitSupport") or [])) else []),
            "channels": ["Aqara 官网"], "status": "pending_review", "catalogKind": "sku",
            "deviceTypeId": dtype, "parentProductId": None, "manufacturerModel": p.get("model"),
            "specs": build_specs(p, dtype), "protocols": proto, "capabilities": caps,
            "selectionStatus": "pending", "selectionEvidence": ev,
            "pricingStatus": "pending",
            "pricingEvidence": "Aqara 官网产品页不公示售价（仅跳转京东自营），本机环境无法访问京东价格接口；售价与成本未知，0 仅为系统占位，不表示免费或零成本。",
        },
        "sources": [{"sourceId": f"S{len(records)+1}", "kind": "manufacturer-spec", "title": f"Aqara 官网参数页 · {name}",
                     "url": p.get("sourceUrl"), "collectedAt": TODAY,
                     "applicableModelAndVariant": name, "observations": [f"Apple 家庭支持：{p.get('homekitSupport')}"]}],
        "priceQuotes": [], "conflicts": [], "before": None, "writeResult": None,
        "missing": ["售价与成本待补（官网未公示）", "产品净图待采（官网 SSR 未暴露商品图，电商站点反爬）"],
    })

# ---------- Apple 官方 2 款（大陆在售） ----------
APPLE = [
 ("APPLE-HOMEPOD-MINI-2", "Apple HomePod mini 2", "MGHJ4CH/A、MGHK4CH/A、MGHL4CH/A、MGHM4CH/A、MGKR4CH/A", 1099,
  {"芯片": "Apple S10", "麦克风": "3 麦克风远场 Siri", "扬声器": "全频驱动单元 + 双振动抵消无源辐射器 + 定制声波导（360 度声场）",
   "传感器": "温度和湿度传感器", "Wi-Fi": "802.11ax", "蓝牙": "蓝牙 6", "其他": "Thread 网络技术、UWB 芯片"},
  "2026-10-13 发布，2026-10-30 发售"),
 ("APPLE-HOMEPOD-2ND", "Apple HomePod（第二代）", "MDF04CH/A（白色）、MDEX4CH/A（午夜色）", 2699,
  {"芯片": "Apple 芯片（官网未公开具体型号）", "麦克风": "4 麦克风远场 Siri + 低音均衡器麦克风",
   "扬声器": "4 英寸高振幅低音单元 + 五个号角负载钕磁体高音单元阵列，支持杜比全景声空间音频",
   "传感器": "温度和湿度传感器 + 加速感应器", "Wi-Fi": "802.11n（Wi-Fi 4）", "蓝牙": "蓝牙 5.0",
   "其他": "Thread 网络技术、UWB 芯片"},
  "⚠ 无线规格为上一代（Wi-Fi 4 / 蓝牙 5.0），新项目若需 Matter/UWB 感知建议选 HomePod mini 2"),
]
by_name = {p["name"]: p for p in AP["products"]}
for sku, name, model, price, ks, note in APPLE:
    src = by_name.get(name.replace("Apple ", ""), {})
    url = src.get("sourceUrl") or "https://www.apple.com.cn/"
    ev = (f"型号、售价与规格来源：Apple 中国大陆官网 {url}（采集 {TODAY}）。"
          f"官网标注支持操控「HomeKit 配件与支持 Matter 的配件」，Matter 在中国区可用。")
    desc_bits = [f"{k}：{v}" for k, v in ks.items() if v] + [note,
                 "HomeKit 角色：语音中枢 / 家庭中枢（Thread 边界路由器）/ 音频播放",
                 "中国大陆 Apple 官网在售"]
    records.append({
        "action": "create", "applyReady": True, "existingProductId": None, "expectedMappingRevision": None,
        "deduplication": {"checkedAt": TODAY, "matchedProductIds": [], "decision": "new", "reason": "库中无 Apple 官方 HomeKit 产品"},
        "product": {
            "name": name, "sku": sku, "brand": "Apple/苹果", "platform": "Apple Home",
            "category": "网关中控", "unit": "台", "price": price, "cost": 0, "stock": 0, "image": None,
            "description": "；".join(desc_bits), "tags": ["Apple Home", "HomeKit", "Apple 官方", "中国大陆在售"],
            "channels": ["Apple 中国大陆官网"], "status": "pending_review", "catalogKind": "sku",
            "deviceTypeId": "smart-speaker", "parentProductId": None, "manufacturerModel": model,
            "specs": {"power": "ac-mains", "installation": "desktop"},
            "protocols": ["wifi", "bluetooth", "thread"], "capabilities": ["voice-control", "audio"],
            "selectionStatus": "pending", "selectionEvidence": ev,
            "pricingStatus": "pending",
            "pricingEvidence": f"售价 {price} 元来自 Apple 中国大陆官网商店页（采集 {TODAY}）；成本未知，0 为占位。",
        },
        "sources": [{"sourceId": "SA1", "kind": "manufacturer-product", "title": f"Apple 中国大陆官网 · {name}",
                     "url": url, "collectedAt": TODAY, "applicableModelAndVariant": name, "observations": []}],
        "priceQuotes": [], "conflicts": [], "before": None, "writeResult": None,
        "missing": ["成本待补", "产品净图待采"],
    })

out = {
    "format": "fmkj-product-catalog-collection", "version": 1,
    "notice": "仅为采集底稿；不是批量导入格式。通过管理员 API 逐条写入。",
    "batchId": "20261016-apple-home",
    "collectedAt": TODAY,
    "targetEnvironment": {"baseUrl": "http://localhost:3000", "databaseHost": "127.0.0.1",
                          "databasePort": 15432, "databaseName": "fmkj", "checkedAt": TODAY},
    "records": records,
}
path = f"{BASE}/.local/product-catalog-collection/20261016-apple-home/collection.json"
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

import collections
print(f"底稿已生成：{path}")
print(f"记录数：{len(records)}（Apple {len(APPLE)} + Aqara {len(records)-len(APPLE)}）")
print("\n按设备类型:")
for t, n in collections.Counter(r["product"]["deviceTypeId"] or "(类型待定)" for r in records).most_common():
    print(f"  {str(t):24} {n}")
print("\n有型号的:", sum(1 for r in records if r["product"]["manufacturerModel"]), "/", len(records))
print("有价格的:", sum(1 for r in records if r["product"]["price"] > 0), "/", len(records))
print("SKU 唯一:", len({r["product"]["sku"] for r in records}) == len(records))