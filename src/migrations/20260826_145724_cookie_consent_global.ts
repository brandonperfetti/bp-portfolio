import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cookie_consent" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"banner_title" varchar,
  	"banner_message" varchar DEFAULT 'This site uses a cookieless analytics baseline always, and Google Analytics only with your consent.' NOT NULL,
  	"banner_cookie_details_label" varchar DEFAULT 'cookie details',
  	"banner_accept_all_label" varchar DEFAULT 'Accept all',
  	"banner_reject_non_essential_label" varchar DEFAULT 'Reject non-essential',
  	"banner_customize_label" varchar DEFAULT 'Customize',
  	"banner_privacy_policy_text" varchar,
  	"banner_privacy_policy_page_id" integer,
  	"dialog_title" varchar DEFAULT 'Cookie preferences',
  	"dialog_description" varchar DEFAULT 'Choose which cookies this site may use. Essential cookies are always on; analytics load only with your consent where consent is required.',
  	"dialog_reject_label" varchar DEFAULT 'Reject non-essential',
  	"dialog_save_label" varchar DEFAULT 'Save choices',
  	"dialog_accept_all_label" varchar DEFAULT 'Accept all',
  	"dialog_status_text_template" varchar DEFAULT 'Status: {{status}} on {{date}}',
  	"dialog_declined_text" varchar DEFAULT 'Declined',
  	"dialog_consented_text" varchar DEFAULT 'Consented',
  	"dialog_cancel_button_label" varchar DEFAULT 'Cancel',
  	"features_disable_automatic_blocking" boolean DEFAULT false,
  	"features_show_manage_button" boolean DEFAULT true,
  	"features_show_persistent_cookie_button" boolean DEFAULT true,
  	"categories_always_on_label" varchar DEFAULT 'Always on',
  	"categories_essential_title" varchar DEFAULT 'Strictly necessary',
  	"categories_essential_subtitle" varchar DEFAULT 'Sign-in sessions (Clerk) and bot protection (Cloudflare Turnstile). Required for the site to work — always on.',
  	"categories_analytics_enabled" boolean DEFAULT true,
  	"categories_analytics_title" varchar DEFAULT 'Analytics (measurement)',
  	"categories_analytics_subtitle" varchar DEFAULT 'Google Analytics 4 via Consent Mode v2. Before you grant it, GA sets no cookies; Google still receives an anonymous, cookieless signal. A cookieless Vercel Analytics baseline runs regardless of this choice.',
  	"categories_social_enabled" boolean DEFAULT false,
  	"categories_social_title" varchar DEFAULT 'Social media',
  	"categories_social_subtitle" varchar DEFAULT 'Embedded social content and sharing widgets. No social cookies are set today; enabling this only records the consent category.',
  	"categories_advertising_enabled" boolean DEFAULT false,
  	"categories_advertising_title" varchar DEFAULT 'Advertising',
  	"categories_advertising_subtitle" varchar DEFAULT 'Advertising and marketing cookies. No ad pixels are wired today; enabling this only records the consent category.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "cookie_consent" ADD CONSTRAINT "cookie_consent_banner_privacy_policy_page_id_pages_id_fk" FOREIGN KEY ("banner_privacy_policy_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "cookie_consent_banner_banner_privacy_policy_page_idx" ON "cookie_consent" USING btree ("banner_privacy_policy_page_id");`)

  // Default-deny RLS on the new table, matching the #72 lockdown
  // (20260820_221032_rls_lockdown). That migration's `pg_tables` loop only
  // covered tables that existed then; Postgres has no "enable RLS on future
  // tables" default, so a table created by a later migration is RLS-disabled
  // unless enabled here — which would otherwise reintroduce a Supabase
  // `rls_disabled_in_public` advisor error. The owning `DATABASE_URI` role
  // bypasses RLS (no `FORCE ROW LEVEL SECURITY` anywhere), so Payload is
  // unaffected; this only closes the anon/authenticated Data-API surface (whose
  // grants the lockdown already future-proofed via ALTER DEFAULT PRIVILEGES).
  await db.execute(sql`
    ALTER TABLE "cookie_consent" ENABLE ROW LEVEL SECURITY;
  `)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cookie_consent" CASCADE;`)
}
