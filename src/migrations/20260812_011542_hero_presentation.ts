import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_hero_presentation" AS ENUM('fullBleed', 'card');
  ALTER TABLE "pages" ADD COLUMN "hero_presentation" "enum_pages_hero_presentation" DEFAULT 'fullBleed';
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_presentation" "enum_pages_hero_presentation" DEFAULT 'fullBleed';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "hero_presentation";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_presentation";
  DROP TYPE "public"."enum_pages_hero_presentation";`)
}
