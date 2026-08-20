import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_hero_headline_variant" AS ENUM('line', 'typewriter');
  ALTER TABLE "pages" ADD COLUMN "hero_headline_variant" "enum_pages_hero_headline_variant" DEFAULT 'line';
  ALTER TABLE "pages" ADD COLUMN "hero_show_social_links" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_headline_variant" "enum_pages_hero_headline_variant" DEFAULT 'line';
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_show_social_links" boolean DEFAULT false;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "hero_headline_variant";
  ALTER TABLE "pages" DROP COLUMN "hero_show_social_links";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_headline_variant";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_show_social_links";
  DROP TYPE "public"."enum_pages_hero_headline_variant";`)
}
