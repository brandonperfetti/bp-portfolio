import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_column_size" AS ENUM('oneQuarter', 'oneThird', 'half', 'twoThirds', 'threeQuarters', 'full');
  CREATE TABLE "pages_blocks_column" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"size" "enum_column_size" DEFAULT 'full',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_container" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_column" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"size" "enum_column_size" DEFAULT 'full',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_container" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_column" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"size" "enum_column_size" DEFAULT 'full',
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_container" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_column" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"size" "enum_column_size" DEFAULT 'full',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_container" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_column" ADD CONSTRAINT "pages_blocks_column_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_container" ADD CONSTRAINT "pages_blocks_container_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_column" ADD CONSTRAINT "_pages_v_blocks_column_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_container" ADD CONSTRAINT "_pages_v_blocks_container_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_column" ADD CONSTRAINT "posts_blocks_column_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_container" ADD CONSTRAINT "posts_blocks_container_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_column" ADD CONSTRAINT "_posts_v_blocks_column_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_container" ADD CONSTRAINT "_posts_v_blocks_container_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_column_order_idx" ON "pages_blocks_column" USING btree ("_order");
  CREATE INDEX "pages_blocks_column_parent_id_idx" ON "pages_blocks_column" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_column_path_idx" ON "pages_blocks_column" USING btree ("_path");
  CREATE INDEX "pages_blocks_container_order_idx" ON "pages_blocks_container" USING btree ("_order");
  CREATE INDEX "pages_blocks_container_parent_id_idx" ON "pages_blocks_container" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_container_path_idx" ON "pages_blocks_container" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_column_order_idx" ON "_pages_v_blocks_column" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_column_parent_id_idx" ON "_pages_v_blocks_column" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_column_path_idx" ON "_pages_v_blocks_column" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_container_order_idx" ON "_pages_v_blocks_container" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_container_parent_id_idx" ON "_pages_v_blocks_container" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_container_path_idx" ON "_pages_v_blocks_container" USING btree ("_path");
  CREATE INDEX "posts_blocks_column_order_idx" ON "posts_blocks_column" USING btree ("_order");
  CREATE INDEX "posts_blocks_column_parent_id_idx" ON "posts_blocks_column" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_column_path_idx" ON "posts_blocks_column" USING btree ("_path");
  CREATE INDEX "posts_blocks_container_order_idx" ON "posts_blocks_container" USING btree ("_order");
  CREATE INDEX "posts_blocks_container_parent_id_idx" ON "posts_blocks_container" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_container_path_idx" ON "posts_blocks_container" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_column_order_idx" ON "_posts_v_blocks_column" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_column_parent_id_idx" ON "_posts_v_blocks_column" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_column_path_idx" ON "_posts_v_blocks_column" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_container_order_idx" ON "_posts_v_blocks_container" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_container_parent_id_idx" ON "_posts_v_blocks_container" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_container_path_idx" ON "_posts_v_blocks_container" USING btree ("_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_column" CASCADE;
  DROP TABLE "pages_blocks_container" CASCADE;
  DROP TABLE "_pages_v_blocks_column" CASCADE;
  DROP TABLE "_pages_v_blocks_container" CASCADE;
  DROP TABLE "posts_blocks_column" CASCADE;
  DROP TABLE "posts_blocks_container" CASCADE;
  DROP TABLE "_posts_v_blocks_column" CASCADE;
  DROP TABLE "_posts_v_blocks_container" CASCADE;
  DROP TYPE "public"."enum_column_size";`)
}
