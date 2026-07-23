import {
  MigrateUpArgs,
  MigrateDownArgs,
  sql,
} from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_uses_category" ADD VALUE 'podcasts' BEFORE 'productivity';
  CREATE TABLE "work_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"logo_id" integer,
  	"start_date" timestamp(3) with time zone NOT NULL,
  	"end_date" timestamp(3) with time zone,
  	"current" boolean DEFAULT false,
  	"sort_order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "tech_stack" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_tech_stack_category";
  CREATE TYPE "public"."enum_tech_stack_category" AS ENUM('frontend', 'framework', 'backend', 'testing', 'data', 'tooling', 'ai');
  ALTER TABLE "tech_stack" ALTER COLUMN "category" SET DATA TYPE "public"."enum_tech_stack_category" USING "category"::"public"."enum_tech_stack_category";
  ALTER TABLE "projects" ADD COLUMN "link_label" varchar;
  ALTER TABLE "projects" ADD COLUMN "sort_order" numeric;
  ALTER TABLE "tech_stack" ADD COLUMN "featured" boolean DEFAULT false;
  ALTER TABLE "tech_stack" ADD COLUMN "sort_order" numeric;
  ALTER TABLE "uses" ADD COLUMN "sort_order" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "work_history_id" integer;
  ALTER TABLE "work_history" ADD CONSTRAINT "work_history_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "work_history_logo_idx" ON "work_history" USING btree ("logo_id");
  CREATE INDEX "work_history_updated_at_idx" ON "work_history" USING btree ("updated_at");
  CREATE INDEX "work_history_created_at_idx" ON "work_history" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_work_history_fk" FOREIGN KEY ("work_history_id") REFERENCES "public"."work_history"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_work_history_id_idx" ON "payload_locked_documents_rels" USING btree ("work_history_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "work_history" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "work_history" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_work_history_fk";
  
  ALTER TABLE "tech_stack" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_tech_stack_category";
  CREATE TYPE "public"."enum_tech_stack_category" AS ENUM('language', 'framework', 'library', 'tooling', 'platform', 'database', 'ai', 'design');
  ALTER TABLE "tech_stack" ALTER COLUMN "category" SET DATA TYPE "public"."enum_tech_stack_category" USING "category"::"public"."enum_tech_stack_category";
  ALTER TABLE "uses" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_uses_category";
  CREATE TYPE "public"."enum_uses_category" AS ENUM('workstation', 'development', 'design', 'productivity', 'ai');
  ALTER TABLE "uses" ALTER COLUMN "category" SET DATA TYPE "public"."enum_uses_category" USING "category"::"public"."enum_uses_category";
  DROP INDEX "payload_locked_documents_rels_work_history_id_idx";
  ALTER TABLE "projects" DROP COLUMN "link_label";
  ALTER TABLE "projects" DROP COLUMN "sort_order";
  ALTER TABLE "tech_stack" DROP COLUMN "featured";
  ALTER TABLE "tech_stack" DROP COLUMN "sort_order";
  ALTER TABLE "uses" DROP COLUMN "sort_order";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "work_history_id";`)
}
