import { Pool } from "pg"

import { demoPool } from "./demo-db"

let pool: Pool | null = null

export function hasDatabaseUrl() {
  // Figma 开发版的演示模式：使用进程内的 PGlite 演示库（见 lib/demo-db.ts）。
  if (process.env.FMKJ_DEMO_MODE === "1") return true
  return Boolean(databaseConnectionString() || databaseConnectionConfig())
}

export function getPool() {
  if (process.env.FMKJ_DEMO_MODE === "1") return demoPool as unknown as Pool

  if (!hasDatabaseUrl()) {
    throw new Error("Database environment variables are not set")
  }

  if (!pool) {
    const connectionString = databaseConnectionString()
    pool = new Pool({
      ...(connectionString
        ? { connectionString }
        : databaseConnectionConfig()),
      // The preview health check must not hang while a remote database is
      // sleeping or unreachable; first-run callers already fail closed.
      connectionTimeoutMillis: process.env.FIGMA ? 3_000 : undefined,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
    })
  }

  return pool
}

function databaseConnectionString() {
  return envValue("DATABASE_URL") || envValue("POSTGRES_URL") || envValue("POSTGRES_PRISMA_URL")
}

function databaseConnectionConfig() {
  const host = envValue("PGHOST") || envValue("POSTGRES_HOST")
  const user = envValue("PGUSER") || envValue("POSTGRES_USER")
  const password = envValue("PGPASSWORD") || envValue("POSTGRES_PASSWORD")
  const database = envValue("PGDATABASE") || envValue("POSTGRES_DATABASE")

  if (!host || !user || !password || !database) {
    return null
  }

  return {
    database,
    host,
    password,
    user,
  }
}

function shouldUseSsl() {
  return process.env.DATABASE_SSL === "true" || Boolean(envValue("PGHOST") || envValue("POSTGRES_HOST"))
}

function envValue(key: string) {
  const value = process.env[key]?.trim()
  if (!value || value === "\"\"" || value === "''") {
    return ""
  }
  return value.replace(/^["']|["']$/g, "")
}
