import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_image_aspect" AS ENUM('auto', 'square', 'portrait', 'video', 'wide');
  CREATE TYPE "public"."enum_image_rounded" AS ENUM('none', 'lg', '2xl', 'full');
  CREATE TYPE "public"."enum_image_tilt" AS ENUM('none', 'left', 'right');
  CREATE TYPE "public"."enum_social_links_variant" AS ENUM('iconRow', 'labeledList');
  CREATE TYPE "public"."enum_social_links_source" AS ENUM('identity', 'custom');
  CREATE TABLE "pages_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"aspect" "enum_image_aspect" DEFAULT 'auto',
  	"rounded" "enum_image_rounded" DEFAULT '2xl',
  	"tilt" "enum_image_tilt" DEFAULT 'none',
  	"hover_scale" boolean DEFAULT false,
  	"priority" boolean DEFAULT false,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_social_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "pages_blocks_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "enum_social_links_variant" DEFAULT 'iconRow',
  	"source" "enum_social_links_source" DEFAULT 'identity',
  	"show_email_divider" boolean DEFAULT false,
  	"email" varchar DEFAULT 'info@brandonperfetti.com',
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"aspect" "enum_image_aspect" DEFAULT 'auto',
  	"rounded" "enum_image_rounded" DEFAULT '2xl',
  	"tilt" "enum_image_tilt" DEFAULT 'none',
  	"hover_scale" boolean DEFAULT false,
  	"priority" boolean DEFAULT false,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_social_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "enum_social_links_variant" DEFAULT 'iconRow',
  	"source" "enum_social_links_source" DEFAULT 'identity',
  	"show_email_divider" boolean DEFAULT false,
  	"email" varchar DEFAULT 'info@brandonperfetti.com',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"aspect" "enum_image_aspect" DEFAULT 'auto',
  	"rounded" "enum_image_rounded" DEFAULT '2xl',
  	"tilt" "enum_image_tilt" DEFAULT 'none',
  	"hover_scale" boolean DEFAULT false,
  	"priority" boolean DEFAULT false,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_social_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "posts_blocks_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "enum_social_links_variant" DEFAULT 'iconRow',
  	"source" "enum_social_links_source" DEFAULT 'identity',
  	"show_email_divider" boolean DEFAULT false,
  	"email" varchar DEFAULT 'info@brandonperfetti.com',
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"aspect" "enum_image_aspect" DEFAULT 'auto',
  	"rounded" "enum_image_rounded" DEFAULT '2xl',
  	"tilt" "enum_image_tilt" DEFAULT 'none',
  	"hover_scale" boolean DEFAULT false,
  	"priority" boolean DEFAULT false,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_social_links_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "enum_social_links_variant" DEFAULT 'iconRow',
  	"source" "enum_social_links_source" DEFAULT 'identity',
  	"show_email_divider" boolean DEFAULT false,
  	"email" varchar DEFAULT 'info@brandonperfetti.com',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_image" ADD CONSTRAINT "pages_blocks_image_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_image" ADD CONSTRAINT "pages_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_social_links_links" ADD CONSTRAINT "pages_blocks_social_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_social_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_social_links" ADD CONSTRAINT "pages_blocks_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_image" ADD CONSTRAINT "_pages_v_blocks_image_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_image" ADD CONSTRAINT "_pages_v_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_social_links_links" ADD CONSTRAINT "_pages_v_blocks_social_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_social_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_social_links" ADD CONSTRAINT "_pages_v_blocks_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_image" ADD CONSTRAINT "posts_blocks_image_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_image" ADD CONSTRAINT "posts_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_social_links_links" ADD CONSTRAINT "posts_blocks_social_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_social_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_social_links" ADD CONSTRAINT "posts_blocks_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_image" ADD CONSTRAINT "_posts_v_blocks_image_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_image" ADD CONSTRAINT "_posts_v_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_social_links_links" ADD CONSTRAINT "_posts_v_blocks_social_links_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_social_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_social_links" ADD CONSTRAINT "_posts_v_blocks_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_image_order_idx" ON "pages_blocks_image" USING btree ("_order");
  CREATE INDEX "pages_blocks_image_parent_id_idx" ON "pages_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_image_path_idx" ON "pages_blocks_image" USING btree ("_path");
  CREATE INDEX "pages_blocks_image_media_idx" ON "pages_blocks_image" USING btree ("media_id");
  CREATE INDEX "pages_blocks_social_links_links_order_idx" ON "pages_blocks_social_links_links" USING btree ("_order");
  CREATE INDEX "pages_blocks_social_links_links_parent_id_idx" ON "pages_blocks_social_links_links" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_social_links_order_idx" ON "pages_blocks_social_links" USING btree ("_order");
  CREATE INDEX "pages_blocks_social_links_parent_id_idx" ON "pages_blocks_social_links" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_social_links_path_idx" ON "pages_blocks_social_links" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_image_order_idx" ON "_pages_v_blocks_image" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_image_parent_id_idx" ON "_pages_v_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_image_path_idx" ON "_pages_v_blocks_image" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_image_media_idx" ON "_pages_v_blocks_image" USING btree ("media_id");
  CREATE INDEX "_pages_v_blocks_social_links_links_order_idx" ON "_pages_v_blocks_social_links_links" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_social_links_links_parent_id_idx" ON "_pages_v_blocks_social_links_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_social_links_order_idx" ON "_pages_v_blocks_social_links" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_social_links_parent_id_idx" ON "_pages_v_blocks_social_links" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_social_links_path_idx" ON "_pages_v_blocks_social_links" USING btree ("_path");
  CREATE INDEX "posts_blocks_image_order_idx" ON "posts_blocks_image" USING btree ("_order");
  CREATE INDEX "posts_blocks_image_parent_id_idx" ON "posts_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_image_path_idx" ON "posts_blocks_image" USING btree ("_path");
  CREATE INDEX "posts_blocks_image_media_idx" ON "posts_blocks_image" USING btree ("media_id");
  CREATE INDEX "posts_blocks_social_links_links_order_idx" ON "posts_blocks_social_links_links" USING btree ("_order");
  CREATE INDEX "posts_blocks_social_links_links_parent_id_idx" ON "posts_blocks_social_links_links" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_social_links_order_idx" ON "posts_blocks_social_links" USING btree ("_order");
  CREATE INDEX "posts_blocks_social_links_parent_id_idx" ON "posts_blocks_social_links" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_social_links_path_idx" ON "posts_blocks_social_links" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_image_order_idx" ON "_posts_v_blocks_image" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_image_parent_id_idx" ON "_posts_v_blocks_image" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_image_path_idx" ON "_posts_v_blocks_image" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_image_media_idx" ON "_posts_v_blocks_image" USING btree ("media_id");
  CREATE INDEX "_posts_v_blocks_social_links_links_order_idx" ON "_posts_v_blocks_social_links_links" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_social_links_links_parent_id_idx" ON "_posts_v_blocks_social_links_links" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_social_links_order_idx" ON "_posts_v_blocks_social_links" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_social_links_parent_id_idx" ON "_posts_v_blocks_social_links" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_social_links_path_idx" ON "_posts_v_blocks_social_links" USING btree ("_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_image" CASCADE;
  DROP TABLE "pages_blocks_social_links_links" CASCADE;
  DROP TABLE "pages_blocks_social_links" CASCADE;
  DROP TABLE "_pages_v_blocks_image" CASCADE;
  DROP TABLE "_pages_v_blocks_social_links_links" CASCADE;
  DROP TABLE "_pages_v_blocks_social_links" CASCADE;
  DROP TABLE "posts_blocks_image" CASCADE;
  DROP TABLE "posts_blocks_social_links_links" CASCADE;
  DROP TABLE "posts_blocks_social_links" CASCADE;
  DROP TABLE "_posts_v_blocks_image" CASCADE;
  DROP TABLE "_posts_v_blocks_social_links_links" CASCADE;
  DROP TABLE "_posts_v_blocks_social_links" CASCADE;
  DROP TYPE "public"."enum_image_aspect";
  DROP TYPE "public"."enum_image_rounded";
  DROP TYPE "public"."enum_image_tilt";
  DROP TYPE "public"."enum_social_links_variant";
  DROP TYPE "public"."enum_social_links_source";`)
}
