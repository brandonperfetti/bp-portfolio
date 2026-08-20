import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_image_inset" AS ENUM('none', 'xs');
  CREATE TYPE "public"."enum_block_visibility" AS ENUM('always', 'desktopOnly', 'mobileOnly');
  ALTER TABLE "pages_blocks_image" ADD COLUMN "inset" "enum_image_inset" DEFAULT 'none';
  ALTER TABLE "pages_blocks_image" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "pages_blocks_social_links" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "pages_blocks_column" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "_pages_v_blocks_image" ADD COLUMN "inset" "enum_image_inset" DEFAULT 'none';
  ALTER TABLE "_pages_v_blocks_image" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "_pages_v_blocks_social_links" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "_pages_v_blocks_column" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "posts_blocks_image" ADD COLUMN "inset" "enum_image_inset" DEFAULT 'none';
  ALTER TABLE "posts_blocks_image" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "posts_blocks_social_links" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "posts_blocks_column" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "_posts_v_blocks_image" ADD COLUMN "inset" "enum_image_inset" DEFAULT 'none';
  ALTER TABLE "_posts_v_blocks_image" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "_posts_v_blocks_social_links" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';
  ALTER TABLE "_posts_v_blocks_column" ADD COLUMN "visibility" "enum_block_visibility" DEFAULT 'always';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_image" DROP COLUMN "inset";
  ALTER TABLE "pages_blocks_image" DROP COLUMN "visibility";
  ALTER TABLE "pages_blocks_social_links" DROP COLUMN "visibility";
  ALTER TABLE "pages_blocks_column" DROP COLUMN "visibility";
  ALTER TABLE "_pages_v_blocks_image" DROP COLUMN "inset";
  ALTER TABLE "_pages_v_blocks_image" DROP COLUMN "visibility";
  ALTER TABLE "_pages_v_blocks_social_links" DROP COLUMN "visibility";
  ALTER TABLE "_pages_v_blocks_column" DROP COLUMN "visibility";
  ALTER TABLE "posts_blocks_image" DROP COLUMN "inset";
  ALTER TABLE "posts_blocks_image" DROP COLUMN "visibility";
  ALTER TABLE "posts_blocks_social_links" DROP COLUMN "visibility";
  ALTER TABLE "posts_blocks_column" DROP COLUMN "visibility";
  ALTER TABLE "_posts_v_blocks_image" DROP COLUMN "inset";
  ALTER TABLE "_posts_v_blocks_image" DROP COLUMN "visibility";
  ALTER TABLE "_posts_v_blocks_social_links" DROP COLUMN "visibility";
  ALTER TABLE "_posts_v_blocks_column" DROP COLUMN "visibility";
  DROP TYPE "public"."enum_image_inset";
  DROP TYPE "public"."enum_block_visibility";`)
}
