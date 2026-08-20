import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_image_size" AS ENUM('full', 'compact');
  ALTER TABLE "pages_blocks_image" ADD COLUMN "size" "enum_image_size" DEFAULT 'full';
  ALTER TABLE "_pages_v_blocks_image" ADD COLUMN "size" "enum_image_size" DEFAULT 'full';
  ALTER TABLE "posts_blocks_image" ADD COLUMN "size" "enum_image_size" DEFAULT 'full';
  ALTER TABLE "_posts_v_blocks_image" ADD COLUMN "size" "enum_image_size" DEFAULT 'full';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_image" DROP COLUMN "size";
  ALTER TABLE "_pages_v_blocks_image" DROP COLUMN "size";
  ALTER TABLE "posts_blocks_image" DROP COLUMN "size";
  ALTER TABLE "_posts_v_blocks_image" DROP COLUMN "size";
  DROP TYPE "public"."enum_image_size";`)
}
