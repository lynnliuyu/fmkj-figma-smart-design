import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import bcrypt from "bcryptjs"
import type { PGlite } from "@electric-sql/pglite"

import { demoProducts, demoProjects, DEMO_ADMIN } from "./demo-data"

/**
 * Figma 开发版（FMKJ_DEMO_MODE=1）的数据库：进程内运行的 PGlite（WASM 版 PostgreSQL）。
 * 沿用仓库的迁移脚本建表，首次启动灌入演示数据，数据存放在 .local/demo-db（不进版本库）。
 * 对外暴露与 pg.Pool 相同的 query / connect 形状，业务代码不需要改。
 */

type QueryResult = { rows: any[]; rowCount: number; fields: { name: string }[] }

const DATA_DIR = resolve(process.cwd(), ".local/demo-db")
// 建表与灌数据都成功后才写这个标记；没有标记就当作半成品，整个重建。
const READY_MARKER = resolve(process.cwd(), ".local/demo-db.ready")

// 与 scripts/run-migration.mjs 的 migrationDefinitions 保持同序；legacy-data 不执行。
const MIGRATIONS = [
  "neon-init.sql", "create-auth-tables.sql", "create-roles-table.sql", "create-activity-log-table.sql",
  "create-account-commerce-tables.sql", "create-project-workbench-fields.sql", "create-project-options.sql",
  "create-product-moderation-status-values.sql", "create-product-moderation-fields.sql",
  "create-platform-health-support.sql", "create-performance-indexes.sql", "create-project-site-photos.sql",
  "create-category-default-products.sql", "create-category-default-products-keycount.sql",
  "create-project-product-prices.sql", "create-work-orders.sql", "create-point-map-designs.sql",
  "create-product-selection.sql", "backfill-quote-product-snapshots.sql", "create-product-catalog-constraints.sql",
  "add-product-platforms.sql", "create-product-dictionaries.sql", "create-catalog-licenses.sql",
  "update-product-platform-whitelist.sql", "create-project-property-type.sql", "create-project-deliveries.sql",
  "create-product-visual-assets.sql", "create-project-category-default-products.sql", "drop-retired-modules.sql",
  "create-catalog-sync-runs.sql", "create-login-attempts.sql", "add-catalog-sync-signature.sql",
  "backfill-first-run-initialized.sql",
]

const globalForDemo = globalThis as unknown as { __fmkjDemoDb?: Promise<PGlite> }

function demoDb(): Promise<PGlite> {
  globalForDemo.__fmkjDemoDb ??= openDemoDb()
  return globalForDemo.__fmkjDemoDb
}

async function openDemoDb(): Promise<PGlite> {
  const { PGlite } = await import("@electric-sql/pglite")
  const { pgcrypto } = await import("@electric-sql/pglite/contrib/pgcrypto")
  const fresh = !existsSync(READY_MARKER)
  if (fresh) rmSync(DATA_DIR, { recursive: true, force: true })
  mkdirSync(DATA_DIR, { recursive: true })
  const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { pgcrypto } })
  if (fresh) {
    for (const file of MIGRATIONS) await db.exec(readFileSync(resolve(process.cwd(), "scripts", file), "utf8"))
    await seed(db)
    writeFileSync(READY_MARKER, new Date().toISOString())
  }
  return db
}

async function run(sql: string, params?: unknown[]): Promise<QueryResult> {
  const db = await demoDb()
  if (params && params.length > 0) {
    const result = await db.query(sql, params as any[])
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, fields: result.fields }
  }
  const results = await db.exec(sql)
  const last = results[results.length - 1] ?? { rows: [], fields: [] }
  return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length, fields: last.fields }
}

function normalizeArgs(text: string | { text: string; values?: unknown[] }, values?: unknown[]) {
  return typeof text === "string" ? { sql: text, params: values } : { sql: text.text, params: text.values ?? values }
}

/** pg.Pool 的最小兼容实现。 */
export const demoPool = {
  query(text: string | { text: string; values?: unknown[] }, values?: unknown[]) {
    const { sql, params } = normalizeArgs(text, values)
    return run(sql, params)
  },
  async connect() {
    return {
      query(text: string | { text: string; values?: unknown[] }, values?: unknown[]) {
        const { sql, params } = normalizeArgs(text, values)
        return run(sql, params)
      },
      release() {},
    }
  },
  on() {
    return demoPool
  },
  async end() {},
}

async function seed(db: PGlite) {
  const passwordHash = await bcrypt.hash(DEMO_ADMIN.password, 10)
  const admin = await db.query<{ id: string }>(
    `insert into users (email, password_hash, name, role, status) values ($1, $2, $3, 'admin', 'active') returning id::text`,
    [DEMO_ADMIN.email, passwordHash, DEMO_ADMIN.name],
  )
  const adminId = admin.rows[0].id
  await db.query(
    `insert into account_profiles (user_id, account_type, account_status) values ($1::uuid, 'SUPER_ADMIN', 'active')`,
    [adminId],
  )
  await db.query(
    `insert into subscriptions (subject_type, subject_id, plan_id, status, starts_at)
     select 'user', $1::uuid, id, 'active', now() from plans where plan_code = 'ENTERPRISE_CUSTOM'`,
    [adminId],
  )
  await db.query(
    `insert into platform_settings (key, value, updated_by_user_id) values ('INTERNAL_FIRST_RUN_INITIALIZED', now()::text, $1::uuid)
     on conflict (key) do nothing`,
    [adminId],
  )

  for (const p of demoProjects) {
    await db.query(
      `insert into projects (id, name, code, customer_name, client_name, phone, community, building, room_no, platform, owner,
         designer, budget, quote_amount, stage, risk_level, risk_reason, due_note, next_action, next_action_due_at,
         next_action_owner_name, waiting_on, tags, property_type, owner_type, owner_id, created_by, created_at, updated_at)
       values ($1::uuid, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11, coalesce($12::numeric, 0), coalesce($13::numeric, 0),
         $14::project_stage, $15, $16, $17, $18,
         $19::timestamptz, $20, $21, $22::jsonb, $23, 'user', $24::uuid, $24::uuid, $25::timestamptz, $26::timestamptz)`,
      [
        p.id, p.name, p.code, p.customer, p.phone, p.community, p.building, p.roomNo, p.platform, p.owner, p.designer,
        p.budget, p.quoteAmount, p.stage, p.riskLevel, p.riskReason, p.dueNote, p.nextAction, p.nextActionDueAt,
        p.nextActionOwnerName, p.waitingOn, JSON.stringify(p.tags), p.propertyType ?? "flat", adminId, p.createdAt, p.updatedAt,
      ],
    )
    await db.query(
      `insert into project_members (project_id, user_id, access_level, status) values ($1::uuid, $2::uuid, 'owner', 'active')
       on conflict do nothing`,
      [p.id, adminId],
    )
  }

  for (const p of demoProducts) {
    await db.query(
      `insert into products (id, name, brand, platform, platforms, category, sku, unit, price, cost, stock, image, description,
         tags, channels, status, created_by)
       values ($1::uuid, $2, $3, $4, array[$4]::text[], $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16::uuid)`,
      [
        p.id, p.name, p.brand, p.platform, p.category, p.sku, p.unit, p.price, p.cost, p.stock, p.image, p.description,
        JSON.stringify(p.tags), JSON.stringify(p.channels), p.status, adminId,
      ],
    )
  }
}
