import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_need_leads_status" AS ENUM('draft', 'submitted', 'converted');
  CREATE TYPE "public"."enum_need_leads_source" AS ENUM('scene', 'budget', 'wizard');
  CREATE TYPE "public"."enum__need_leads_v_version_status" AS ENUM('draft', 'submitted', 'converted');
  CREATE TYPE "public"."enum__need_leads_v_version_source" AS ENUM('scene', 'budget', 'wizard');
  CREATE TYPE "public"."enum_pricing_plans_scope" AS ENUM('region', 'project');
  CREATE TYPE "public"."enum_pricing_plans_status" AS ENUM('active', 'archived');
  CREATE TYPE "public"."enum__pricing_plans_v_version_scope" AS ENUM('region', 'project');
  CREATE TYPE "public"."enum__pricing_plans_v_version_status" AS ENUM('active', 'archived');
  CREATE TYPE "public"."enum_pricing_versions_items_calc" AS ENUM('per_unit', 'per_meter');
  CREATE TYPE "public"."enum_pricing_versions_status" AS ENUM('draft', 'scheduled', 'active', 'retired');
  CREATE TYPE "public"."enum__pricing_versions_v_version_items_calc" AS ENUM('per_unit', 'per_meter');
  CREATE TYPE "public"."enum__pricing_versions_v_version_status" AS ENUM('draft', 'scheduled', 'active', 'retired');
  CREATE TABLE "need_leads" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"token" varchar,
  	"status" "enum_need_leads_status" DEFAULT 'draft' NOT NULL,
  	"source" "enum_need_leads_source",
  	"answers" jsonb,
  	"structured" jsonb,
  	"pricing" jsonb,
  	"phone" varchar,
  	"project_id" uuid,
  	"owner_id" uuid,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "need_leads_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_need_leads_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_token" varchar,
  	"version_status" "enum__need_leads_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_source" "enum__need_leads_v_version_source",
  	"version_answers" jsonb,
  	"version_structured" jsonb,
  	"version_pricing" jsonb,
  	"version_phone" varchar,
  	"version_project_id" uuid,
  	"version_owner_id" uuid,
  	"version_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_need_leads_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "pricing_plans" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"region" varchar DEFAULT 'default',
  	"scope" "enum_pricing_plans_scope" DEFAULT 'region' NOT NULL,
  	"project_id" uuid,
  	"is_default" boolean DEFAULT false,
  	"status" "enum_pricing_plans_status" DEFAULT 'active',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pricing_plans_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_pricing_plans_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_name" varchar NOT NULL,
  	"version_region" varchar DEFAULT 'default',
  	"version_scope" "enum__pricing_plans_v_version_scope" DEFAULT 'region' NOT NULL,
  	"version_project_id" uuid,
  	"version_is_default" boolean DEFAULT false,
  	"version_status" "enum__pricing_plans_v_version_status" DEFAULT 'active',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_pricing_plans_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "pricing_versions_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"unit" varchar NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"calc" "enum_pricing_versions_items_calc" DEFAULT 'per_unit' NOT NULL
  );
  
  CREATE TABLE "pricing_versions" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"plan_id" uuid NOT NULL,
  	"label" varchar,
  	"version" numeric NOT NULL,
  	"status" "enum_pricing_versions_status" DEFAULT 'draft' NOT NULL,
  	"effective_from" timestamp(3) with time zone NOT NULL,
  	"commissioning_per_set" numeric DEFAULT 800,
  	"change_note" varchar,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "pricing_versions_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "pricing_versions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_pricing_versions_v_version_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"unit" varchar NOT NULL,
  	"unit_price" numeric NOT NULL,
  	"calc" "enum__pricing_versions_v_version_items_calc" DEFAULT 'per_unit' NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pricing_versions_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_plan_id" uuid NOT NULL,
  	"version_label" varchar,
  	"version_version" numeric NOT NULL,
  	"version_status" "enum__pricing_versions_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_effective_from" timestamp(3) with time zone NOT NULL,
  	"version_commissioning_per_set" numeric DEFAULT 800,
  	"version_change_note" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_pricing_versions_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_pricing_versions_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "need_leads_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pricing_plans_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pricing_versions_id" uuid;
  ALTER TABLE "need_leads" ADD CONSTRAINT "need_leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "need_leads" ADD CONSTRAINT "need_leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "need_leads_rels" ADD CONSTRAINT "need_leads_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."need_leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "need_leads_rels" ADD CONSTRAINT "need_leads_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "need_leads_rels" ADD CONSTRAINT "need_leads_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_need_leads_v" ADD CONSTRAINT "_need_leads_v_parent_id_need_leads_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."need_leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_need_leads_v" ADD CONSTRAINT "_need_leads_v_version_project_id_projects_id_fk" FOREIGN KEY ("version_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_need_leads_v" ADD CONSTRAINT "_need_leads_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_need_leads_v_rels" ADD CONSTRAINT "_need_leads_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_need_leads_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_need_leads_v_rels" ADD CONSTRAINT "_need_leads_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_need_leads_v_rels" ADD CONSTRAINT "_need_leads_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pricing_plans_rels" ADD CONSTRAINT "pricing_plans_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pricing_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_plans_rels" ADD CONSTRAINT "pricing_plans_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_plans_rels" ADD CONSTRAINT "pricing_plans_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_plans_v" ADD CONSTRAINT "_pricing_plans_v_parent_id_pricing_plans_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pricing_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pricing_plans_v" ADD CONSTRAINT "_pricing_plans_v_version_project_id_projects_id_fk" FOREIGN KEY ("version_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pricing_plans_v_rels" ADD CONSTRAINT "_pricing_plans_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pricing_plans_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_plans_v_rels" ADD CONSTRAINT "_pricing_plans_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_plans_v_rels" ADD CONSTRAINT "_pricing_plans_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_versions_items" ADD CONSTRAINT "pricing_versions_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pricing_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_versions" ADD CONSTRAINT "pricing_versions_plan_id_pricing_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pricing_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pricing_versions_texts" ADD CONSTRAINT "pricing_versions_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pricing_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_versions_rels" ADD CONSTRAINT "pricing_versions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pricing_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_versions_rels" ADD CONSTRAINT "pricing_versions_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pricing_versions_rels" ADD CONSTRAINT "pricing_versions_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v_version_items" ADD CONSTRAINT "_pricing_versions_v_version_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pricing_versions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v" ADD CONSTRAINT "_pricing_versions_v_parent_id_pricing_versions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pricing_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v" ADD CONSTRAINT "_pricing_versions_v_version_plan_id_pricing_plans_id_fk" FOREIGN KEY ("version_plan_id") REFERENCES "public"."pricing_plans"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v_texts" ADD CONSTRAINT "_pricing_versions_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pricing_versions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v_rels" ADD CONSTRAINT "_pricing_versions_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pricing_versions_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v_rels" ADD CONSTRAINT "_pricing_versions_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pricing_versions_v_rels" ADD CONSTRAINT "_pricing_versions_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "need_leads_token_idx" ON "need_leads" USING btree ("token");
  CREATE INDEX "need_leads_status_idx" ON "need_leads" USING btree ("status");
  CREATE INDEX "need_leads_project_idx" ON "need_leads" USING btree ("project_id");
  CREATE INDEX "need_leads_owner_idx" ON "need_leads" USING btree ("owner_id");
  CREATE INDEX "need_leads_updated_at_idx" ON "need_leads" USING btree ("updated_at");
  CREATE INDEX "need_leads_created_at_idx" ON "need_leads" USING btree ("created_at");
  CREATE INDEX "need_leads_rels_order_idx" ON "need_leads_rels" USING btree ("order");
  CREATE INDEX "need_leads_rels_parent_idx" ON "need_leads_rels" USING btree ("parent_id");
  CREATE INDEX "need_leads_rels_path_idx" ON "need_leads_rels" USING btree ("path");
  CREATE INDEX "need_leads_rels_admins_id_idx" ON "need_leads_rels" USING btree ("admins_id");
  CREATE INDEX "need_leads_rels_users_id_idx" ON "need_leads_rels" USING btree ("users_id");
  CREATE INDEX "_need_leads_v_parent_idx" ON "_need_leads_v" USING btree ("parent_id");
  CREATE INDEX "_need_leads_v_version_version_token_idx" ON "_need_leads_v" USING btree ("version_token");
  CREATE INDEX "_need_leads_v_version_version_status_idx" ON "_need_leads_v" USING btree ("version_status");
  CREATE INDEX "_need_leads_v_version_version_project_idx" ON "_need_leads_v" USING btree ("version_project_id");
  CREATE INDEX "_need_leads_v_version_version_owner_idx" ON "_need_leads_v" USING btree ("version_owner_id");
  CREATE INDEX "_need_leads_v_version_version_updated_at_idx" ON "_need_leads_v" USING btree ("version_updated_at");
  CREATE INDEX "_need_leads_v_version_version_created_at_idx" ON "_need_leads_v" USING btree ("version_created_at");
  CREATE INDEX "_need_leads_v_created_at_idx" ON "_need_leads_v" USING btree ("created_at");
  CREATE INDEX "_need_leads_v_updated_at_idx" ON "_need_leads_v" USING btree ("updated_at");
  CREATE INDEX "_need_leads_v_rels_order_idx" ON "_need_leads_v_rels" USING btree ("order");
  CREATE INDEX "_need_leads_v_rels_parent_idx" ON "_need_leads_v_rels" USING btree ("parent_id");
  CREATE INDEX "_need_leads_v_rels_path_idx" ON "_need_leads_v_rels" USING btree ("path");
  CREATE INDEX "_need_leads_v_rels_admins_id_idx" ON "_need_leads_v_rels" USING btree ("admins_id");
  CREATE INDEX "_need_leads_v_rels_users_id_idx" ON "_need_leads_v_rels" USING btree ("users_id");
  CREATE INDEX "pricing_plans_region_idx" ON "pricing_plans" USING btree ("region");
  CREATE INDEX "pricing_plans_project_idx" ON "pricing_plans" USING btree ("project_id");
  CREATE INDEX "pricing_plans_updated_at_idx" ON "pricing_plans" USING btree ("updated_at");
  CREATE INDEX "pricing_plans_created_at_idx" ON "pricing_plans" USING btree ("created_at");
  CREATE INDEX "pricing_plans_rels_order_idx" ON "pricing_plans_rels" USING btree ("order");
  CREATE INDEX "pricing_plans_rels_parent_idx" ON "pricing_plans_rels" USING btree ("parent_id");
  CREATE INDEX "pricing_plans_rels_path_idx" ON "pricing_plans_rels" USING btree ("path");
  CREATE INDEX "pricing_plans_rels_admins_id_idx" ON "pricing_plans_rels" USING btree ("admins_id");
  CREATE INDEX "pricing_plans_rels_users_id_idx" ON "pricing_plans_rels" USING btree ("users_id");
  CREATE INDEX "_pricing_plans_v_parent_idx" ON "_pricing_plans_v" USING btree ("parent_id");
  CREATE INDEX "_pricing_plans_v_version_version_region_idx" ON "_pricing_plans_v" USING btree ("version_region");
  CREATE INDEX "_pricing_plans_v_version_version_project_idx" ON "_pricing_plans_v" USING btree ("version_project_id");
  CREATE INDEX "_pricing_plans_v_version_version_updated_at_idx" ON "_pricing_plans_v" USING btree ("version_updated_at");
  CREATE INDEX "_pricing_plans_v_version_version_created_at_idx" ON "_pricing_plans_v" USING btree ("version_created_at");
  CREATE INDEX "_pricing_plans_v_created_at_idx" ON "_pricing_plans_v" USING btree ("created_at");
  CREATE INDEX "_pricing_plans_v_updated_at_idx" ON "_pricing_plans_v" USING btree ("updated_at");
  CREATE INDEX "_pricing_plans_v_rels_order_idx" ON "_pricing_plans_v_rels" USING btree ("order");
  CREATE INDEX "_pricing_plans_v_rels_parent_idx" ON "_pricing_plans_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pricing_plans_v_rels_path_idx" ON "_pricing_plans_v_rels" USING btree ("path");
  CREATE INDEX "_pricing_plans_v_rels_admins_id_idx" ON "_pricing_plans_v_rels" USING btree ("admins_id");
  CREATE INDEX "_pricing_plans_v_rels_users_id_idx" ON "_pricing_plans_v_rels" USING btree ("users_id");
  CREATE INDEX "pricing_versions_items_order_idx" ON "pricing_versions_items" USING btree ("_order");
  CREATE INDEX "pricing_versions_items_parent_id_idx" ON "pricing_versions_items" USING btree ("_parent_id");
  CREATE INDEX "pricing_versions_plan_idx" ON "pricing_versions" USING btree ("plan_id");
  CREATE INDEX "pricing_versions_status_idx" ON "pricing_versions" USING btree ("status");
  CREATE INDEX "pricing_versions_updated_at_idx" ON "pricing_versions" USING btree ("updated_at");
  CREATE INDEX "pricing_versions_created_at_idx" ON "pricing_versions" USING btree ("created_at");
  CREATE INDEX "pricing_versions_texts_order_parent" ON "pricing_versions_texts" USING btree ("order","parent_id");
  CREATE INDEX "pricing_versions_rels_order_idx" ON "pricing_versions_rels" USING btree ("order");
  CREATE INDEX "pricing_versions_rels_parent_idx" ON "pricing_versions_rels" USING btree ("parent_id");
  CREATE INDEX "pricing_versions_rels_path_idx" ON "pricing_versions_rels" USING btree ("path");
  CREATE INDEX "pricing_versions_rels_admins_id_idx" ON "pricing_versions_rels" USING btree ("admins_id");
  CREATE INDEX "pricing_versions_rels_users_id_idx" ON "pricing_versions_rels" USING btree ("users_id");
  CREATE INDEX "_pricing_versions_v_version_items_order_idx" ON "_pricing_versions_v_version_items" USING btree ("_order");
  CREATE INDEX "_pricing_versions_v_version_items_parent_id_idx" ON "_pricing_versions_v_version_items" USING btree ("_parent_id");
  CREATE INDEX "_pricing_versions_v_parent_idx" ON "_pricing_versions_v" USING btree ("parent_id");
  CREATE INDEX "_pricing_versions_v_version_version_plan_idx" ON "_pricing_versions_v" USING btree ("version_plan_id");
  CREATE INDEX "_pricing_versions_v_version_version_status_idx" ON "_pricing_versions_v" USING btree ("version_status");
  CREATE INDEX "_pricing_versions_v_version_version_updated_at_idx" ON "_pricing_versions_v" USING btree ("version_updated_at");
  CREATE INDEX "_pricing_versions_v_version_version_created_at_idx" ON "_pricing_versions_v" USING btree ("version_created_at");
  CREATE INDEX "_pricing_versions_v_created_at_idx" ON "_pricing_versions_v" USING btree ("created_at");
  CREATE INDEX "_pricing_versions_v_updated_at_idx" ON "_pricing_versions_v" USING btree ("updated_at");
  CREATE INDEX "_pricing_versions_v_texts_order_parent" ON "_pricing_versions_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_pricing_versions_v_rels_order_idx" ON "_pricing_versions_v_rels" USING btree ("order");
  CREATE INDEX "_pricing_versions_v_rels_parent_idx" ON "_pricing_versions_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pricing_versions_v_rels_path_idx" ON "_pricing_versions_v_rels" USING btree ("path");
  CREATE INDEX "_pricing_versions_v_rels_admins_id_idx" ON "_pricing_versions_v_rels" USING btree ("admins_id");
  CREATE INDEX "_pricing_versions_v_rels_users_id_idx" ON "_pricing_versions_v_rels" USING btree ("users_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_need_leads_fk" FOREIGN KEY ("need_leads_id") REFERENCES "public"."need_leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pricing_plans_fk" FOREIGN KEY ("pricing_plans_id") REFERENCES "public"."pricing_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pricing_versions_fk" FOREIGN KEY ("pricing_versions_id") REFERENCES "public"."pricing_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_need_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("need_leads_id");
  CREATE INDEX "payload_locked_documents_rels_pricing_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("pricing_plans_id");
  CREATE INDEX "payload_locked_documents_rels_pricing_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("pricing_versions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "need_leads" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "need_leads_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_need_leads_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_need_leads_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_plans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_plans_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pricing_plans_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pricing_plans_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_versions_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_versions_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pricing_versions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pricing_versions_v_version_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pricing_versions_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pricing_versions_v_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pricing_versions_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "need_leads" CASCADE;
  DROP TABLE "need_leads_rels" CASCADE;
  DROP TABLE "_need_leads_v" CASCADE;
  DROP TABLE "_need_leads_v_rels" CASCADE;
  DROP TABLE "pricing_plans" CASCADE;
  DROP TABLE "pricing_plans_rels" CASCADE;
  DROP TABLE "_pricing_plans_v" CASCADE;
  DROP TABLE "_pricing_plans_v_rels" CASCADE;
  DROP TABLE "pricing_versions_items" CASCADE;
  DROP TABLE "pricing_versions" CASCADE;
  DROP TABLE "pricing_versions_texts" CASCADE;
  DROP TABLE "pricing_versions_rels" CASCADE;
  DROP TABLE "_pricing_versions_v_version_items" CASCADE;
  DROP TABLE "_pricing_versions_v" CASCADE;
  DROP TABLE "_pricing_versions_v_texts" CASCADE;
  DROP TABLE "_pricing_versions_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels"
    DROP COLUMN "need_leads_id",
    DROP COLUMN "pricing_plans_id",
    DROP COLUMN "pricing_versions_id";
  DROP TYPE "public"."enum_need_leads_status";
  DROP TYPE "public"."enum_need_leads_source";
  DROP TYPE "public"."enum__need_leads_v_version_status";
  DROP TYPE "public"."enum__need_leads_v_version_source";
  DROP TYPE "public"."enum_pricing_plans_scope";
  DROP TYPE "public"."enum_pricing_plans_status";
  DROP TYPE "public"."enum__pricing_plans_v_version_scope";
  DROP TYPE "public"."enum__pricing_plans_v_version_status";
  DROP TYPE "public"."enum_pricing_versions_items_calc";
  DROP TYPE "public"."enum_pricing_versions_status";
  DROP TYPE "public"."enum__pricing_versions_v_version_items_calc";
  DROP TYPE "public"."enum__pricing_versions_v_version_status";`)
}
