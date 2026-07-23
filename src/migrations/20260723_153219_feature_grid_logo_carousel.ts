import {
  MigrateUpArgs,
  MigrateDownArgs,
  sql,
} from '@payloadcms/db-vercel-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_feature_card_grid_cards_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_pages_blocks_feature_card_grid_cards_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_pages_blocks_logo_carousel_layout" AS ENUM('scroll', 'wrap');
  CREATE TYPE "public"."enum__pages_v_blocks_feature_card_grid_cards_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__pages_v_blocks_feature_card_grid_cards_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__pages_v_blocks_logo_carousel_layout" AS ENUM('scroll', 'wrap');
  CREATE TABLE "pages_blocks_feature_card_grid_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon_id" integer,
  	"eyebrow" varchar,
  	"title" varchar,
  	"copy" varchar,
  	"enable_link" boolean,
  	"link_type" "enum_pages_blocks_feature_card_grid_cards_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum_pages_blocks_feature_card_grid_cards_link_appearance" DEFAULT 'default'
  );
  
  CREATE TABLE "pages_blocks_feature_card_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_logo_carousel_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"url" varchar
  );
  
  CREATE TABLE "pages_blocks_logo_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"logo_height" numeric DEFAULT 40,
  	"layout" "enum_pages_blocks_logo_carousel_layout" DEFAULT 'scroll',
  	"scroll_speed" numeric DEFAULT 40,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_feature_card_grid_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon_id" integer,
  	"eyebrow" varchar,
  	"title" varchar,
  	"copy" varchar,
  	"enable_link" boolean,
  	"link_type" "enum__pages_v_blocks_feature_card_grid_cards_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum__pages_v_blocks_feature_card_grid_cards_link_appearance" DEFAULT 'default',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_feature_card_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_logo_carousel_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_logo_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_height" numeric DEFAULT 40,
  	"layout" "enum__pages_v_blocks_logo_carousel_layout" DEFAULT 'scroll',
  	"scroll_speed" numeric DEFAULT 40,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_feature_card_grid_cards" ADD CONSTRAINT "pages_blocks_feature_card_grid_cards_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_feature_card_grid_cards" ADD CONSTRAINT "pages_blocks_feature_card_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_feature_card_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_feature_card_grid" ADD CONSTRAINT "pages_blocks_feature_card_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_logo_carousel_logos" ADD CONSTRAINT "pages_blocks_logo_carousel_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_logo_carousel_logos" ADD CONSTRAINT "pages_blocks_logo_carousel_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_logo_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_logo_carousel" ADD CONSTRAINT "pages_blocks_logo_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_feature_card_grid_cards" ADD CONSTRAINT "_pages_v_blocks_feature_card_grid_cards_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_feature_card_grid_cards" ADD CONSTRAINT "_pages_v_blocks_feature_card_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_feature_card_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_feature_card_grid" ADD CONSTRAINT "_pages_v_blocks_feature_card_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_logo_carousel_logos" ADD CONSTRAINT "_pages_v_blocks_logo_carousel_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_logo_carousel_logos" ADD CONSTRAINT "_pages_v_blocks_logo_carousel_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_logo_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_logo_carousel" ADD CONSTRAINT "_pages_v_blocks_logo_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_feature_card_grid_cards_order_idx" ON "pages_blocks_feature_card_grid_cards" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_card_grid_cards_parent_id_idx" ON "pages_blocks_feature_card_grid_cards" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_card_grid_cards_icon_idx" ON "pages_blocks_feature_card_grid_cards" USING btree ("icon_id");
  CREATE INDEX "pages_blocks_feature_card_grid_order_idx" ON "pages_blocks_feature_card_grid" USING btree ("_order");
  CREATE INDEX "pages_blocks_feature_card_grid_parent_id_idx" ON "pages_blocks_feature_card_grid" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_feature_card_grid_path_idx" ON "pages_blocks_feature_card_grid" USING btree ("_path");
  CREATE INDEX "pages_blocks_logo_carousel_logos_order_idx" ON "pages_blocks_logo_carousel_logos" USING btree ("_order");
  CREATE INDEX "pages_blocks_logo_carousel_logos_parent_id_idx" ON "pages_blocks_logo_carousel_logos" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_logo_carousel_logos_image_idx" ON "pages_blocks_logo_carousel_logos" USING btree ("image_id");
  CREATE INDEX "pages_blocks_logo_carousel_order_idx" ON "pages_blocks_logo_carousel" USING btree ("_order");
  CREATE INDEX "pages_blocks_logo_carousel_parent_id_idx" ON "pages_blocks_logo_carousel" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_logo_carousel_path_idx" ON "pages_blocks_logo_carousel" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_feature_card_grid_cards_order_idx" ON "_pages_v_blocks_feature_card_grid_cards" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_card_grid_cards_parent_id_idx" ON "_pages_v_blocks_feature_card_grid_cards" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_card_grid_cards_icon_idx" ON "_pages_v_blocks_feature_card_grid_cards" USING btree ("icon_id");
  CREATE INDEX "_pages_v_blocks_feature_card_grid_order_idx" ON "_pages_v_blocks_feature_card_grid" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_feature_card_grid_parent_id_idx" ON "_pages_v_blocks_feature_card_grid" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_feature_card_grid_path_idx" ON "_pages_v_blocks_feature_card_grid" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_logo_carousel_logos_order_idx" ON "_pages_v_blocks_logo_carousel_logos" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_logo_carousel_logos_parent_id_idx" ON "_pages_v_blocks_logo_carousel_logos" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_logo_carousel_logos_image_idx" ON "_pages_v_blocks_logo_carousel_logos" USING btree ("image_id");
  CREATE INDEX "_pages_v_blocks_logo_carousel_order_idx" ON "_pages_v_blocks_logo_carousel" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_logo_carousel_parent_id_idx" ON "_pages_v_blocks_logo_carousel" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_logo_carousel_path_idx" ON "_pages_v_blocks_logo_carousel" USING btree ("_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_feature_card_grid_cards" CASCADE;
  DROP TABLE "pages_blocks_feature_card_grid" CASCADE;
  DROP TABLE "pages_blocks_logo_carousel_logos" CASCADE;
  DROP TABLE "pages_blocks_logo_carousel" CASCADE;
  DROP TABLE "_pages_v_blocks_feature_card_grid_cards" CASCADE;
  DROP TABLE "_pages_v_blocks_feature_card_grid" CASCADE;
  DROP TABLE "_pages_v_blocks_logo_carousel_logos" CASCADE;
  DROP TABLE "_pages_v_blocks_logo_carousel" CASCADE;
  DROP TYPE "public"."enum_pages_blocks_feature_card_grid_cards_link_type";
  DROP TYPE "public"."enum_pages_blocks_feature_card_grid_cards_link_appearance";
  DROP TYPE "public"."enum_pages_blocks_logo_carousel_layout";
  DROP TYPE "public"."enum__pages_v_blocks_feature_card_grid_cards_link_type";
  DROP TYPE "public"."enum__pages_v_blocks_feature_card_grid_cards_link_appearance";
  DROP TYPE "public"."enum__pages_v_blocks_logo_carousel_layout";`)
}
