import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_carousel" ADD COLUMN "full_bleed" boolean DEFAULT true;
  ALTER TABLE "_pages_v_blocks_carousel" ADD COLUMN "full_bleed" boolean DEFAULT true;
  ALTER TABLE "posts_blocks_carousel" ADD COLUMN "full_bleed" boolean DEFAULT true;
  ALTER TABLE "_posts_v_blocks_carousel" ADD COLUMN "full_bleed" boolean DEFAULT true;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_carousel" DROP COLUMN "full_bleed";
  ALTER TABLE "_pages_v_blocks_carousel" DROP COLUMN "full_bleed";
  ALTER TABLE "posts_blocks_carousel" DROP COLUMN "full_bleed";
  ALTER TABLE "_posts_v_blocks_carousel" DROP COLUMN "full_bleed";`)
}
