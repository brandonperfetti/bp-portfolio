import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_carousel_variant" AS ENUM('cards', 'media');
  CREATE TYPE "public"."enum_carousel_effect" AS ENUM('slide', 'fade');
  CREATE TABLE "pages_blocks_carousel_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"text" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "pages_blocks_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "enum_carousel_variant" DEFAULT 'cards',
  	"slides_per_view" numeric DEFAULT 1,
  	"slides_per_view_mobile" numeric DEFAULT 1,
  	"effect" "enum_carousel_effect" DEFAULT 'slide',
  	"loop" boolean DEFAULT false,
  	"navigation" boolean DEFAULT true,
  	"pagination" boolean DEFAULT true,
  	"autoplay" boolean DEFAULT false,
  	"interval" numeric DEFAULT 5000,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_carousel_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"text" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "enum_carousel_variant" DEFAULT 'cards',
  	"slides_per_view" numeric DEFAULT 1,
  	"slides_per_view_mobile" numeric DEFAULT 1,
  	"effect" "enum_carousel_effect" DEFAULT 'slide',
  	"loop" boolean DEFAULT false,
  	"navigation" boolean DEFAULT true,
  	"pagination" boolean DEFAULT true,
  	"autoplay" boolean DEFAULT false,
  	"interval" numeric DEFAULT 5000,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_carousel_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"text" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "posts_blocks_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "enum_carousel_variant" DEFAULT 'cards',
  	"slides_per_view" numeric DEFAULT 1,
  	"slides_per_view_mobile" numeric DEFAULT 1,
  	"effect" "enum_carousel_effect" DEFAULT 'slide',
  	"loop" boolean DEFAULT false,
  	"navigation" boolean DEFAULT true,
  	"pagination" boolean DEFAULT true,
  	"autoplay" boolean DEFAULT false,
  	"interval" numeric DEFAULT 5000,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_carousel_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"text" varchar,
  	"href" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "enum_carousel_variant" DEFAULT 'cards',
  	"slides_per_view" numeric DEFAULT 1,
  	"slides_per_view_mobile" numeric DEFAULT 1,
  	"effect" "enum_carousel_effect" DEFAULT 'slide',
  	"loop" boolean DEFAULT false,
  	"navigation" boolean DEFAULT true,
  	"pagination" boolean DEFAULT true,
  	"autoplay" boolean DEFAULT false,
  	"interval" numeric DEFAULT 5000,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_carousel_slides" ADD CONSTRAINT "pages_blocks_carousel_slides_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_carousel_slides" ADD CONSTRAINT "pages_blocks_carousel_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_carousel" ADD CONSTRAINT "pages_blocks_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_carousel_slides" ADD CONSTRAINT "_pages_v_blocks_carousel_slides_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_carousel_slides" ADD CONSTRAINT "_pages_v_blocks_carousel_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_carousel" ADD CONSTRAINT "_pages_v_blocks_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_carousel_slides" ADD CONSTRAINT "posts_blocks_carousel_slides_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_carousel_slides" ADD CONSTRAINT "posts_blocks_carousel_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_carousel" ADD CONSTRAINT "posts_blocks_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_carousel_slides" ADD CONSTRAINT "_posts_v_blocks_carousel_slides_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_carousel_slides" ADD CONSTRAINT "_posts_v_blocks_carousel_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_carousel" ADD CONSTRAINT "_posts_v_blocks_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_carousel_slides_order_idx" ON "pages_blocks_carousel_slides" USING btree ("_order");
  CREATE INDEX "pages_blocks_carousel_slides_parent_id_idx" ON "pages_blocks_carousel_slides" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_carousel_slides_image_idx" ON "pages_blocks_carousel_slides" USING btree ("image_id");
  CREATE INDEX "pages_blocks_carousel_order_idx" ON "pages_blocks_carousel" USING btree ("_order");
  CREATE INDEX "pages_blocks_carousel_parent_id_idx" ON "pages_blocks_carousel" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_carousel_path_idx" ON "pages_blocks_carousel" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_carousel_slides_order_idx" ON "_pages_v_blocks_carousel_slides" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_carousel_slides_parent_id_idx" ON "_pages_v_blocks_carousel_slides" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_carousel_slides_image_idx" ON "_pages_v_blocks_carousel_slides" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_carousel_order_idx" ON "_pages_v_blocks_carousel" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_carousel_parent_id_idx" ON "_pages_v_blocks_carousel" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_carousel_path_idx" ON "_pages_v_blocks_carousel" USING btree ("_path");
  CREATE INDEX "posts_blocks_carousel_slides_order_idx" ON "posts_blocks_carousel_slides" USING btree ("_order");
  CREATE INDEX "posts_blocks_carousel_slides_parent_id_idx" ON "posts_blocks_carousel_slides" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_carousel_slides_image_idx" ON "posts_blocks_carousel_slides" USING btree ("image_id");
  CREATE INDEX "posts_blocks_carousel_order_idx" ON "posts_blocks_carousel" USING btree ("_order");
  CREATE INDEX "posts_blocks_carousel_parent_id_idx" ON "posts_blocks_carousel" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_carousel_path_idx" ON "posts_blocks_carousel" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_carousel_slides_order_idx" ON "_posts_v_blocks_carousel_slides" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_carousel_slides_parent_id_idx" ON "_posts_v_blocks_carousel_slides" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_carousel_slides_image_idx" ON "_posts_v_blocks_carousel_slides" USING btree ("image_id");
  CREATE INDEX "_posts_v_blocks_carousel_order_idx" ON "_posts_v_blocks_carousel" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_carousel_parent_id_idx" ON "_posts_v_blocks_carousel" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_carousel_path_idx" ON "_posts_v_blocks_carousel" USING btree ("_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_carousel_slides" CASCADE;
  DROP TABLE "pages_blocks_carousel" CASCADE;
  DROP TABLE "_pages_v_blocks_carousel_slides" CASCADE;
  DROP TABLE "_pages_v_blocks_carousel" CASCADE;
  DROP TABLE "posts_blocks_carousel_slides" CASCADE;
  DROP TABLE "posts_blocks_carousel" CASCADE;
  DROP TABLE "_posts_v_blocks_carousel_slides" CASCADE;
  DROP TABLE "_posts_v_blocks_carousel" CASCADE;
  DROP TYPE "public"."enum_carousel_variant";
  DROP TYPE "public"."enum_carousel_effect";`)
}
