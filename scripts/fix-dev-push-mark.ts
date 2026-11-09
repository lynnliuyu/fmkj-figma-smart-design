/**
 * 清掉本地库里的「dev push 模式」标记。
 *
 * ## 什么时候需要跑这个
 *
 * 症状：`pnpm build` 卡约 60 秒后失败，日志里出现
 *   ```
 *   If you'd like to run migrations, data loss will occur. Would you like to proceed? › (y/N)
 *   Failed to build /(frontend)/catalog/page ... because it took more than 60 seconds
 *   ```
 *
 * 原因：本地用 `pnpm dev`（或任何让 Payload 走 push 模式的方式）跑过之后，
 * Payload 会在 `payload_migrations` 里插一条 `name='dev', batch=-1` 的记录，
 * 表示「这个库被 dev 模式动态改过 schema」。之后任何 payload 命令（含 `pnpm build`）
 * 都会检测到它，弹一个交互式确认；构建进程没人回答，就卡满 60 秒超时。
 *
 * 生产库不会有这个标记（`NODE_ENV=production` 时 push 关闭），所以这只影响本地。
 *
 * ## 预防
 *
 * `scripts/dev-local.sh` 现在会设 `PAYLOAD_DB_PUSH=false`，schema 只由
 * `src/migrations/` 驱动，不会再留这个标记。
 *
 * ## 用法
 *
 *   pnpm exec payload run --input '{"scriptPath":"scripts/fix-dev-push-mark.ts"}'
 */
import path from 'node:path'
import { getPayload } from 'payload'

const configPath = path.resolve(process.env.PAYLOAD_CONFIG_PATH || 'src/payload.selfhost.config.ts')
const payload = await getPayload({ config: (await import(configPath)).default })

if (payload.db.name !== 'postgres') {
  console.error(`当前连接的是 ${payload.db.name}，不是 PostgreSQL，已停止。`)
  process.exit(1)
}

// 直接用底层连接查/删：payload_migrations 不在 Payload 的 collection 列表里
const pool = (
  payload.db as unknown as {
    pool?: {
      query: (sql: string, args?: unknown[]) => Promise<{ rowCount: number; rows: unknown[] }>
    }
  }
).pool
if (!pool) {
  console.error('取不到数据库连接池，无法清理。')
  process.exit(1)
}

const found = await pool.query(
  "select name, batch from payload_migrations where batch::text = '-1'",
)
if (!found.rows.length) {
  console.log('✓ 这个库是干净的，没有 dev push 标记。')
  process.exit(0)
}

console.log(`发现 ${found.rows.length} 条 dev push 标记：${JSON.stringify(found.rows)}`)
const del = await pool.query("delete from payload_migrations where batch::text = '-1'")
console.log(`✓ 已删除 ${del.rowCount} 条。现在可以正常 build 了。`)
process.exit(0)
