import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_share_targets_add" AS ENUM('x', 'linkedin', 'facebook', 'reddit', 'hackernews', 'email', 'copylink');
  CREATE TYPE "public"."enum_pages_share_targets_remove" AS ENUM('x', 'linkedin', 'facebook', 'reddit', 'hackernews', 'email', 'copylink');
  CREATE TYPE "public"."enum_pages_og_image_mode" AS ENUM('auto', 'bespoke', 'generated');
  CREATE TYPE "public"."enum_posts_share_targets_add" AS ENUM('x', 'linkedin', 'facebook', 'reddit', 'hackernews', 'email', 'copylink');
  CREATE TYPE "public"."enum_posts_share_targets_remove" AS ENUM('x', 'linkedin', 'facebook', 'reddit', 'hackernews', 'email', 'copylink');
  CREATE TYPE "public"."enum_posts_og_image_mode" AS ENUM('auto', 'bespoke', 'generated');
  CREATE TYPE "public"."enum_site_settings_share_targets" AS ENUM('x', 'linkedin', 'facebook', 'reddit', 'hackernews', 'email', 'copylink');
  CREATE TABLE "pages_share_targets_add" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_pages_share_targets_add",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "pages_share_targets_remove" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_pages_share_targets_remove",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_pages_v_version_share_targets_add" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_pages_share_targets_add",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_pages_v_version_share_targets_remove" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_pages_share_targets_remove",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "posts_share_targets_add" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_posts_share_targets_add",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "posts_share_targets_remove" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_posts_share_targets_remove",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_posts_v_version_share_targets_add" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_posts_share_targets_add",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_posts_v_version_share_targets_remove" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_posts_share_targets_remove",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "site_settings_share_targets" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_site_settings_share_targets",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "pages" ADD COLUMN "disable_sharing" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "og_image_mode" "enum_pages_og_image_mode" DEFAULT 'auto';
  ALTER TABLE "_pages_v" ADD COLUMN "version_disable_sharing" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_og_image_mode" "enum_pages_og_image_mode" DEFAULT 'auto';
  ALTER TABLE "posts" ADD COLUMN "disable_sharing" boolean DEFAULT false;
  ALTER TABLE "posts" ADD COLUMN "og_image_mode" "enum_posts_og_image_mode" DEFAULT 'auto';
  ALTER TABLE "_posts_v" ADD COLUMN "version_disable_sharing" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_og_image_mode" "enum_posts_og_image_mode" DEFAULT 'auto';
  ALTER TABLE "site_settings" ADD COLUMN "copy_page_enabled" boolean DEFAULT true;
  ALTER TABLE "site_settings" ADD COLUMN "copy_page_label" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "generated_og_enabled" boolean DEFAULT false;
  ALTER TABLE "pages_share_targets_add" ADD CONSTRAINT "pages_share_targets_add_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_share_targets_remove" ADD CONSTRAINT "pages_share_targets_remove_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_share_targets_add" ADD CONSTRAINT "_pages_v_version_share_targets_add_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_share_targets_remove" ADD CONSTRAINT "_pages_v_version_share_targets_remove_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_share_targets_add" ADD CONSTRAINT "posts_share_targets_add_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_share_targets_remove" ADD CONSTRAINT "posts_share_targets_remove_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_share_targets_add" ADD CONSTRAINT "_posts_v_version_share_targets_add_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_share_targets_remove" ADD CONSTRAINT "_posts_v_version_share_targets_remove_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_share_targets" ADD CONSTRAINT "site_settings_share_targets_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_share_targets_add_order_idx" ON "pages_share_targets_add" USING btree ("order");
  CREATE INDEX "pages_share_targets_add_parent_idx" ON "pages_share_targets_add" USING btree ("parent_id");
  CREATE INDEX "pages_share_targets_remove_order_idx" ON "pages_share_targets_remove" USING btree ("order");
  CREATE INDEX "pages_share_targets_remove_parent_idx" ON "pages_share_targets_remove" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_share_targets_add_order_idx" ON "_pages_v_version_share_targets_add" USING btree ("order");
  CREATE INDEX "_pages_v_version_share_targets_add_parent_idx" ON "_pages_v_version_share_targets_add" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_share_targets_remove_order_idx" ON "_pages_v_version_share_targets_remove" USING btree ("order");
  CREATE INDEX "_pages_v_version_share_targets_remove_parent_idx" ON "_pages_v_version_share_targets_remove" USING btree ("parent_id");
  CREATE INDEX "posts_share_targets_add_order_idx" ON "posts_share_targets_add" USING btree ("order");
  CREATE INDEX "posts_share_targets_add_parent_idx" ON "posts_share_targets_add" USING btree ("parent_id");
  CREATE INDEX "posts_share_targets_remove_order_idx" ON "posts_share_targets_remove" USING btree ("order");
  CREATE INDEX "posts_share_targets_remove_parent_idx" ON "posts_share_targets_remove" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_share_targets_add_order_idx" ON "_posts_v_version_share_targets_add" USING btree ("order");
  CREATE INDEX "_posts_v_version_share_targets_add_parent_idx" ON "_posts_v_version_share_targets_add" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_share_targets_remove_order_idx" ON "_posts_v_version_share_targets_remove" USING btree ("order");
  CREATE INDEX "_posts_v_version_share_targets_remove_parent_idx" ON "_posts_v_version_share_targets_remove" USING btree ("parent_id");
  CREATE INDEX "site_settings_share_targets_order_idx" ON "site_settings_share_targets" USING btree ("order");
  CREATE INDEX "site_settings_share_targets_parent_idx" ON "site_settings_share_targets" USING btree ("parent_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_share_targets_add" CASCADE;
  DROP TABLE "pages_share_targets_remove" CASCADE;
  DROP TABLE "_pages_v_version_share_targets_add" CASCADE;
  DROP TABLE "_pages_v_version_share_targets_remove" CASCADE;
  DROP TABLE "posts_share_targets_add" CASCADE;
  DROP TABLE "posts_share_targets_remove" CASCADE;
  DROP TABLE "_posts_v_version_share_targets_add" CASCADE;
  DROP TABLE "_posts_v_version_share_targets_remove" CASCADE;
  DROP TABLE "site_settings_share_targets" CASCADE;
  ALTER TABLE "pages" DROP COLUMN "disable_sharing";
  ALTER TABLE "pages" DROP COLUMN "og_image_mode";
  ALTER TABLE "_pages_v" DROP COLUMN "version_disable_sharing";
  ALTER TABLE "_pages_v" DROP COLUMN "version_og_image_mode";
  ALTER TABLE "posts" DROP COLUMN "disable_sharing";
  ALTER TABLE "posts" DROP COLUMN "og_image_mode";
  ALTER TABLE "_posts_v" DROP COLUMN "version_disable_sharing";
  ALTER TABLE "_posts_v" DROP COLUMN "version_og_image_mode";
  ALTER TABLE "site_settings" DROP COLUMN "copy_page_enabled";
  ALTER TABLE "site_settings" DROP COLUMN "copy_page_label";
  ALTER TABLE "site_settings" DROP COLUMN "generated_og_enabled";
  DROP TYPE "public"."enum_pages_share_targets_add";
  DROP TYPE "public"."enum_pages_share_targets_remove";
  DROP TYPE "public"."enum_pages_og_image_mode";
  DROP TYPE "public"."enum_posts_share_targets_add";
  DROP TYPE "public"."enum_posts_share_targets_remove";
  DROP TYPE "public"."enum_posts_og_image_mode";
  DROP TYPE "public"."enum_site_settings_share_targets";`)
}
