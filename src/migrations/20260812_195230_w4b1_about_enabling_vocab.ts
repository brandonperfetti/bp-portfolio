import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_column_content_inset" ADD VALUE 'aboutRail';
  ALTER TYPE "public"."enum_pages_hero_type" ADD VALUE 'blank' BEFORE 'none';
  ALTER TYPE "public"."enum__pages_v_version_hero_type" ADD VALUE 'blank' BEFORE 'none';
  CREATE TABLE "pages_blocks_lead" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"reveal" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_lead" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"reveal" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_lead" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"reveal" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_lead" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"reveal" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_lead" ADD CONSTRAINT "pages_blocks_lead_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_lead" ADD CONSTRAINT "_pages_v_blocks_lead_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_lead" ADD CONSTRAINT "posts_blocks_lead_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_lead" ADD CONSTRAINT "_posts_v_blocks_lead_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_lead_order_idx" ON "pages_blocks_lead" USING btree ("_order");
  CREATE INDEX "pages_blocks_lead_parent_id_idx" ON "pages_blocks_lead" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_lead_path_idx" ON "pages_blocks_lead" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_lead_order_idx" ON "_pages_v_blocks_lead" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_lead_parent_id_idx" ON "_pages_v_blocks_lead" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_lead_path_idx" ON "_pages_v_blocks_lead" USING btree ("_path");
  CREATE INDEX "posts_blocks_lead_order_idx" ON "posts_blocks_lead" USING btree ("_order");
  CREATE INDEX "posts_blocks_lead_parent_id_idx" ON "posts_blocks_lead" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_lead_path_idx" ON "posts_blocks_lead" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_lead_order_idx" ON "_posts_v_blocks_lead" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_lead_parent_id_idx" ON "_posts_v_blocks_lead" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_lead_path_idx" ON "_posts_v_blocks_lead" USING btree ("_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_lead" CASCADE;
  DROP TABLE "_pages_v_blocks_lead" CASCADE;
  DROP TABLE "posts_blocks_lead" CASCADE;
  DROP TABLE "_posts_v_blocks_lead" CASCADE;
  ALTER TABLE "pages_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE text;
  ALTER TABLE "pages_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::text;
  ALTER TABLE "_pages_v_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE text;
  ALTER TABLE "_pages_v_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::text;
  ALTER TABLE "posts_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE text;
  ALTER TABLE "posts_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::text;
  ALTER TABLE "_posts_v_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE text;
  ALTER TABLE "_posts_v_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::text;
  DROP TYPE "public"."enum_column_content_inset";
  CREATE TYPE "public"."enum_column_content_inset" AS ENUM('none', 'railGutter');
  ALTER TABLE "pages_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::"public"."enum_column_content_inset";
  ALTER TABLE "pages_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE "public"."enum_column_content_inset" USING "content_inset"::"public"."enum_column_content_inset";
  ALTER TABLE "_pages_v_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::"public"."enum_column_content_inset";
  ALTER TABLE "_pages_v_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE "public"."enum_column_content_inset" USING "content_inset"::"public"."enum_column_content_inset";
  ALTER TABLE "posts_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::"public"."enum_column_content_inset";
  ALTER TABLE "posts_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE "public"."enum_column_content_inset" USING "content_inset"::"public"."enum_column_content_inset";
  ALTER TABLE "_posts_v_blocks_column" ALTER COLUMN "content_inset" SET DEFAULT 'none'::"public"."enum_column_content_inset";
  ALTER TABLE "_posts_v_blocks_column" ALTER COLUMN "content_inset" SET DATA TYPE "public"."enum_column_content_inset" USING "content_inset"::"public"."enum_column_content_inset";
  ALTER TABLE "pages" ALTER COLUMN "hero_type" SET DATA TYPE text;
  ALTER TABLE "pages" ALTER COLUMN "hero_type" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum_pages_hero_type";
  CREATE TYPE "public"."enum_pages_hero_type" AS ENUM('none', 'standard', 'shader');
  ALTER TABLE "pages" ALTER COLUMN "hero_type" SET DEFAULT 'standard'::"public"."enum_pages_hero_type";
  ALTER TABLE "pages" ALTER COLUMN "hero_type" SET DATA TYPE "public"."enum_pages_hero_type" USING "hero_type"::"public"."enum_pages_hero_type";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_hero_type" SET DATA TYPE text;
  ALTER TABLE "_pages_v" ALTER COLUMN "version_hero_type" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum__pages_v_version_hero_type";
  CREATE TYPE "public"."enum__pages_v_version_hero_type" AS ENUM('none', 'standard', 'shader');
  ALTER TABLE "_pages_v" ALTER COLUMN "version_hero_type" SET DEFAULT 'standard'::"public"."enum__pages_v_version_hero_type";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_hero_type" SET DATA TYPE "public"."enum__pages_v_version_hero_type" USING "version_hero_type"::"public"."enum__pages_v_version_hero_type";`)
}
