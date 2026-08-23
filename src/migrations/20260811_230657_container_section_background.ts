import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_container_section_bg_style" AS ENUM('none', 'tint', 'gradient');
  CREATE TYPE "public"."enum_container_section_bg_tint" AS ENUM('subtle', 'muted', 'panel');
  CREATE TYPE "public"."enum_container_section_bg_gradient" AS ENUM('fade', 'depth', 'panel');
  CREATE TYPE "public"."enum_container_section_bg_gradient_direction" AS ENUM('toBottom', 'toTop', 'toRight');
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_background_style" "enum_container_section_bg_style" DEFAULT 'none';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_background_tint" "enum_container_section_bg_tint" DEFAULT 'subtle';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_background_gradient" "enum_container_section_bg_gradient" DEFAULT 'fade';
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_background_direction" "enum_container_section_bg_gradient_direction" DEFAULT 'toBottom';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_background_style" "enum_container_section_bg_style" DEFAULT 'none';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_background_tint" "enum_container_section_bg_tint" DEFAULT 'subtle';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_background_gradient" "enum_container_section_bg_gradient" DEFAULT 'fade';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_background_direction" "enum_container_section_bg_gradient_direction" DEFAULT 'toBottom';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_background_style" "enum_container_section_bg_style" DEFAULT 'none';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_background_tint" "enum_container_section_bg_tint" DEFAULT 'subtle';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_background_gradient" "enum_container_section_bg_gradient" DEFAULT 'fade';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_background_direction" "enum_container_section_bg_gradient_direction" DEFAULT 'toBottom';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_background_style" "enum_container_section_bg_style" DEFAULT 'none';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_background_tint" "enum_container_section_bg_tint" DEFAULT 'subtle';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_background_gradient" "enum_container_section_bg_gradient" DEFAULT 'fade';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_background_direction" "enum_container_section_bg_gradient_direction" DEFAULT 'toBottom';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_container" DROP COLUMN "section_background_style";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_background_tint";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_background_gradient";
  ALTER TABLE "pages_blocks_container" DROP COLUMN "section_background_direction";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_background_style";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_background_tint";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_background_gradient";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_background_direction";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_background_style";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_background_tint";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_background_gradient";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_background_direction";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_background_style";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_background_tint";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_background_gradient";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_background_direction";
  DROP TYPE "public"."enum_container_section_bg_style";
  DROP TYPE "public"."enum_container_section_bg_tint";
  DROP TYPE "public"."enum_container_section_bg_gradient";
  DROP TYPE "public"."enum_container_section_bg_gradient_direction";`)
}
