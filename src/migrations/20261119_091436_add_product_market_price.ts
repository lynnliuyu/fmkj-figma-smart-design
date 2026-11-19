import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * products 的三个价格参考列（京东日常价，issue #195）。
 *
 * ⚠️ 与 #194 的 `20261119_120615_add_product_market_price_for_need` 是**同一批列**，
 * 两个 PR 各自基于 main 生成。为消除合并顺序依赖（窄验实测：若 #197 先执行，
 * 本迁移原先会报 `column "market_price" already exists`），统一加
 * `IF NOT EXISTS` / `IF EXISTS`，任意先后顺序都可重复执行。
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "market_price" numeric;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "price_source" varchar;
  ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "price_checked_at" timestamp(3) with time zone;
  ALTER TABLE "_products_v" ADD COLUMN IF NOT EXISTS "version_market_price" numeric;
  ALTER TABLE "_products_v" ADD COLUMN IF NOT EXISTS "version_price_source" varchar;
  ALTER TABLE "_products_v" ADD COLUMN IF NOT EXISTS "version_price_checked_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" DROP COLUMN IF EXISTS "market_price";
  ALTER TABLE "products" DROP COLUMN IF EXISTS "price_source";
  ALTER TABLE "products" DROP COLUMN IF EXISTS "price_checked_at";
  ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_market_price";
  ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_price_source";
  ALTER TABLE "_products_v" DROP COLUMN IF EXISTS "version_price_checked_at";`)
}
