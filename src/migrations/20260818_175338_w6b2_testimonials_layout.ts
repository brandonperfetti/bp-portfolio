import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_testimonials_layout" AS ENUM('grid', 'carousel');
  ALTER TABLE "pages_blocks_testimonials" ADD COLUMN "layout" "enum_testimonials_layout" DEFAULT 'grid';
  ALTER TABLE "_pages_v_blocks_testimonials" ADD COLUMN "layout" "enum_testimonials_layout" DEFAULT 'grid';
  ALTER TABLE "posts_blocks_testimonials" ADD COLUMN "layout" "enum_testimonials_layout" DEFAULT 'grid';
  ALTER TABLE "_posts_v_blocks_testimonials" ADD COLUMN "layout" "enum_testimonials_layout" DEFAULT 'grid';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_testimonials" DROP COLUMN "layout";
  ALTER TABLE "_pages_v_blocks_testimonials" DROP COLUMN "layout";
  ALTER TABLE "posts_blocks_testimonials" DROP COLUMN "layout";
  ALTER TABLE "_posts_v_blocks_testimonials" DROP COLUMN "layout";
  DROP TYPE "public"."enum_testimonials_layout";`)
}
