import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_blocks_cta_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_posts_blocks_cta_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_posts_blocks_content_columns_size" AS ENUM('oneThird', 'half', 'twoThirds', 'full');
  CREATE TYPE "public"."enum_posts_blocks_content_columns_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_posts_blocks_content_columns_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_posts_blocks_feature_card_grid_cards_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_posts_blocks_feature_card_grid_cards_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum_posts_blocks_logo_carousel_layout" AS ENUM('scroll', 'wrap');
  CREATE TYPE "public"."enum_posts_blocks_shader_hero_preset" AS ENUM('northern-lights-2', 'ribbon-flows-4', 'synthesis-14', 'drifting-lights-8', 'static-noise-4');
  CREATE TYPE "public"."enum_posts_blocks_spacer_size" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "public"."enum__posts_v_blocks_cta_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__posts_v_blocks_cta_links_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__posts_v_blocks_content_columns_size" AS ENUM('oneThird', 'half', 'twoThirds', 'full');
  CREATE TYPE "public"."enum__posts_v_blocks_content_columns_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__posts_v_blocks_content_columns_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__posts_v_blocks_feature_card_grid_cards_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum__posts_v_blocks_feature_card_grid_cards_link_appearance" AS ENUM('default', 'outline');
  CREATE TYPE "public"."enum__posts_v_blocks_logo_carousel_layout" AS ENUM('scroll', 'wrap');
  CREATE TYPE "public"."enum__posts_v_blocks_shader_hero_preset" AS ENUM('northern-lights-2', 'ribbon-flows-4', 'synthesis-14', 'drifting-lights-8', 'static-noise-4');
  CREATE TYPE "public"."enum__posts_v_blocks_spacer_size" AS ENUM('sm', 'md', 'lg');
  CREATE TABLE "pages_blocks_photo_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_photo_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_articles_archive" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"limit" numeric DEFAULT 3,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_cta_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "enum_posts_blocks_cta_links_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum_posts_blocks_cta_links_link_appearance" DEFAULT 'default'
  );
  
  CREATE TABLE "posts_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rich_text" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_contact_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_content_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"size" "enum_posts_blocks_content_columns_size" DEFAULT 'oneThird',
  	"rich_text" jsonb,
  	"enable_link" boolean,
  	"link_type" "enum_posts_blocks_content_columns_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum_posts_blocks_content_columns_link_appearance" DEFAULT 'default'
  );
  
  CREATE TABLE "posts_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_faq_list_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb
  );
  
  CREATE TABLE "posts_blocks_faq_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_feature_card_grid_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"icon_id" integer,
  	"eyebrow" varchar,
  	"title" varchar,
  	"copy" varchar,
  	"enable_link" boolean,
  	"link_type" "enum_posts_blocks_feature_card_grid_cards_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum_posts_blocks_feature_card_grid_cards_link_appearance" DEFAULT 'default'
  );
  
  CREATE TABLE "posts_blocks_feature_card_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_logo_carousel_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"url" varchar
  );
  
  CREATE TABLE "posts_blocks_logo_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"logo_height" numeric DEFAULT 40,
  	"layout" "enum_posts_blocks_logo_carousel_layout" DEFAULT 'scroll',
  	"scroll_speed" numeric DEFAULT 40,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_newsletter_signup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_photo_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_shader_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"preset" "enum_posts_blocks_shader_hero_preset" DEFAULT 'northern-lights-2',
  	"rich_text" jsonb,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_spacer" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"size" "enum_posts_blocks_spacer_size" DEFAULT 'md',
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_stats_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "posts_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"name" varchar,
  	"role" varchar,
  	"avatar_id" integer
  );
  
  CREATE TABLE "posts_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_video_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"title" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_work_history_card" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_articles_archive" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"limit" numeric DEFAULT 3,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_cta_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"link_type" "enum__posts_v_blocks_cta_links_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum__posts_v_blocks_cta_links_link_appearance" DEFAULT 'default',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_cta" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"rich_text" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_contact_form" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_content_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"size" "enum__posts_v_blocks_content_columns_size" DEFAULT 'oneThird',
  	"rich_text" jsonb,
  	"enable_link" boolean,
  	"link_type" "enum__posts_v_blocks_content_columns_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum__posts_v_blocks_content_columns_link_appearance" DEFAULT 'default',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_content" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_faq_list_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_faq_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_feature_card_grid_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"icon_id" integer,
  	"eyebrow" varchar,
  	"title" varchar,
  	"copy" varchar,
  	"enable_link" boolean,
  	"link_type" "enum__posts_v_blocks_feature_card_grid_cards_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar,
  	"link_appearance" "enum__posts_v_blocks_feature_card_grid_cards_link_appearance" DEFAULT 'default',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_feature_card_grid" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"intro" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_logo_carousel_logos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_logo_carousel" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_height" numeric DEFAULT 40,
  	"layout" "enum__posts_v_blocks_logo_carousel_layout" DEFAULT 'scroll',
  	"scroll_speed" numeric DEFAULT 40,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_newsletter_signup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_photo_strip" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_shader_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"preset" "enum__posts_v_blocks_shader_hero_preset" DEFAULT 'northern-lights-2',
  	"rich_text" jsonb,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_spacer" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"size" "enum__posts_v_blocks_spacer_size" DEFAULT 'md',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_stats_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"value" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"name" varchar,
  	"role" varchar,
  	"avatar_id" integer,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_testimonials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_video_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"title" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_work_history_card" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "posts_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "posts_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "_posts_v_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "_posts_v_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "pages_blocks_photo_strip" ADD CONSTRAINT "pages_blocks_photo_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_photo_strip" ADD CONSTRAINT "_pages_v_blocks_photo_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_articles_archive" ADD CONSTRAINT "posts_blocks_articles_archive_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_cta_links" ADD CONSTRAINT "posts_blocks_cta_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_cta" ADD CONSTRAINT "posts_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_contact_form" ADD CONSTRAINT "posts_blocks_contact_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_content_columns" ADD CONSTRAINT "posts_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_content" ADD CONSTRAINT "posts_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_faq_list_items" ADD CONSTRAINT "posts_blocks_faq_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_faq_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_faq_list" ADD CONSTRAINT "posts_blocks_faq_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_feature_card_grid_cards" ADD CONSTRAINT "posts_blocks_feature_card_grid_cards_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_feature_card_grid_cards" ADD CONSTRAINT "posts_blocks_feature_card_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_feature_card_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_feature_card_grid" ADD CONSTRAINT "posts_blocks_feature_card_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_logo_carousel_logos" ADD CONSTRAINT "posts_blocks_logo_carousel_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_logo_carousel_logos" ADD CONSTRAINT "posts_blocks_logo_carousel_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_logo_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_logo_carousel" ADD CONSTRAINT "posts_blocks_logo_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_media_block" ADD CONSTRAINT "posts_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_media_block" ADD CONSTRAINT "posts_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_newsletter_signup" ADD CONSTRAINT "posts_blocks_newsletter_signup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_photo_strip" ADD CONSTRAINT "posts_blocks_photo_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_shader_hero" ADD CONSTRAINT "posts_blocks_shader_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_spacer" ADD CONSTRAINT "posts_blocks_spacer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_stats_items" ADD CONSTRAINT "posts_blocks_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_stats" ADD CONSTRAINT "posts_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_testimonials_items" ADD CONSTRAINT "posts_blocks_testimonials_items_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_testimonials_items" ADD CONSTRAINT "posts_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_testimonials" ADD CONSTRAINT "posts_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_video_embed" ADD CONSTRAINT "posts_blocks_video_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_work_history_card" ADD CONSTRAINT "posts_blocks_work_history_card_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_articles_archive" ADD CONSTRAINT "_posts_v_blocks_articles_archive_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_cta_links" ADD CONSTRAINT "_posts_v_blocks_cta_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_cta"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_cta" ADD CONSTRAINT "_posts_v_blocks_cta_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_contact_form" ADD CONSTRAINT "_posts_v_blocks_contact_form_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_content_columns" ADD CONSTRAINT "_posts_v_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_content" ADD CONSTRAINT "_posts_v_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_faq_list_items" ADD CONSTRAINT "_posts_v_blocks_faq_list_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_faq_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_faq_list" ADD CONSTRAINT "_posts_v_blocks_faq_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_feature_card_grid_cards" ADD CONSTRAINT "_posts_v_blocks_feature_card_grid_cards_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_feature_card_grid_cards" ADD CONSTRAINT "_posts_v_blocks_feature_card_grid_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_feature_card_grid"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_feature_card_grid" ADD CONSTRAINT "_posts_v_blocks_feature_card_grid_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_logo_carousel_logos" ADD CONSTRAINT "_posts_v_blocks_logo_carousel_logos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_logo_carousel_logos" ADD CONSTRAINT "_posts_v_blocks_logo_carousel_logos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_logo_carousel"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_logo_carousel" ADD CONSTRAINT "_posts_v_blocks_logo_carousel_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_media_block" ADD CONSTRAINT "_posts_v_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_media_block" ADD CONSTRAINT "_posts_v_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_newsletter_signup" ADD CONSTRAINT "_posts_v_blocks_newsletter_signup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_photo_strip" ADD CONSTRAINT "_posts_v_blocks_photo_strip_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_shader_hero" ADD CONSTRAINT "_posts_v_blocks_shader_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_spacer" ADD CONSTRAINT "_posts_v_blocks_spacer_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_stats_items" ADD CONSTRAINT "_posts_v_blocks_stats_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_stats"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_stats" ADD CONSTRAINT "_posts_v_blocks_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_testimonials_items" ADD CONSTRAINT "_posts_v_blocks_testimonials_items_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_testimonials_items" ADD CONSTRAINT "_posts_v_blocks_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_testimonials" ADD CONSTRAINT "_posts_v_blocks_testimonials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_video_embed" ADD CONSTRAINT "_posts_v_blocks_video_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_work_history_card" ADD CONSTRAINT "_posts_v_blocks_work_history_card_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_photo_strip_order_idx" ON "pages_blocks_photo_strip" USING btree ("_order");
  CREATE INDEX "pages_blocks_photo_strip_parent_id_idx" ON "pages_blocks_photo_strip" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_photo_strip_path_idx" ON "pages_blocks_photo_strip" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_photo_strip_order_idx" ON "_pages_v_blocks_photo_strip" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_photo_strip_parent_id_idx" ON "_pages_v_blocks_photo_strip" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_photo_strip_path_idx" ON "_pages_v_blocks_photo_strip" USING btree ("_path");
  CREATE INDEX "posts_blocks_articles_archive_order_idx" ON "posts_blocks_articles_archive" USING btree ("_order");
  CREATE INDEX "posts_blocks_articles_archive_parent_id_idx" ON "posts_blocks_articles_archive" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_articles_archive_path_idx" ON "posts_blocks_articles_archive" USING btree ("_path");
  CREATE INDEX "posts_blocks_cta_links_order_idx" ON "posts_blocks_cta_links" USING btree ("_order");
  CREATE INDEX "posts_blocks_cta_links_parent_id_idx" ON "posts_blocks_cta_links" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_cta_order_idx" ON "posts_blocks_cta" USING btree ("_order");
  CREATE INDEX "posts_blocks_cta_parent_id_idx" ON "posts_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_cta_path_idx" ON "posts_blocks_cta" USING btree ("_path");
  CREATE INDEX "posts_blocks_contact_form_order_idx" ON "posts_blocks_contact_form" USING btree ("_order");
  CREATE INDEX "posts_blocks_contact_form_parent_id_idx" ON "posts_blocks_contact_form" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_contact_form_path_idx" ON "posts_blocks_contact_form" USING btree ("_path");
  CREATE INDEX "posts_blocks_content_columns_order_idx" ON "posts_blocks_content_columns" USING btree ("_order");
  CREATE INDEX "posts_blocks_content_columns_parent_id_idx" ON "posts_blocks_content_columns" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_content_order_idx" ON "posts_blocks_content" USING btree ("_order");
  CREATE INDEX "posts_blocks_content_parent_id_idx" ON "posts_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_content_path_idx" ON "posts_blocks_content" USING btree ("_path");
  CREATE INDEX "posts_blocks_faq_list_items_order_idx" ON "posts_blocks_faq_list_items" USING btree ("_order");
  CREATE INDEX "posts_blocks_faq_list_items_parent_id_idx" ON "posts_blocks_faq_list_items" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_faq_list_order_idx" ON "posts_blocks_faq_list" USING btree ("_order");
  CREATE INDEX "posts_blocks_faq_list_parent_id_idx" ON "posts_blocks_faq_list" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_faq_list_path_idx" ON "posts_blocks_faq_list" USING btree ("_path");
  CREATE INDEX "posts_blocks_feature_card_grid_cards_order_idx" ON "posts_blocks_feature_card_grid_cards" USING btree ("_order");
  CREATE INDEX "posts_blocks_feature_card_grid_cards_parent_id_idx" ON "posts_blocks_feature_card_grid_cards" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_feature_card_grid_cards_icon_idx" ON "posts_blocks_feature_card_grid_cards" USING btree ("icon_id");
  CREATE INDEX "posts_blocks_feature_card_grid_order_idx" ON "posts_blocks_feature_card_grid" USING btree ("_order");
  CREATE INDEX "posts_blocks_feature_card_grid_parent_id_idx" ON "posts_blocks_feature_card_grid" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_feature_card_grid_path_idx" ON "posts_blocks_feature_card_grid" USING btree ("_path");
  CREATE INDEX "posts_blocks_logo_carousel_logos_order_idx" ON "posts_blocks_logo_carousel_logos" USING btree ("_order");
  CREATE INDEX "posts_blocks_logo_carousel_logos_parent_id_idx" ON "posts_blocks_logo_carousel_logos" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_logo_carousel_logos_image_idx" ON "posts_blocks_logo_carousel_logos" USING btree ("image_id");
  CREATE INDEX "posts_blocks_logo_carousel_order_idx" ON "posts_blocks_logo_carousel" USING btree ("_order");
  CREATE INDEX "posts_blocks_logo_carousel_parent_id_idx" ON "posts_blocks_logo_carousel" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_logo_carousel_path_idx" ON "posts_blocks_logo_carousel" USING btree ("_path");
  CREATE INDEX "posts_blocks_media_block_order_idx" ON "posts_blocks_media_block" USING btree ("_order");
  CREATE INDEX "posts_blocks_media_block_parent_id_idx" ON "posts_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_media_block_path_idx" ON "posts_blocks_media_block" USING btree ("_path");
  CREATE INDEX "posts_blocks_media_block_media_idx" ON "posts_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "posts_blocks_newsletter_signup_order_idx" ON "posts_blocks_newsletter_signup" USING btree ("_order");
  CREATE INDEX "posts_blocks_newsletter_signup_parent_id_idx" ON "posts_blocks_newsletter_signup" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_newsletter_signup_path_idx" ON "posts_blocks_newsletter_signup" USING btree ("_path");
  CREATE INDEX "posts_blocks_photo_strip_order_idx" ON "posts_blocks_photo_strip" USING btree ("_order");
  CREATE INDEX "posts_blocks_photo_strip_parent_id_idx" ON "posts_blocks_photo_strip" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_photo_strip_path_idx" ON "posts_blocks_photo_strip" USING btree ("_path");
  CREATE INDEX "posts_blocks_shader_hero_order_idx" ON "posts_blocks_shader_hero" USING btree ("_order");
  CREATE INDEX "posts_blocks_shader_hero_parent_id_idx" ON "posts_blocks_shader_hero" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_shader_hero_path_idx" ON "posts_blocks_shader_hero" USING btree ("_path");
  CREATE INDEX "posts_blocks_spacer_order_idx" ON "posts_blocks_spacer" USING btree ("_order");
  CREATE INDEX "posts_blocks_spacer_parent_id_idx" ON "posts_blocks_spacer" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_spacer_path_idx" ON "posts_blocks_spacer" USING btree ("_path");
  CREATE INDEX "posts_blocks_stats_items_order_idx" ON "posts_blocks_stats_items" USING btree ("_order");
  CREATE INDEX "posts_blocks_stats_items_parent_id_idx" ON "posts_blocks_stats_items" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_stats_order_idx" ON "posts_blocks_stats" USING btree ("_order");
  CREATE INDEX "posts_blocks_stats_parent_id_idx" ON "posts_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_stats_path_idx" ON "posts_blocks_stats" USING btree ("_path");
  CREATE INDEX "posts_blocks_testimonials_items_order_idx" ON "posts_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "posts_blocks_testimonials_items_parent_id_idx" ON "posts_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_testimonials_items_avatar_idx" ON "posts_blocks_testimonials_items" USING btree ("avatar_id");
  CREATE INDEX "posts_blocks_testimonials_order_idx" ON "posts_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "posts_blocks_testimonials_parent_id_idx" ON "posts_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_testimonials_path_idx" ON "posts_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "posts_blocks_video_embed_order_idx" ON "posts_blocks_video_embed" USING btree ("_order");
  CREATE INDEX "posts_blocks_video_embed_parent_id_idx" ON "posts_blocks_video_embed" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_video_embed_path_idx" ON "posts_blocks_video_embed" USING btree ("_path");
  CREATE INDEX "posts_blocks_work_history_card_order_idx" ON "posts_blocks_work_history_card" USING btree ("_order");
  CREATE INDEX "posts_blocks_work_history_card_parent_id_idx" ON "posts_blocks_work_history_card" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_work_history_card_path_idx" ON "posts_blocks_work_history_card" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_articles_archive_order_idx" ON "_posts_v_blocks_articles_archive" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_articles_archive_parent_id_idx" ON "_posts_v_blocks_articles_archive" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_articles_archive_path_idx" ON "_posts_v_blocks_articles_archive" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_cta_links_order_idx" ON "_posts_v_blocks_cta_links" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_cta_links_parent_id_idx" ON "_posts_v_blocks_cta_links" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_cta_order_idx" ON "_posts_v_blocks_cta" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_cta_parent_id_idx" ON "_posts_v_blocks_cta" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_cta_path_idx" ON "_posts_v_blocks_cta" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_contact_form_order_idx" ON "_posts_v_blocks_contact_form" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_contact_form_parent_id_idx" ON "_posts_v_blocks_contact_form" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_contact_form_path_idx" ON "_posts_v_blocks_contact_form" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_content_columns_order_idx" ON "_posts_v_blocks_content_columns" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_content_columns_parent_id_idx" ON "_posts_v_blocks_content_columns" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_content_order_idx" ON "_posts_v_blocks_content" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_content_parent_id_idx" ON "_posts_v_blocks_content" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_content_path_idx" ON "_posts_v_blocks_content" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_faq_list_items_order_idx" ON "_posts_v_blocks_faq_list_items" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_faq_list_items_parent_id_idx" ON "_posts_v_blocks_faq_list_items" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_faq_list_order_idx" ON "_posts_v_blocks_faq_list" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_faq_list_parent_id_idx" ON "_posts_v_blocks_faq_list" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_faq_list_path_idx" ON "_posts_v_blocks_faq_list" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_feature_card_grid_cards_order_idx" ON "_posts_v_blocks_feature_card_grid_cards" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_feature_card_grid_cards_parent_id_idx" ON "_posts_v_blocks_feature_card_grid_cards" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_feature_card_grid_cards_icon_idx" ON "_posts_v_blocks_feature_card_grid_cards" USING btree ("icon_id");
  CREATE INDEX "_posts_v_blocks_feature_card_grid_order_idx" ON "_posts_v_blocks_feature_card_grid" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_feature_card_grid_parent_id_idx" ON "_posts_v_blocks_feature_card_grid" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_feature_card_grid_path_idx" ON "_posts_v_blocks_feature_card_grid" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_logo_carousel_logos_order_idx" ON "_posts_v_blocks_logo_carousel_logos" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_logo_carousel_logos_parent_id_idx" ON "_posts_v_blocks_logo_carousel_logos" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_logo_carousel_logos_image_idx" ON "_posts_v_blocks_logo_carousel_logos" USING btree ("image_id");
  CREATE INDEX "_posts_v_blocks_logo_carousel_order_idx" ON "_posts_v_blocks_logo_carousel" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_logo_carousel_parent_id_idx" ON "_posts_v_blocks_logo_carousel" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_logo_carousel_path_idx" ON "_posts_v_blocks_logo_carousel" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_media_block_order_idx" ON "_posts_v_blocks_media_block" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_media_block_parent_id_idx" ON "_posts_v_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_media_block_path_idx" ON "_posts_v_blocks_media_block" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_media_block_media_idx" ON "_posts_v_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "_posts_v_blocks_newsletter_signup_order_idx" ON "_posts_v_blocks_newsletter_signup" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_newsletter_signup_parent_id_idx" ON "_posts_v_blocks_newsletter_signup" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_newsletter_signup_path_idx" ON "_posts_v_blocks_newsletter_signup" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_photo_strip_order_idx" ON "_posts_v_blocks_photo_strip" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_photo_strip_parent_id_idx" ON "_posts_v_blocks_photo_strip" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_photo_strip_path_idx" ON "_posts_v_blocks_photo_strip" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_shader_hero_order_idx" ON "_posts_v_blocks_shader_hero" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_shader_hero_parent_id_idx" ON "_posts_v_blocks_shader_hero" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_shader_hero_path_idx" ON "_posts_v_blocks_shader_hero" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_spacer_order_idx" ON "_posts_v_blocks_spacer" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_spacer_parent_id_idx" ON "_posts_v_blocks_spacer" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_spacer_path_idx" ON "_posts_v_blocks_spacer" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_stats_items_order_idx" ON "_posts_v_blocks_stats_items" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_stats_items_parent_id_idx" ON "_posts_v_blocks_stats_items" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_stats_order_idx" ON "_posts_v_blocks_stats" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_stats_parent_id_idx" ON "_posts_v_blocks_stats" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_stats_path_idx" ON "_posts_v_blocks_stats" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_testimonials_items_order_idx" ON "_posts_v_blocks_testimonials_items" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_testimonials_items_parent_id_idx" ON "_posts_v_blocks_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_testimonials_items_avatar_idx" ON "_posts_v_blocks_testimonials_items" USING btree ("avatar_id");
  CREATE INDEX "_posts_v_blocks_testimonials_order_idx" ON "_posts_v_blocks_testimonials" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_testimonials_parent_id_idx" ON "_posts_v_blocks_testimonials" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_testimonials_path_idx" ON "_posts_v_blocks_testimonials" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_video_embed_order_idx" ON "_posts_v_blocks_video_embed" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_video_embed_parent_id_idx" ON "_posts_v_blocks_video_embed" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_video_embed_path_idx" ON "_posts_v_blocks_video_embed" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_work_history_card_order_idx" ON "_posts_v_blocks_work_history_card" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_work_history_card_parent_id_idx" ON "_posts_v_blocks_work_history_card" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_work_history_card_path_idx" ON "_posts_v_blocks_work_history_card" USING btree ("_path");
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_rels_pages_id_idx" ON "posts_rels" USING btree ("pages_id");
  CREATE INDEX "posts_rels_media_id_idx" ON "posts_rels" USING btree ("media_id");
  CREATE INDEX "_posts_v_rels_pages_id_idx" ON "_posts_v_rels" USING btree ("pages_id");
  CREATE INDEX "_posts_v_rels_media_id_idx" ON "_posts_v_rels" USING btree ("media_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_photo_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_photo_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_articles_archive" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_cta_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_contact_form" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_content_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_content" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_faq_list_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_faq_list" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_feature_card_grid_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_feature_card_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_logo_carousel_logos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_logo_carousel" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_newsletter_signup" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_photo_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_shader_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_spacer" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_stats_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_stats" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_video_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_work_history_card" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_articles_archive" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_cta_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_contact_form" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_content_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_content" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_faq_list_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_faq_list" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_feature_card_grid_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_feature_card_grid" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_logo_carousel_logos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_logo_carousel" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_newsletter_signup" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_photo_strip" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_shader_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_spacer" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_stats_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_stats" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_testimonials_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_video_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_work_history_card" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_photo_strip" CASCADE;
  DROP TABLE "_pages_v_blocks_photo_strip" CASCADE;
  DROP TABLE "posts_blocks_articles_archive" CASCADE;
  DROP TABLE "posts_blocks_cta_links" CASCADE;
  DROP TABLE "posts_blocks_cta" CASCADE;
  DROP TABLE "posts_blocks_contact_form" CASCADE;
  DROP TABLE "posts_blocks_content_columns" CASCADE;
  DROP TABLE "posts_blocks_content" CASCADE;
  DROP TABLE "posts_blocks_faq_list_items" CASCADE;
  DROP TABLE "posts_blocks_faq_list" CASCADE;
  DROP TABLE "posts_blocks_feature_card_grid_cards" CASCADE;
  DROP TABLE "posts_blocks_feature_card_grid" CASCADE;
  DROP TABLE "posts_blocks_logo_carousel_logos" CASCADE;
  DROP TABLE "posts_blocks_logo_carousel" CASCADE;
  DROP TABLE "posts_blocks_media_block" CASCADE;
  DROP TABLE "posts_blocks_newsletter_signup" CASCADE;
  DROP TABLE "posts_blocks_photo_strip" CASCADE;
  DROP TABLE "posts_blocks_shader_hero" CASCADE;
  DROP TABLE "posts_blocks_spacer" CASCADE;
  DROP TABLE "posts_blocks_stats_items" CASCADE;
  DROP TABLE "posts_blocks_stats" CASCADE;
  DROP TABLE "posts_blocks_testimonials_items" CASCADE;
  DROP TABLE "posts_blocks_testimonials" CASCADE;
  DROP TABLE "posts_blocks_video_embed" CASCADE;
  DROP TABLE "posts_blocks_work_history_card" CASCADE;
  DROP TABLE "_posts_v_blocks_articles_archive" CASCADE;
  DROP TABLE "_posts_v_blocks_cta_links" CASCADE;
  DROP TABLE "_posts_v_blocks_cta" CASCADE;
  DROP TABLE "_posts_v_blocks_contact_form" CASCADE;
  DROP TABLE "_posts_v_blocks_content_columns" CASCADE;
  DROP TABLE "_posts_v_blocks_content" CASCADE;
  DROP TABLE "_posts_v_blocks_faq_list_items" CASCADE;
  DROP TABLE "_posts_v_blocks_faq_list" CASCADE;
  DROP TABLE "_posts_v_blocks_feature_card_grid_cards" CASCADE;
  DROP TABLE "_posts_v_blocks_feature_card_grid" CASCADE;
  DROP TABLE "_posts_v_blocks_logo_carousel_logos" CASCADE;
  DROP TABLE "_posts_v_blocks_logo_carousel" CASCADE;
  DROP TABLE "_posts_v_blocks_media_block" CASCADE;
  DROP TABLE "_posts_v_blocks_newsletter_signup" CASCADE;
  DROP TABLE "_posts_v_blocks_photo_strip" CASCADE;
  DROP TABLE "_posts_v_blocks_shader_hero" CASCADE;
  DROP TABLE "_posts_v_blocks_spacer" CASCADE;
  DROP TABLE "_posts_v_blocks_stats_items" CASCADE;
  DROP TABLE "_posts_v_blocks_stats" CASCADE;
  DROP TABLE "_posts_v_blocks_testimonials_items" CASCADE;
  DROP TABLE "_posts_v_blocks_testimonials" CASCADE;
  DROP TABLE "_posts_v_blocks_video_embed" CASCADE;
  DROP TABLE "_posts_v_blocks_work_history_card" CASCADE;
  ALTER TABLE "posts_rels" DROP CONSTRAINT "posts_rels_pages_fk";
  
  ALTER TABLE "posts_rels" DROP CONSTRAINT "posts_rels_media_fk";
  
  ALTER TABLE "_posts_v_rels" DROP CONSTRAINT "_posts_v_rels_pages_fk";
  
  ALTER TABLE "_posts_v_rels" DROP CONSTRAINT "_posts_v_rels_media_fk";
  
  DROP INDEX "posts_rels_pages_id_idx";
  DROP INDEX "posts_rels_media_id_idx";
  DROP INDEX "_posts_v_rels_pages_id_idx";
  DROP INDEX "_posts_v_rels_media_id_idx";
  ALTER TABLE "posts_rels" DROP COLUMN "pages_id";
  ALTER TABLE "posts_rels" DROP COLUMN "media_id";
  ALTER TABLE "_posts_v_rels" DROP COLUMN "pages_id";
  ALTER TABLE "_posts_v_rels" DROP COLUMN "media_id";
  DROP TYPE "public"."enum_posts_blocks_cta_links_link_type";
  DROP TYPE "public"."enum_posts_blocks_cta_links_link_appearance";
  DROP TYPE "public"."enum_posts_blocks_content_columns_size";
  DROP TYPE "public"."enum_posts_blocks_content_columns_link_type";
  DROP TYPE "public"."enum_posts_blocks_content_columns_link_appearance";
  DROP TYPE "public"."enum_posts_blocks_feature_card_grid_cards_link_type";
  DROP TYPE "public"."enum_posts_blocks_feature_card_grid_cards_link_appearance";
  DROP TYPE "public"."enum_posts_blocks_logo_carousel_layout";
  DROP TYPE "public"."enum_posts_blocks_shader_hero_preset";
  DROP TYPE "public"."enum_posts_blocks_spacer_size";
  DROP TYPE "public"."enum__posts_v_blocks_cta_links_link_type";
  DROP TYPE "public"."enum__posts_v_blocks_cta_links_link_appearance";
  DROP TYPE "public"."enum__posts_v_blocks_content_columns_size";
  DROP TYPE "public"."enum__posts_v_blocks_content_columns_link_type";
  DROP TYPE "public"."enum__posts_v_blocks_content_columns_link_appearance";
  DROP TYPE "public"."enum__posts_v_blocks_feature_card_grid_cards_link_type";
  DROP TYPE "public"."enum__posts_v_blocks_feature_card_grid_cards_link_appearance";
  DROP TYPE "public"."enum__posts_v_blocks_logo_carousel_layout";
  DROP TYPE "public"."enum__posts_v_blocks_shader_hero_preset";
  DROP TYPE "public"."enum__posts_v_blocks_spacer_size";`)
}
