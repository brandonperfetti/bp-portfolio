import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_carousel_effect" ADD VALUE 'carousel3d';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE text;
  ALTER TABLE "pages_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::text;
  ALTER TABLE "_pages_v_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE text;
  ALTER TABLE "_pages_v_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::text;
  ALTER TABLE "posts_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE text;
  ALTER TABLE "posts_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::text;
  ALTER TABLE "_posts_v_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE text;
  ALTER TABLE "_posts_v_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::text;
  DROP TYPE "public"."enum_carousel_effect";
  CREATE TYPE "public"."enum_carousel_effect" AS ENUM('slide', 'fade', 'expo');
  ALTER TABLE "pages_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::"public"."enum_carousel_effect";
  ALTER TABLE "pages_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE "public"."enum_carousel_effect" USING "effect"::"public"."enum_carousel_effect";
  ALTER TABLE "_pages_v_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::"public"."enum_carousel_effect";
  ALTER TABLE "_pages_v_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE "public"."enum_carousel_effect" USING "effect"::"public"."enum_carousel_effect";
  ALTER TABLE "posts_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::"public"."enum_carousel_effect";
  ALTER TABLE "posts_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE "public"."enum_carousel_effect" USING "effect"::"public"."enum_carousel_effect";
  ALTER TABLE "_posts_v_blocks_carousel" ALTER COLUMN "effect" SET DEFAULT 'slide'::"public"."enum_carousel_effect";
  ALTER TABLE "_posts_v_blocks_carousel" ALTER COLUMN "effect" SET DATA TYPE "public"."enum_carousel_effect" USING "effect"::"public"."enum_carousel_effect";`)
}
