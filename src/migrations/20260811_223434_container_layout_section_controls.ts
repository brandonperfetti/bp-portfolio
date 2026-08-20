import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_container_gap" AS ENUM('sm', 'md', 'lg');
  CREATE TYPE "public"."enum_container_vertical_align" AS ENUM('start', 'center', 'stretch');
  CREATE TYPE "public"."enum_container_section_width" AS ENUM('container', 'narrow', 'fullBleed');
  CREATE TYPE "public"."enum_container_section_padding_y" AS ENUM('none', 'sm', 'md', 'lg');
  ALTER TABLE "pages_blocks_column" ADD COLUMN "sticky" boolean DEFAULT false;
  ALTER TABLE "pages_blocks_container" ADD COLUMN "gap" "enum_container_gap" DEFAULT 'md';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "vertical_align" "enum_container_vertical_align" DEFAULT 'stretch';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_width" "enum_container_section_width" DEFAULT 'container';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_padding_y" "enum_container_section_padding_y" DEFAULT 'none';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_anchor_id" varchar;
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_hidden" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_column" ADD COLUMN "sticky" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "gap" "enum_container_gap" DEFAULT 'md';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "vertical_align" "enum_container_vertical_align" DEFAULT 'stretch';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_width" "enum_container_section_width" DEFAULT 'container';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_padding_y" "enum_container_section_padding_y" DEFAULT 'none';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_anchor_id" varchar;
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_hidden" boolean DEFAULT false;
  ALTER TABLE "posts_blocks_column" ADD COLUMN "sticky" boolean DEFAULT false;
  ALTER TABLE "posts_blocks_container" ADD COLUMN "gap" "enum_container_gap" DEFAULT 'md';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "vertical_align" "enum_container_vertical_align" DEFAULT 'stretch';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_width" "enum_container_section_width" DEFAULT 'container';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_padding_y" "enum_container_section_padding_y" DEFAULT 'none';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_anchor_id" varchar;
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_hidden" boolean DEFAULT false;
  ALTER TABLE "_posts_v_blocks_column" ADD COLUMN "sticky" boolean DEFAULT false;
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "gap" "enum_container_gap" DEFAULT 'md';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "vertical_align" "enum_container_vertical_align" DEFAULT 'stretch';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_width" "enum_container_section_width" DEFAULT 'container';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_padding_y" "enum_container_section_padding_y" DEFAULT 'none';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_anchor_id" varchar;
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_hidden" boolean DEFAULT false;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_column" DROP COLUMN "sticky";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "gap";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "vertical_align";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_width";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_padding_y";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_anchor_id";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_hidden";
  ALTER TABLE "_pages_v_blocks_column" DROP COLUMN "sticky";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "gap";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "vertical_align";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_width";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_padding_y";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_anchor_id";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_hidden";
  ALTER TABLE "posts_blocks_column" DROP COLUMN "sticky";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "gap";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "vertical_align";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_width";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_padding_y";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_anchor_id";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_hidden";
  ALTER TABLE "_posts_v_blocks_column" DROP COLUMN "sticky";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "gap";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "vertical_align";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_width";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_padding_y";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_anchor_id";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_hidden";
  DROP TYPE "public"."enum_container_gap";
  DROP TYPE "public"."enum_container_vertical_align";
  DROP TYPE "public"."enum_container_section_width";
  DROP TYPE "public"."enum_container_section_padding_y";`)
}
