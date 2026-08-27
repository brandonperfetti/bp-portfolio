import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cookie_consent" ADD COLUMN "banner_manage_cookies_label" varchar DEFAULT 'Manage Cookies';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cookie_consent" DROP COLUMN "banner_manage_cookies_label";`)
}
