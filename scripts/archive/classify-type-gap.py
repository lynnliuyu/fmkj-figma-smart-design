#!/usr/bin/env python3
"""拆解 253 条无设备类型记录：能映射的直接给类型，缺类型的分诊。"""
import json, re, subprocess, collections

# —— 现有类型字典（从 lib/device-types.ts 抄一份关键映射）——
EXISTING = {
    "downlight":"筒灯","spotlight":"射灯","track-light":"磁吸轨道灯","pendant-light":"吊灯",
    "wall-light":"壁灯","lighting-power-supply":"灯具电源","panel-light":"平板灯",
    "grille-light":"格栅灯","fan-light":"风扇灯","wall-switch":"墙壁开关",
    "socket":"插座","curtain-motor":"窗帘电机","door-lock":"门锁","camera":"摄像头",
    "doorbell":"门铃","sensor":"传感器","motion-sensor":"人体移动传感器",
    "presence-sensor":"人体存在传感器","smart-speaker":"智能音箱","ceiling-speaker":"吸顶音箱",
    "smart-home-gateway":"智能家居网关","touch-control-panel":"触控中控屏",
    "hvac-controller":"暖通控制器","air-conditioner":"空调设备","exhaust-fan":"排气扇",
    "smart-bulb":"智能灯泡","light-strip":"灯带","ceiling-light":"吸顶灯",
    "scene-panel":"场景面板","keyed-control-panel":"按键控制面板","dimmer-controller":"调光控制器",
    "accessory":"安装配件","water-leak-sensor":"水浸传感器","smoke-sensor":"烟雾报警器",
    "temperature-sensor":"温度传感器","humidity-sensor":"湿度传感器","light-sensor":"光照传感器",
    "wireless-ap":"无线AP","network-switch":"网络交换机","router":"路由器",
    "wlan-controller":"无线AC控制器","valve-controller":"阀门控制器","ir-blaster":"红外网关",
}

def db_rows():
    code = """
import("pg").then(async ({Client}) => {
  const c = new Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:15432/fmkj"});
  await c.connect();
  const r = await c.query(`select id::text,sku,name,brand,category,mapping_revision,
    updated_at,specs,description,tags from products
    where deleted_at is null and device_type_id is null order by category,name`);
  console.log(JSON.stringify(r.rows.map(x=>({id:x.id,sku:x.sku,name:x.name,brand:x.brand,
    cat:x.category,rev:x.mapping_revision,upd:new Date(x.updated_at).toISOString(),
    specs:Object.keys(x.specs??{}).length,desc:x.description||''}))));
  await c.end();
});
"""
    out = subprocess.run(["/Users/noonebook/.workbuddy/binaries/node/versions/22.22.2-6/bin/node","-e",code],
                         capture_output=True, text=True)
    return json.loads(out.stdout.strip())

# —— 规则：分类限定 + 名称关键词，按优先级顺序匹配 ——
# (类型, 关键词正则, 限定分类)
RULES = [
 # —— 灯带（字典缺，需新增）——
 ("light-strip",  r"智能(?:裸条)?灯带|灯带(?!\s*配件)|裸条灯带|COB智能灯带", "智能灯具"),
 # —— 吸顶灯（字典缺）——
 ("ceiling-light", r"吸顶|卧室灯|客厅灯|餐厅灯|主卧灯|次卧灯", "智能灯具"),
 # —— 已有类型 ——
 ("grille-light", r"格栅灯", "智能灯具"),
 ("panel-light",  r"平板灯|面板灯|净玉", "智能灯具"),
 ("fan-light",    r"风扇灯|扇灯", "智能灯具"),
 ("downlight",    r"筒灯", "智能灯具"),
 ("spotlight",    r"射灯", "智能灯具"),
 ("track-light",  r"磁吸|轨道灯", "智能灯具"),
 ("pendant-light",r"吊灯", "智能灯具"),
 ("wall-light",   r"壁灯", "智能灯具"),
 ("smart-bulb",   r"灯泡|球泡", "智能灯具"),
 ("lighting-power-supply", r"^.{0,12}(?:必买)?(?:恒压)?(?:灯具|灯带)?电源(?:驱动)?(?:$|[^\u4e00-\u9fff])|驱动电源", "智能灯具"),
 # —— 开关类 ——
 ("dimmer-controller", r"调光(?:器|控制器|模块)|旋钮.*调光", None),
 ("wall-switch",   r"开关|面板|旋钮|按键", "开关"),
 # —— 暖通 ——
 ("exhaust-fan",   r"浴霸|凉霸|暖风机|排气扇|换气扇", None),
 ("valve-controller", r"阀门|地暖|水路|温控阀", None),
 ("hvac-controller", r"空调|VRF|多联机|温控|新风|风机盘管|中央空调|风管", None),
 # —— 传感器 ——
 ("water-leak-sensor", r"水浸|漏水", None),
 ("smoke-sensor",  r"烟雾", None),
 ("presence-sensor", r"存在", None),
 ("motion-sensor", r"人体|红外|PIR|移动|雷达", None),
 ("temperature-sensor", r"温度|温湿度", None),
 # —— 窗帘 ——
 ("curtain-motor", r"窗帘|卷帘|梦幻帘|遮阳|窗帘伴侣|窗帘电机", "窗帘"),
 # —— 中控 / 网关 ——
 ("touch-control-panel", r"中控屏|触屏|面板屏|智能屏|家庭屏|显示屏", None),
 ("smart-home-gateway", r"网关|主机|中枢", "网关中控"),
 # —— 监控 ——
 ("doorbell", r"门铃|猫眼", None),
 ("camera", r"摄像|摄像头|监控|IPC", None),
 # —— 其它 ——
 ("sensor", r"传感器|感应", "传感器"),
]

# 明确排除：套餐 / 配件包 / 非单件
EXCLUDE = [
  (r"\d\s*室\s*\d\s*厅", "房型套餐"),
  (r"\*\s*\d+\s*\+", "套餐（件数拼接）"),
  (r"配件包|接头|配件", "配件包"),
  (r"套装", "套装（非单件）"),
  (r"不含电源|不含电源驱动", "灯带裸条（无电源，非独立可售件）"),
  (r"面板-白?色$", "空白面板（无按键）"),
]

def classify(row):
    n, cat = row["name"], row["cat"]
    for pat, why in EXCLUDE:
        if re.search(pat, n):
            return None, f"C类·{why}"
    for t, pat, scope in RULES:
        if scope and scope != cat: continue
        if re.search(pat, n, re.I):
            return t, "规则匹配"
    return None, "无规则命中"

def main():
    rows = db_rows()
    print(f"待定总数 {len(rows)}\n")
    assign, undec = [], []
    g = collections.Counter()
    for r in rows:
        t, why = classify(r)
        if t and t in EXISTING:
            assign.append((r, t, why)); g[t] += 1
        else:
            undec.append((r, why))
            g[why if why.startswith("C") else "C类·无规则命中"] += 1

    print("=== 可直接映射 ===")
    for t, n in sorted(g.items(), key=lambda x: -x[1]):
        if t in EXISTING: print(f"  {t:24} {EXISTING[t]:10} {n:>4}")
    print(f"\n小计可映射 {len(assign)}")
    print(f"待人工判定 {len(undec)}")
    gc = collections.Counter(w for _, w in undec)
    print("\n=== 待人工判定构成 ===")
    for w, n in gc.most_common(): print(f"  {w:38} {n}")

    json.dump({
      "assign":[{"id":r["id"],"sku":r["sku"],"name":r["name"],"type":t,"rev":r["rev"],"upd":r["upd"]}
                for r,t,_ in assign],
      "undecided":[{"id":r["id"],"sku":r["sku"],"name":r["name"],"cat":r["cat"],"brand":r["brand"],"reason":w}
                for r,w in undec],
    }, open(".local/product-catalog-collection/20261016-type-gap/plan.json","w",encoding="utf-8"),
       ensure_ascii=False, indent=1)
    print("\n→ .local/product-catalog-collection/20261016-type-gap/plan.json")

if __name__ == "__main__":
    main()