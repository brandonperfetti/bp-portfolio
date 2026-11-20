import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cookie_consent" ALTER COLUMN "categories_analytics_subtitle" SET DEFAULT 'Google Analytics 4. It loads only while Analytics is allowed; while it is not, nothing is requested from or sent to Google. A change takes effect when you save it. A cookieless Vercel Analytics baseline runs regardless of this choice.';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cookie_consent" ALTER COLUMN "categories_analytics_subtitle" SET DEFAULT 'Google Analytics 4 via Consent Mode v2. Before you grant it, GA sets no cookies; Google still receives an anonymous, cookieless signal. A cookieless Vercel Analytics baseline runs regardless of this choice.';`)
}
