import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projects" ADD COLUMN "display_profile" varchar DEFAULT 'construction';
  ALTER TABLE "_projects_v" ADD COLUMN "version_display_profile" varchar DEFAULT 'construction';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "projects" DROP COLUMN "display_profile";
  ALTER TABLE "_projects_v" DROP COLUMN "version_display_profile";`)
}
