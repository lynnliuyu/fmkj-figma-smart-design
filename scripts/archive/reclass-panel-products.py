#!/usr/bin/env python3
"""为恢复 scene-panel / keyed-control-panel 后重新归类的 16 条记录生成变更集。
判定依据见每条 reason；不确定的一律不归类。
"""
import json, subprocess, uuid, datetime, os

OUT = ".local/product-catalog-collection/20261016-panel-reclass/model-changes.json"
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# (sku, 目标类型, 依据)
ASSIGN = [
 # —— 场景面板 scene-panel：场景/情景触发类，无继电器 ——
 ("LINPTECH-WIRELESS-1K", "scene-panel", "领普无线场景开关单键：仅发场景指令不控电，relay_count=0，power=battery"),
 ("LINPTECH-WIRELESS-2K", "scene-panel", "领普无线场景开关双键：同上"),
 ("LINPTECH-WIRELESS-4K", "scene-panel", "领普无线场景开关四键：同上"),
 ("PTX-AK", "scene-panel", "平头熊 AK 智能场景开关：描述明写「场景控制器/场景联动」，蓝牙Mesh 2.0，无继电器"),
 ("PTX-AK-PRO", "scene-panel", "平头熊 AK Pro 智能场景开关：同上"),
 ("PTX-AK-ULTRA", "scene-panel", "平头熊 AK Ultra 屏显场景开关：屏显按键指引 + 场景联动，无继电器"),
 ("PTX-X6-ROTARY", "scene-panel", "平头熊 X6 无线情景旋钮：描述「支持4场景自定义，免布线」，旋钮不控电"),
 ("XLSX-CLEAN-0139", "scene-panel", "Yeelight M1 情景开关-白色-六键：情景触发型，非通断开关"),
 ("XLSX-CLEAN-0151", "scene-panel", "Yeelight M1 情景开关-灰色-六键：同上"),
 ("XLSX-CLEAN-0094", "scene-panel", "Yeelight T2 情景开关-四键-白色：蓝牙纽扣电池版，必为免布线情景触发"),
 ("XLSX-CLEAN-0098", "scene-panel", "Yeelight T2 情景开关-电池板-四键-灰色：同上"),
 ("XLSX-CLEAN-0357", "scene-panel", "Yeelight T1/T2 情景开关-四键-白色：同上"),
 ("XLSX-CLEAN-0361", "scene-panel", "Yeelight T1/T2 情景开关-四键-灰色：同上"),
 # —— 按键控制面板 keyed-control-panel：物理按键 + 继电器通断 ——
 ("SUMI-PNL2", "keyed-control-panel", "苏米缤纷面板2（玻璃）：渠道价明细含「零火 2/3/4/8键」，证实是按键通断面板"),
 ("SUMI-PNL2-2", "keyed-control-panel", "苏米缤纷面板2（金属）：渠道价明细含「零火 2/4/8键」，同上"),
 ("SUMI-PNL2-3", "keyed-control-panel", "苏米缤纷面板2（PC）：渠道价明细含「零火 2/3/8键」，同上"),
]

def db_rows(skus):
    code = """
import("pg").then(async ({Client}) => {
  const c = new Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:15432/fmkj"});
  await c.connect();
  const r = await c.query(`select id::text,sku,name,mapping_revision,updated_at,device_type_id,specs
    from products where deleted_at is null and sku = any($1::text[])`, [SKUS]);
  console.log(JSON.stringify(r.rows.map(x=>({id:x.id,sku:x.sku,name:x.name,rev:x.mapping_revision,
    upd:new Date(x.updated_at).toISOString(),type:x.device_type_id,specs:Object.keys(x.specs??{}).length}))));
  await c.end();
});
""".replace("SKUS", json.dumps(skus))
    out = subprocess.run(["/Users/noonebook/.workbuddy/binaries/node/versions/22.22.2-6/bin/node", "-e", code],
                         capture_output=True, text=True)
    return json.loads(out.stdout.strip())

def main():
    skus = [a[0] for a in ASSIGN]
    rows = {r["sku"]: r for r in db_rows(skus)}
    changes, miss, skip = [], [], []
    for sku, target, why in ASSIGN:
        r = rows.get(sku)
        if not r:
            miss.append(sku); continue
        if r["type"] == target:
            skip.append((sku, "已是目标类型")); continue
        if r["specs"] > 0:
            skip.append((sku, f"已有 {r['specs']} 项规格，CLI 禁止带规格改类型")); continue
        changes.append({
            "productId": r["id"], "sku": sku,
            "expectedMappingRevision": r["rev"], "expectedUpdatedAt": r["upd"],
            "before": {"deviceTypeId": r["type"]},
            "after": {"deviceTypeId": target},
            "reason": f"归类为 {target}：{why}",
        })
    doc = {
        "format": "fmkj-product-mapping-review", "version": 1,
        "auditedAt": datetime.datetime.now().isoformat(),
        "changeId": str(uuid.uuid4()),
        "notice": "恢复 scene-panel / keyed-control-panel 两个设备类型后，把 2026-10-15 因类型缺失被置空的记录重新归类。依据：产品描述中的场景联动/通断键数与渠道价明细中的键数规格。",
        "changes": changes,
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"变更集 {len(changes)} 条 → {OUT}")
    for c in changes:
        print(f"  {c['sku']:26} → {c['after']['deviceTypeId']}")
    if miss: print(f"\n库中未找到: {miss}")
    for s, why in skip: print(f"跳过 {s}: {why}")

if __name__ == "__main__":
    main()