import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_hero_rhythm" AS ENUM('standard', 'homeParity');
  ALTER TABLE "pages" ADD COLUMN "hero_rhythm" "enum_pages_hero_rhythm" DEFAULT 'standard';
  ALTER TABLE "_pages_v" ADD COLUMN "version_hero_rhythm" "enum_pages_hero_rhythm" DEFAULT 'standard';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "hero_rhythm";
  ALTER TABLE "_pages_v" DROP COLUMN "version_hero_rhythm";
  DROP TYPE "public"."enum_pages_hero_rhythm";`)
}
