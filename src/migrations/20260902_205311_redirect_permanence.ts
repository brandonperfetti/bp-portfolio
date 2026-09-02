import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_redirects_type" AS ENUM('301', '302');
  ALTER TABLE "redirects" ADD COLUMN "type" "enum_redirects_type" DEFAULT '301' NOT NULL;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" DROP COLUMN "type";
  DROP TYPE "public"."enum_redirects_type";`)
}
