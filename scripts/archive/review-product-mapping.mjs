import { registerHooks } from "node:module"
import fs from "node:fs/promises"
import pg from "pg"

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context) } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(specifier + ".ts", context)
    throw error
  }
} })
const { normalizeProductSelectionFields } = await import("../lib/product-selection.ts")
const { deviceTypes } = await import("../lib/device-types.ts")
const args = process.argv.slice(2)
const option = (name) => { const i = args.indexOf(name); if (i < 0) return undefined; const value = args[i + 1]; if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`); return value }
const mode = args[0] ?? "audit"
if (!["audit", "apply", "rollback", "seed-types"].includes(mode)) throw new Error("Usage: node --env-file=.env.local scripts/review-product-mapping.mjs audit --out FILE | apply --changes FILE --actor UUID | rollback --change-id ID --actor UUID | seed-types")
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false })
await client.connect()
const snapshotSql = await fs.readFile(new URL("./backfill-quote-product-snapshots.sql", import.meta.url), "utf8")
try {
  if (mode === "seed-types") {
    await client.query("begin")
    for (const type of deviceTypes) await client.query(`insert into device_types(id,name,category,default_icon_id,allowed_icon_ids,definition_version,spec_schema) values($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) on conflict(id) do update set name=excluded.name,category=excluded.category,default_icon_id=excluded.default_icon_id,allowed_icon_ids=excluded.allowed_icon_ids,definition_version=excluded.definition_version,spec_schema=excluded.spec_schema,updated_at=now()`, [type.id, type.name, type.category, type.defaultIconId, JSON.stringify(type.allowedIconIds), type.version, JSON.stringify(type.specs)])
    await client.query("commit"); console.log(JSON.stringify({ seededTypes: deviceTypes.length }));
  } else if (mode === "audit") {
    await client.query("begin read only")
    const products = (await client.query(`select id::text,name,sku,category,device_type_id,catalog_kind,selection_status,pricing_status,mapping_revision,updated_at from products where deleted_at is null order by name`)).rows
    const quoteRefs = (await client.query(`select product_id::text,count(*)::int count from quote_items where deleted_at is null group by product_id`)).rows
    const pointRefs = (await client.query(`select point->>'productId' product_id,count(*)::int count from project_point_map_designs d cross join lateral jsonb_array_elements(d.plan->'points') point where coalesce(point->>'productId','')<>'' group by point->>'productId'`)).rows
    const changes = products.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, expectedMappingRevision: p.mapping_revision, expectedUpdatedAt: new Date(p.updated_at).toISOString(), before: { catalogKind: p.catalog_kind, deviceTypeId: p.device_type_id }, after: {}, reason: "待人工核对；填入明确的设备类型或系列身份后再应用", references: { quoteItems: quoteRefs.find((r) => r.product_id === p.id)?.count ?? 0, points: pointRefs.find((r) => r.product_id === p.id)?.count ?? 0 } }))
    const report = { format: "fmkj-product-mapping-review", version: 1, auditedAt: new Date().toISOString(), changeId: crypto.randomUUID(), notice: "只读变更模板。after 为空不更新；只支持类型/系列/型号整理，不能据此证明参数已核验。", changes }
    await fs.writeFile(option("--out") || ".local/product-mapping-review.json", JSON.stringify(report, null, 2)); await client.query("rollback"); console.log(JSON.stringify({ products: products.length, changed: 0, mode: "dry-run" }))
  } else {
    const actor = option("--actor")
    if (!/^[0-9a-f-]{36}$/i.test(actor ?? "")) throw new Error("A valid --actor UUID is required")
    await client.query("begin")
    const actorRow = await client.query(`select id from users where id=$1::uuid and role in ('admin','super_admin','platform_admin') and status::text='active'`, [actor])
    if (!actorRow.rows.length) throw new Error("Only an active platform administrator may apply a review")
    let changeId, changes
    if (mode === "rollback") {
      changeId = option("--change-id")
      const log = await client.query(`select entity_id::text, metadata from activity_logs where action='product.mapping-reviewed' and metadata->>'changeId'=$1 order by occurred_at desc`, [changeId])
      if (!log.rows.length) throw new Error("No matching applied review")
      changes = log.rows.map((row) => ({ productId: row.entity_id, expectedMappingRevision: row.metadata.afterRevision, after: row.metadata.before, reason: `回退整理 ${changeId}` }))
      changeId = crypto.randomUUID()
    } else {
      const report = JSON.parse(await fs.readFile(option("--changes"), "utf8"))
      if (report.format !== "fmkj-product-mapping-review" || report.version !== 1 || !Array.isArray(report.changes)) throw new Error("Unsupported review file")
      changeId = report.changeId
      changes = report.changes.filter((change) => change.after && Object.keys(change.after).length)
    }
    if (!changeId || changes.length > 2000 || new Set(changes.map((c) => c.productId)).size !== changes.length) throw new Error("Invalid or duplicate review changes")
    if (mode === "apply") {
      const applied = await client.query(`select entity_id::text, metadata from activity_logs where action='product.mapping-reviewed' and metadata->>'changeId'=$1`, [changeId])
      if (applied.rows.length) {
        if (applied.rows.length !== changes.length || changes.some((change) => !applied.rows.some((row) => row.entity_id === change.productId && Object.entries(change.after).every(([key, value]) => JSON.stringify(row.metadata.after[key]) === JSON.stringify(value))))) throw new Error("This change ID already belongs to a different applied review")
        changes = []
      }
    }
    // Lock all rows in ID order, then validate the entire change set before mutating.
    const rows = (await client.query(`select id::text,catalog_kind,device_type_id,manufacturer_model,parent_product_id::text,specs,mapping_revision,updated_at from products where id=any($1::uuid[]) and deleted_at is null order by id for update`, [changes.map((c) => c.productId)])).rows
    const updates = []
    for (const change of changes) {
      const row = rows.find((r) => r.id === change.productId)
      if (!row || row.mapping_revision !== change.expectedMappingRevision || (change.expectedUpdatedAt && new Date(row.updated_at).toISOString() !== change.expectedUpdatedAt)) throw new Error(`Review conflict: ${change.productId}; audit again`)
      if (!change.reason?.trim() || Object.keys(change.after).some((key) => !["catalogKind", "deviceTypeId", "manufacturerModel"].includes(key))) throw new Error("Only reviewed classification/model fields are supported; edit verified specs in the product admin")
      const before = { catalogKind: row.catalog_kind, deviceTypeId: row.device_type_id, manufacturerModel: row.manufacturer_model }
      const after = normalizeProductSelectionFields({ ...before, ...change.after })
      if (after.deviceTypeId !== before.deviceTypeId && Object.keys(row.specs ?? {}).length) throw new Error(`Type change has existing specifications: ${row.id}; review the full specification in product admin`)
      if (JSON.stringify(before) === JSON.stringify(after)) continue
      if (row.parent_product_id) {
        const parentRow = (await client.query(`select id::text,catalog_kind,device_type_id from products where id=$1::uuid and deleted_at is null for update`, [row.parent_product_id])).rows[0]
        const parentChange = changes.find((entry) => entry.productId === row.parent_product_id)?.after
        if (!parentRow || (parentChange?.catalogKind ?? parentRow.catalog_kind) !== "series" || (parentChange?.deviceTypeId ?? parentRow.device_type_id) !== after.deviceTypeId || after.catalogKind !== "sku") throw new Error(`Parent series conflict: ${row.id}`)
      }
      const children = await client.query(`select device_type_id from products where parent_product_id=$1::uuid and deleted_at is null`, [row.id])
      if (children.rows.length && (after.catalogKind !== "series" || children.rows.some((child) => child.device_type_id !== after.deviceTypeId))) throw new Error(`Series children conflict: ${row.id}`)
      updates.push({ change, row, before, after })
    }
    if (updates.length) await client.query(snapshotSql)
    for (const { change, row, before, after } of updates) {
      if (row.catalog_kind === "series" && after.catalogKind !== "series") { const children = await client.query(`select 1 from products where parent_product_id=$1::uuid and deleted_at is null`, [row.id]); if (children.rows.length) throw new Error("A series with children must remain a series") }
      await client.query(`update products set catalog_kind=$2,device_type_id=$3,manufacturer_model=$4,selection_status='pending',pricing_status='pending',selection_reviewed_by=null,selection_reviewed_at=null,mapping_revision=mapping_revision+1,updated_by=$5::uuid,updated_at=now() where id=$1::uuid`, [row.id, after.catalogKind, after.deviceTypeId, after.manufacturerModel, actor])
      await client.query(`insert into activity_logs(actor_id,entity_type,entity_id,entity_label,action,title,description,metadata) values($1::uuid,'product',$2,'产品映射',$3,'产品整理', $4,$5::jsonb)`, [actor, row.id, mode === "rollback" ? "product.mapping-review-reverted" : "product.mapping-reviewed", change.reason, JSON.stringify({ changeId, before, after, afterRevision: row.mapping_revision + 1 })])
    }
    await client.query("commit"); console.log(JSON.stringify({ mode, changeId, changed: updates.length, parameterStatus: "pending" }))
  }
} catch (error) { await client.query("rollback"); console.error(error.message); process.exitCode = 1 } finally { await client.end() }
