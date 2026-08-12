import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_archive_variant" AS ENUM('grid', 'stacked');
  CREATE TYPE "public"."enum_heading_level" AS ENUM('h1', 'h2', 'h3');
  CREATE TYPE "public"."enum_heading_variant" AS ENUM('line', 'typewriter');
  CREATE TABLE "pages_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"level" "enum_heading_level" DEFAULT 'h2',
  	"variant" "enum_heading_variant" DEFAULT 'line',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_prose" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"level" "enum_heading_level" DEFAULT 'h2',
  	"variant" "enum_heading_variant" DEFAULT 'line',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_prose" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"level" "enum_heading_level" DEFAULT 'h2',
  	"variant" "enum_heading_variant" DEFAULT 'line',
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_prose" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"level" "enum_heading_level" DEFAULT 'h2',
  	"variant" "enum_heading_variant" DEFAULT 'line',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_prose" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"content" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_social_links" ALTER COLUMN "email" DROP DEFAULT;
  ALTER TABLE "_pages_v_blocks_social_links" ALTER COLUMN "email" DROP DEFAULT;
  ALTER TABLE "posts_blocks_social_links" ALTER COLUMN "email" DROP DEFAULT;
  ALTER TABLE "_posts_v_blocks_social_links" ALTER COLUMN "email" DROP DEFAULT;
  ALTER TABLE "pages_blocks_articles_archive" ADD COLUMN "variant" "enum_articles_archive_variant" DEFAULT 'grid';
  ALTER TABLE "_pages_v_blocks_articles_archive" ADD COLUMN "variant" "enum_articles_archive_variant" DEFAULT 'grid';
  ALTER TABLE "posts_blocks_articles_archive" ADD COLUMN "variant" "enum_articles_archive_variant" DEFAULT 'grid';
  ALTER TABLE "_posts_v_blocks_articles_archive" ADD COLUMN "variant" "enum_articles_archive_variant" DEFAULT 'grid';
  ALTER TABLE "identity" ADD COLUMN "email" varchar;
  ALTER TABLE "pages_blocks_heading" ADD CONSTRAINT "pages_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_prose" ADD CONSTRAINT "pages_blocks_prose_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_heading" ADD CONSTRAINT "_pages_v_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_prose" ADD CONSTRAINT "_pages_v_blocks_prose_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_heading" ADD CONSTRAINT "posts_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_prose" ADD CONSTRAINT "posts_blocks_prose_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_heading" ADD CONSTRAINT "_posts_v_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_prose" ADD CONSTRAINT "_posts_v_blocks_prose_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_heading_order_idx" ON "pages_blocks_heading" USING btree ("_order");
  CREATE INDEX "pages_blocks_heading_parent_id_idx" ON "pages_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_heading_path_idx" ON "pages_blocks_heading" USING btree ("_path");
  CREATE INDEX "pages_blocks_prose_order_idx" ON "pages_blocks_prose" USING btree ("_order");
  CREATE INDEX "pages_blocks_prose_parent_id_idx" ON "pages_blocks_prose" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_prose_path_idx" ON "pages_blocks_prose" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_heading_order_idx" ON "_pages_v_blocks_heading" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_heading_parent_id_idx" ON "_pages_v_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_heading_path_idx" ON "_pages_v_blocks_heading" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_prose_order_idx" ON "_pages_v_blocks_prose" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_prose_parent_id_idx" ON "_pages_v_blocks_prose" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_prose_path_idx" ON "_pages_v_blocks_prose" USING btree ("_path");
  CREATE INDEX "posts_blocks_heading_order_idx" ON "posts_blocks_heading" USING btree ("_order");
  CREATE INDEX "posts_blocks_heading_parent_id_idx" ON "posts_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_heading_path_idx" ON "posts_blocks_heading" USING btree ("_path");
  CREATE INDEX "posts_blocks_prose_order_idx" ON "posts_blocks_prose" USING btree ("_order");
  CREATE INDEX "posts_blocks_prose_parent_id_idx" ON "posts_blocks_prose" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_prose_path_idx" ON "posts_blocks_prose" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_heading_order_idx" ON "_posts_v_blocks_heading" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_heading_parent_id_idx" ON "_posts_v_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_heading_path_idx" ON "_posts_v_blocks_heading" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_prose_order_idx" ON "_posts_v_blocks_prose" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_prose_parent_id_idx" ON "_posts_v_blocks_prose" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_prose_path_idx" ON "_posts_v_blocks_prose" USING btree ("_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_prose" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_prose" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_prose" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_prose" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_heading" CASCADE;
  DROP TABLE "pages_blocks_prose" CASCADE;
  DROP TABLE "_pages_v_blocks_heading" CASCADE;
  DROP TABLE "_pages_v_blocks_prose" CASCADE;
  DROP TABLE "posts_blocks_heading" CASCADE;
  DROP TABLE "posts_blocks_prose" CASCADE;
  DROP TABLE "_posts_v_blocks_heading" CASCADE;
  DROP TABLE "_posts_v_blocks_prose" CASCADE;
  ALTER TABLE "pages_blocks_social_links" ALTER COLUMN "email" SET DEFAULT 'info@brandonperfetti.com';
  ALTER TABLE "_pages_v_blocks_social_links" ALTER COLUMN "email" SET DEFAULT 'info@brandonperfetti.com';
  ALTER TABLE "posts_blocks_social_links" ALTER COLUMN "email" SET DEFAULT 'info@brandonperfetti.com';
  ALTER TABLE "_posts_v_blocks_social_links" ALTER COLUMN "email" SET DEFAULT 'info@brandonperfetti.com';
  ALTER TABLE "pages_blocks_articles_archive" DROP COLUMN "variant";
  ALTER TABLE "_pages_v_blocks_articles_archive" DROP COLUMN "variant";
  ALTER TABLE "posts_blocks_articles_archive" DROP COLUMN "variant";
  ALTER TABLE "_posts_v_blocks_articles_archive" DROP COLUMN "variant";
  ALTER TABLE "identity" DROP COLUMN "email";
  DROP TYPE "public"."enum_articles_archive_variant";
  DROP TYPE "public"."enum_heading_level";
  DROP TYPE "public"."enum_heading_variant";`)
}
