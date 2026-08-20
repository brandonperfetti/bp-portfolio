import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_carousel_direction" AS ENUM('horizontal', 'vertical');
  ALTER TABLE "pages_blocks_carousel" ADD COLUMN "direction" "enum_carousel_direction" DEFAULT 'horizontal';
  ALTER TABLE "pages_blocks_carousel" ADD COLUMN "rotate" numeric DEFAULT 0;
  ALTER TABLE "pages_blocks_carousel" ADD COLUMN "grayscale" boolean DEFAULT true;
  ALTER TABLE "_pages_v_blocks_carousel" ADD COLUMN "direction" "enum_carousel_direction" DEFAULT 'horizontal';
  ALTER TABLE "_pages_v_blocks_carousel" ADD COLUMN "rotate" numeric DEFAULT 0;
  ALTER TABLE "_pages_v_blocks_carousel" ADD COLUMN "grayscale" boolean DEFAULT true;
  ALTER TABLE "posts_blocks_carousel" ADD COLUMN "direction" "enum_carousel_direction" DEFAULT 'horizontal';
  ALTER TABLE "posts_blocks_carousel" ADD COLUMN "rotate" numeric DEFAULT 0;
  ALTER TABLE "posts_blocks_carousel" ADD COLUMN "grayscale" boolean DEFAULT true;
  ALTER TABLE "_posts_v_blocks_carousel" ADD COLUMN "direction" "enum_carousel_direction" DEFAULT 'horizontal';
  ALTER TABLE "_posts_v_blocks_carousel" ADD COLUMN "rotate" numeric DEFAULT 0;
  ALTER TABLE "_posts_v_blocks_carousel" ADD COLUMN "grayscale" boolean DEFAULT true;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_carousel" DROP COLUMN "direction";
  ALTER TABLE "pages_blocks_carousel" DROP COLUMN "rotate";
  ALTER TABLE "pages_blocks_carousel" DROP COLUMN "grayscale";
  ALTER TABLE "_pages_v_blocks_carousel" DROP COLUMN "direction";
  ALTER TABLE "_pages_v_blocks_carousel" DROP COLUMN "rotate";
  ALTER TABLE "_pages_v_blocks_carousel" DROP COLUMN "grayscale";
  ALTER TABLE "posts_blocks_carousel" DROP COLUMN "direction";
  ALTER TABLE "posts_blocks_carousel" DROP COLUMN "rotate";
  ALTER TABLE "posts_blocks_carousel" DROP COLUMN "grayscale";
  ALTER TABLE "_posts_v_blocks_carousel" DROP COLUMN "direction";
  ALTER TABLE "_posts_v_blocks_carousel" DROP COLUMN "rotate";
  ALTER TABLE "_posts_v_blocks_carousel" DROP COLUMN "grayscale";
  DROP TYPE "public"."enum_carousel_direction";`)
}
