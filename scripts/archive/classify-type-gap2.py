#!/usr/bin/env python3
"""第二轮：处理 149 条剩余待定。易来吸顶灯靠「φ/cm/适用㎡/贴顶/背光」识别，套餐单列。"""
import json, re, subprocess, collections

def db_rows():
    code = """
import("pg").then(async ({Client}) => {
  const c = new Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:15432/fmkj"});
  await c.connect();
  const r = await c.query(`select id::text,sku,name,brand,category,mapping_revision,
    updated_at,description from products
    where deleted_at is null and device_type_id is null order by category,name`);
  console.log(JSON.stringify(r.rows.map(x=>({id:x.id,sku:x.sku,name:x.name,brand:x.brand,
    cat:x.category,rev:x.mapping_revision,upd:new Date(x.updated_at).toISOString(),
    desc:x.description||''}))));
  await c.end();
});
"""
    out = subprocess.run(["/Users/noonebook/.workbuddy/binaries/node/versions/22.22.2-6/bin/node","-e",code],
                         capture_output=True, text=True)
    return json.loads(out.stdout.strip())

# 易来吸顶灯识别线索（不靠"吸顶"字样，官方用系列名）
CEILING_HINT = re.compile(
    r"φ\s*\d|L\d+\s*cm|适用\s*\d+\s*-\s*\d+\s*㎡|无缝贴顶|悬浮背光|环绕光|"
    r"主卧|次卧|客厅灯|餐厅灯|餐吊")

RULES = [
 ("ceiling-light",  CEILING_HINT, "智能灯具"),
 ("exhaust-fan",    r"浴霸|凉霸|暖风机|排气扇", None),
 ("hvac-controller", r"六恒气候站|气候站|空气净化器|净化器|全热交换器|家用多联|多联\s*S", None),
 ("dimmer-controller", r"无极旋钮|旋钮开关", None),
 ("curtain-motor",  r"推窗器|开窗器", None),
 ("accessory",      r"继电器模块|光能板|配件|接头", None),
 ("motion-sensor",  r"人体|红外|雷达|存在", "传感器"),
 ("presence-sensor",r"存在|魔方", "传感器"),
 ("touch-control-panel", r"智能面板|面板", "网关中控"),
]

# 排除项：明确不是单品
EXCLUDE = [
 (r"\d\s*室\s*\d?\s*[厅卧]", "房型套餐"),
 (r"\*\s*\d+\s*\+", "套餐（件数拼接）"),
 (r"套装", "套装"),
 (r"不含电源", "灯带裸条（不含电源，非独立件）"),
 (r"配件包", "配件包"),
]

def main():
    rows = db_rows()
    print(f"待定总数 {len(rows)}\n")
    assign, park, g = [], [], collections.Counter()
    for r in rows:
        n = r["name"]
        hit_ex = None
        for pat, why in EXCLUDE:
            if re.search(pat, n):
                hit_ex = why; break
        if hit_ex:
            park.append((r, hit_ex)); g["C类·" + hit_ex] += 1; continue
        for t, pat, scope in RULES:
            if scope and scope != r["cat"]: continue
            probe = pat if hasattr(pat, "search") else re.compile(pat, re.I)
            if probe.search(n):
                assign.append((r, t, "规则匹配")); g[t] += 1; break
        else:
            park.append((r, "无规则命中")); g["C类·无规则命中"] += 1

    print("=== 本轮可映射 ===")
    for t, n in sorted(g.items(), key=lambda x: -x[1]):
        print(f"  {t:30} {n}")
    print(f"\n可映射 {len(assign)} | 单列 {len(park)}")

    json.dump({
      "assign":[{"id":r["id"],"sku":r["sku"],"name":r["name"],"type":t,"rev":r["rev"],"upd":r["upd"]}
                for r,t,_ in assign],
      "parked":[{"id":r["id"],"sku":r["sku"],"name":r["name"],"cat":r["cat"],
                 "brand":r["brand"],"reason":w} for r,w in park],
    }, open(".local/product-catalog-collection/20261016-type-gap/plan2.json","w",encoding="utf-8"),
       ensure_ascii=False, indent=1)
    print("→ plan2.json")
    print("\n=== 单列明细（前 20）===")
    for r, w in park[:20]:
        print(f"  [{w:22}] {str(r['brand'] or '')[:12]:12} {r['name'][:52]}")

if __name__ == "__main__":
    main()