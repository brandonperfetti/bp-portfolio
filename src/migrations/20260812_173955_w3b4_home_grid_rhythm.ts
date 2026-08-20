import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_container_section_rhythm" AS ENUM('default', 'home');
  ALTER TABLE "pages_blocks_container" ADD COLUMN "section_rhythm" "enum_container_section_rhythm" DEFAULT 'default';
  ALTER TABLE "_pages_v_blocks_container" ADD COLUMN "section_rhythm" "enum_container_section_rhythm" DEFAULT 'default';
  ALTER TABLE "posts_blocks_container" ADD COLUMN "section_rhythm" "enum_container_section_rhythm" DEFAULT 'default';
  ALTER TABLE "_posts_v_blocks_container" ADD COLUMN "section_rhythm" "enum_container_section_rhythm" DEFAULT 'default';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_container" DROP COLUMN "section_rhythm";
  ALTER TABLE "_pages_v_blocks_container" DROP COLUMN "section_rhythm";
  ALTER TABLE "posts_blocks_container" DROP COLUMN "section_rhythm";
  ALTER TABLE "_posts_v_blocks_container" DROP COLUMN "section_rhythm";
  DROP TYPE "public"."enum_container_section_rhythm";`)
}
