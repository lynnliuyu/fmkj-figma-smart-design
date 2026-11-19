import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ADD COLUMN "market_price" numeric;
  ALTER TABLE "products" ADD COLUMN "price_source" varchar;
  ALTER TABLE "products" ADD COLUMN "price_checked_at" timestamp(3) with time zone;
  ALTER TABLE "_products_v" ADD COLUMN "version_market_price" numeric;
  ALTER TABLE "_products_v" ADD COLUMN "version_price_source" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_price_checked_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" DROP COLUMN "market_price";
  ALTER TABLE "products" DROP COLUMN "price_source";
  ALTER TABLE "products" DROP COLUMN "price_checked_at";
  ALTER TABLE "_products_v" DROP COLUMN "version_market_price";
  ALTER TABLE "_products_v" DROP COLUMN "version_price_source";
  ALTER TABLE "_products_v" DROP COLUMN "version_price_checked_at";`)
}
