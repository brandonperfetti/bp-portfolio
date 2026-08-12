import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_column_content_inset" AS ENUM('none', 'railGutter');
  ALTER TYPE "public"."enum_container_gap" ADD VALUE 'homeParity';
  ALTER TABLE "pages_blocks_articles_archive" ADD COLUMN "reveal_on_scroll" boolean DEFAULT false;
  ALTER TABLE "pages_blocks_photo_strip" ADD COLUMN "full_bleed" boolean DEFAULT false;
  ALTER TABLE "pages_blocks_photo_strip" ADD COLUMN "priority" boolean DEFAULT false;
  ALTER TABLE "pages_blocks_column" ADD COLUMN "content_inset" "enum_column_content_inset" DEFAULT 'none';
  ALTER TABLE "pages_blocks_column" ADD COLUMN "reveal_children" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "hero_reveal_content" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_articles_archive" ADD COLUMN "reveal_on_scroll" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_photo_strip" ADD COLUMN "full_bleed" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_photo_strip" ADD COLUMN "priority" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_column" ADD COLUMN "content_inset" "enum_column_content_inset" DEFAULT 'none';
  ALTER TABLE "_pages_v_blocks_column" ADD COLUMN "reveal_children" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_reveal_content" boolean DEFAULT false;
  ALTER TABLE "posts_blocks_articles_archive" ADD COLUMN "reveal_on_scroll" boolean DEFAULT false;
  ALTER TABLE "posts_blocks_photo_strip" ADD COLUMN "full_bleed" boolean DEFAULT false;
  ALTER TABLE "posts_blocks_photo_strip" ADD COLUMN "priority" boolean DEFAULT false;
  ALTER TABLE "posts_blocks_column" ADD COLUMN "content_inset" "enum_column_content_inset" DEFAULT 'none';
  ALTER TABLE "posts_blocks_column" ADD COLUMN "reveal_children" boolean DEFAULT false;
  ALTER TABLE "_posts_v_blocks_articles_archive" ADD COLUMN "reveal_on_scroll" boolean DEFAULT false;
  ALTER TABLE "_posts_v_blocks_photo_strip" ADD COLUMN "full_bleed" boolean DEFAULT false;
  ALTER TABLE "_posts_v_blocks_photo_strip" ADD COLUMN "priority" boolean DEFAULT false;
  ALTER TABLE "_posts_v_blocks_column" ADD COLUMN "content_inset" "enum_column_content_inset" DEFAULT 'none';
  ALTER TABLE "_posts_v_blocks_column" ADD COLUMN "reveal_children" boolean DEFAULT false;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_container" ALTER COLUMN "gap" SET DATA TYPE text;
  ALTER TABLE "pages_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::text;
  ALTER TABLE "_pages_v_blocks_container" ALTER COLUMN "gap" SET DATA TYPE text;
  ALTER TABLE "_pages_v_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::text;
  ALTER TABLE "posts_blocks_container" ALTER COLUMN "gap" SET DATA TYPE text;
  ALTER TABLE "posts_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::text;
  ALTER TABLE "_posts_v_blocks_container" ALTER COLUMN "gap" SET DATA TYPE text;
  ALTER TABLE "_posts_v_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::text;
  DROP TYPE "public"."enum_container_gap";
  CREATE TYPE "public"."enum_container_gap" AS ENUM('sm', 'md', 'lg');
  ALTER TABLE "pages_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::"public"."enum_container_gap";
  ALTER TABLE "pages_blocks_container" ALTER COLUMN "gap" SET DATA TYPE "public"."enum_container_gap" USING "gap"::"public"."enum_container_gap";
  ALTER TABLE "_pages_v_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::"public"."enum_container_gap";
  ALTER TABLE "_pages_v_blocks_container" ALTER COLUMN "gap" SET DATA TYPE "public"."enum_container_gap" USING "gap"::"public"."enum_container_gap";
  ALTER TABLE "posts_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::"public"."enum_container_gap";
  ALTER TABLE "posts_blocks_container" ALTER COLUMN "gap" SET DATA TYPE "public"."enum_container_gap" USING "gap"::"public"."enum_container_gap";
  ALTER TABLE "_posts_v_blocks_container" ALTER COLUMN "gap" SET DEFAULT 'md'::"public"."enum_container_gap";
  ALTER TABLE "_posts_v_blocks_container" ALTER COLUMN "gap" SET DATA TYPE "public"."enum_container_gap" USING "gap"::"public"."enum_container_gap";
  ALTER TABLE "pages_blocks_articles_archive" DROP COLUMN "reveal_on_scroll";
  ALTER TABLE "pages_blocks_photo_strip" DROP COLUMN "full_bleed";
  ALTER TABLE "pages_blocks_photo_strip" DROP COLUMN "priority";
  ALTER TABLE "pages_blocks_column" DROP COLUMN "content_inset";
  ALTER TABLE "pages_blocks_column" DROP COLUMN "reveal_children";
  ALTER TABLE "pages" DROP COLUMN "hero_reveal_content";
  ALTER TABLE "_pages_v_blocks_articles_archive" DROP COLUMN "reveal_on_scroll";
  ALTER TABLE "_pages_v_blocks_photo_strip" DROP COLUMN "full_bleed";
  ALTER TABLE "_pages_v_blocks_photo_strip" DROP COLUMN "priority";
  ALTER TABLE "_pages_v_blocks_column" DROP COLUMN "content_inset";
  ALTER TABLE "_pages_v_blocks_column" DROP COLUMN "reveal_children";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_reveal_content";
  ALTER TABLE "posts_blocks_articles_archive" DROP COLUMN "reveal_on_scroll";
  ALTER TABLE "posts_blocks_photo_strip" DROP COLUMN "full_bleed";
  ALTER TABLE "posts_blocks_photo_strip" DROP COLUMN "priority";
  ALTER TABLE "posts_blocks_column" DROP COLUMN "content_inset";
  ALTER TABLE "posts_blocks_column" DROP COLUMN "reveal_children";
  ALTER TABLE "_posts_v_blocks_articles_archive" DROP COLUMN "reveal_on_scroll";
  ALTER TABLE "_posts_v_blocks_photo_strip" DROP COLUMN "full_bleed";
  ALTER TABLE "_posts_v_blocks_photo_strip" DROP COLUMN "priority";
  ALTER TABLE "_posts_v_blocks_column" DROP COLUMN "content_inset";
  ALTER TABLE "_posts_v_blocks_column" DROP COLUMN "reveal_children";
  DROP TYPE "public"."enum_column_content_inset";`)
}
