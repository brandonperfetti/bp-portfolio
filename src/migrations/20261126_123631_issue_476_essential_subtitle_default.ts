import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cookie_consent" ALTER COLUMN "categories_essential_subtitle" SET DEFAULT 'Always on, whatever you choose here. Clerk, for signing in: its script loads on every page and sets a couple of cookies even if you never sign in. Cloudflare Turnstile, a bot check that loads only once you start filling in a form. Sentry, for error reports: it gets the error and the page it happened on, but no name, email or account, and its only id is a random one that lasts as long as your browser tab.';`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cookie_consent" ALTER COLUMN "categories_essential_subtitle" SET DEFAULT 'Sign-in sessions (Clerk) and bot protection (Cloudflare Turnstile). Required for the site to work — always on.';`)
}
