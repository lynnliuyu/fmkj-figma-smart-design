import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_proposal_templates_theme" ADD VALUE 'linen';
  ALTER TYPE "public"."enum_proposal_templates_theme" ADD VALUE 'slate';
  ALTER TYPE "public"."enum__proposal_templates_v_version_theme" ADD VALUE 'linen';
  ALTER TYPE "public"."enum__proposal_templates_v_version_theme" ADD VALUE 'slate';
  ALTER TABLE "users" ALTER COLUMN "ai_credits" SET DEFAULT 0;
  ALTER TABLE "_users_v" ALTER COLUMN "version_ai_credits" SET DEFAULT 0;
  ALTER TABLE "membership_settings" ALTER COLUMN "upgrade_hint" SET DEFAULT '联系服务顾问获取兑换码，在「积分与账单」页输入兑换码即可充值 AI 积分。';
  ALTER TABLE "_membership_settings_v" ALTER COLUMN "version_upgrade_hint" SET DEFAULT '联系服务顾问获取兑换码，在「积分与账单」页输入兑换码即可充值 AI 积分。';
  ALTER TABLE "users" DROP COLUMN "membership_tier";
  ALTER TABLE "users" DROP COLUMN "membership_expires_at";
  ALTER TABLE "_users_v" DROP COLUMN "version_membership_tier";
  ALTER TABLE "_users_v" DROP COLUMN "version_membership_expires_at";
  ALTER TABLE "proposal_templates" DROP COLUMN "tier";
  ALTER TABLE "_proposal_templates_v" DROP COLUMN "version_tier";
  ALTER TABLE "redemption_codes" DROP COLUMN "grant_tier";
  ALTER TABLE "redemption_codes" DROP COLUMN "duration_days";
  ALTER TABLE "_redemption_codes_v" DROP COLUMN "version_grant_tier";
  ALTER TABLE "_redemption_codes_v" DROP COLUMN "version_duration_days";
  ALTER TABLE "company_settings_ai_models" DROP COLUMN "min_tier";
  ALTER TABLE "_company_settings_v_version_ai_models" DROP COLUMN "min_tier";
  ALTER TABLE "ai_settings_ai_models" DROP COLUMN "min_tier";
  ALTER TABLE "_ai_settings_v_version_ai_models" DROP COLUMN "min_tier";
  ALTER TABLE "membership_settings" DROP COLUMN "enforcement";
  ALTER TABLE "_membership_settings_v" DROP COLUMN "version_enforcement";
  DROP TYPE "public"."enum_users_membership_tier";
  DROP TYPE "public"."enum__users_v_version_membership_tier";
  DROP TYPE "public"."enum_proposal_templates_tier";
  DROP TYPE "public"."enum__proposal_templates_v_version_tier";
  DROP TYPE "public"."enum_redemption_codes_grant_tier";
  DROP TYPE "public"."enum__redemption_codes_v_version_grant_tier";
  DROP TYPE "public"."enum_company_settings_ai_models_min_tier";
  DROP TYPE "public"."enum__company_settings_v_version_ai_models_min_tier";
  DROP TYPE "public"."enum_ai_settings_ai_models_min_tier";
  DROP TYPE "public"."enum__ai_settings_v_version_ai_models_min_tier";
  DROP TYPE "public"."enum_membership_settings_enforcement";
  DROP TYPE "public"."enum__membership_settings_v_version_enforcement";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_membership_tier" AS ENUM('free', 'pro', 'team');
  CREATE TYPE "public"."enum__users_v_version_membership_tier" AS ENUM('free', 'pro', 'team');
  CREATE TYPE "public"."enum_proposal_templates_tier" AS ENUM('free', 'pro', 'team');
  CREATE TYPE "public"."enum__proposal_templates_v_version_tier" AS ENUM('free', 'pro', 'team');
  CREATE TYPE "public"."enum_redemption_codes_grant_tier" AS ENUM('none', 'pro', 'team');
  CREATE TYPE "public"."enum__redemption_codes_v_version_grant_tier" AS ENUM('none', 'pro', 'team');
  CREATE TYPE "public"."enum_company_settings_ai_models_min_tier" AS ENUM('auto', 'free', 'pro', 'team');
  CREATE TYPE "public"."enum__company_settings_v_version_ai_models_min_tier" AS ENUM('auto', 'free', 'pro', 'team');
  CREATE TYPE "public"."enum_ai_settings_ai_models_min_tier" AS ENUM('auto', 'free', 'pro', 'team');
  CREATE TYPE "public"."enum__ai_settings_v_version_ai_models_min_tier" AS ENUM('auto', 'free', 'pro', 'team');
  CREATE TYPE "public"."enum_membership_settings_enforcement" AS ENUM('soft', 'strict');
  CREATE TYPE "public"."enum__membership_settings_v_version_enforcement" AS ENUM('soft', 'strict');
  ALTER TABLE "proposal_templates" ALTER COLUMN "theme" SET DATA TYPE text;
  ALTER TABLE "proposal_templates" ALTER COLUMN "theme" SET DEFAULT 'qixu'::text;
  DROP TYPE "public"."enum_proposal_templates_theme";
  CREATE TYPE "public"."enum_proposal_templates_theme" AS ENUM('qixu', 'noir', 'grove', 'azure', 'terra', 'mono', 'dawn', 'jade');
  ALTER TABLE "proposal_templates" ALTER COLUMN "theme" SET DEFAULT 'qixu'::"public"."enum_proposal_templates_theme";
  ALTER TABLE "proposal_templates" ALTER COLUMN "theme" SET DATA TYPE "public"."enum_proposal_templates_theme" USING "theme"::"public"."enum_proposal_templates_theme";
  ALTER TABLE "_proposal_templates_v" ALTER COLUMN "version_theme" SET DATA TYPE text;
  ALTER TABLE "_proposal_templates_v" ALTER COLUMN "version_theme" SET DEFAULT 'qixu'::text;
  DROP TYPE "public"."enum__proposal_templates_v_version_theme";
  CREATE TYPE "public"."enum__proposal_templates_v_version_theme" AS ENUM('qixu', 'noir', 'grove', 'azure', 'terra', 'mono', 'dawn', 'jade');
  ALTER TABLE "_proposal_templates_v" ALTER COLUMN "version_theme" SET DEFAULT 'qixu'::"public"."enum__proposal_templates_v_version_theme";
  ALTER TABLE "_proposal_templates_v" ALTER COLUMN "version_theme" SET DATA TYPE "public"."enum__proposal_templates_v_version_theme" USING "version_theme"::"public"."enum__proposal_templates_v_version_theme";
  ALTER TABLE "users" ALTER COLUMN "ai_credits" SET DEFAULT 20;
  ALTER TABLE "_users_v" ALTER COLUMN "version_ai_credits" SET DEFAULT 20;
  ALTER TABLE "membership_settings" ALTER COLUMN "upgrade_hint" SET DEFAULT '联系服务顾问获取兑换码，在「会员与积分」页输入兑换码即可开通或续期。';
  ALTER TABLE "_membership_settings_v" ALTER COLUMN "version_upgrade_hint" SET DEFAULT '联系服务顾问获取兑换码，在「会员与积分」页输入兑换码即可开通或续期。';
  ALTER TABLE "users" ADD COLUMN "membership_tier" "enum_users_membership_tier" DEFAULT 'free' NOT NULL;
  ALTER TABLE "users" ADD COLUMN "membership_expires_at" timestamp(3) with time zone;
  ALTER TABLE "_users_v" ADD COLUMN "version_membership_tier" "enum__users_v_version_membership_tier" DEFAULT 'free' NOT NULL;
  ALTER TABLE "_users_v" ADD COLUMN "version_membership_expires_at" timestamp(3) with time zone;
  ALTER TABLE "proposal_templates" ADD COLUMN "tier" "enum_proposal_templates_tier" DEFAULT 'free';
  ALTER TABLE "_proposal_templates_v" ADD COLUMN "version_tier" "enum__proposal_templates_v_version_tier" DEFAULT 'free';
  ALTER TABLE "redemption_codes" ADD COLUMN "grant_tier" "enum_redemption_codes_grant_tier" DEFAULT 'none' NOT NULL;
  ALTER TABLE "redemption_codes" ADD COLUMN "duration_days" numeric DEFAULT 30 NOT NULL;
  ALTER TABLE "_redemption_codes_v" ADD COLUMN "version_grant_tier" "enum__redemption_codes_v_version_grant_tier" DEFAULT 'none' NOT NULL;
  ALTER TABLE "_redemption_codes_v" ADD COLUMN "version_duration_days" numeric DEFAULT 30 NOT NULL;
  ALTER TABLE "company_settings_ai_models" ADD COLUMN "min_tier" "enum_company_settings_ai_models_min_tier" DEFAULT 'auto';
  ALTER TABLE "_company_settings_v_version_ai_models" ADD COLUMN "min_tier" "enum__company_settings_v_version_ai_models_min_tier" DEFAULT 'auto';
  ALTER TABLE "ai_settings_ai_models" ADD COLUMN "min_tier" "enum_ai_settings_ai_models_min_tier" DEFAULT 'auto';
  ALTER TABLE "_ai_settings_v_version_ai_models" ADD COLUMN "min_tier" "enum__ai_settings_v_version_ai_models_min_tier" DEFAULT 'auto';
  ALTER TABLE "membership_settings" ADD COLUMN "enforcement" "enum_membership_settings_enforcement" DEFAULT 'soft';
  ALTER TABLE "_membership_settings_v" ADD COLUMN "version_enforcement" "enum__membership_settings_v_version_enforcement" DEFAULT 'soft';`)
}
