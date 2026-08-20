import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_contact_form" ADD COLUMN "heading" varchar;
  ALTER TABLE "pages_blocks_contact_form" ADD COLUMN "intro" varchar;
  ALTER TABLE "pages_blocks_newsletter_signup" ADD COLUMN "heading" varchar;
  ALTER TABLE "pages_blocks_newsletter_signup" ADD COLUMN "intro" varchar;
  ALTER TABLE "pages_blocks_work_history_card" ADD COLUMN "heading" varchar;
  ALTER TABLE "pages_blocks_work_history_card" ADD COLUMN "intro" varchar;
  ALTER TABLE "_pages_v_blocks_contact_form" ADD COLUMN "heading" varchar;
  ALTER TABLE "_pages_v_blocks_contact_form" ADD COLUMN "intro" varchar;
  ALTER TABLE "_pages_v_blocks_newsletter_signup" ADD COLUMN "heading" varchar;
  ALTER TABLE "_pages_v_blocks_newsletter_signup" ADD COLUMN "intro" varchar;
  ALTER TABLE "_pages_v_blocks_work_history_card" ADD COLUMN "heading" varchar;
  ALTER TABLE "_pages_v_blocks_work_history_card" ADD COLUMN "intro" varchar;
  ALTER TABLE "posts_blocks_contact_form" ADD COLUMN "heading" varchar;
  ALTER TABLE "posts_blocks_contact_form" ADD COLUMN "intro" varchar;
  ALTER TABLE "posts_blocks_newsletter_signup" ADD COLUMN "heading" varchar;
  ALTER TABLE "posts_blocks_newsletter_signup" ADD COLUMN "intro" varchar;
  ALTER TABLE "posts_blocks_work_history_card" ADD COLUMN "heading" varchar;
  ALTER TABLE "posts_blocks_work_history_card" ADD COLUMN "intro" varchar;
  ALTER TABLE "_posts_v_blocks_contact_form" ADD COLUMN "heading" varchar;
  ALTER TABLE "_posts_v_blocks_contact_form" ADD COLUMN "intro" varchar;
  ALTER TABLE "_posts_v_blocks_newsletter_signup" ADD COLUMN "heading" varchar;
  ALTER TABLE "_posts_v_blocks_newsletter_signup" ADD COLUMN "intro" varchar;
  ALTER TABLE "_posts_v_blocks_work_history_card" ADD COLUMN "heading" varchar;
  ALTER TABLE "_posts_v_blocks_work_history_card" ADD COLUMN "intro" varchar;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_contact_form" DROP COLUMN "heading";
  ALTER TABLE "pages_blocks_contact_form" DROP COLUMN "intro";
  ALTER TABLE "pages_blocks_newsletter_signup" DROP COLUMN "heading";
  ALTER TABLE "pages_blocks_newsletter_signup" DROP COLUMN "intro";
  ALTER TABLE "pages_blocks_work_history_card" DROP COLUMN "heading";
  ALTER TABLE "pages_blocks_work_history_card" DROP COLUMN "intro";
  ALTER TABLE "_pages_v_blocks_contact_form" DROP COLUMN "heading";
  ALTER TABLE "_pages_v_blocks_contact_form" DROP COLUMN "intro";
  ALTER TABLE "_pages_v_blocks_newsletter_signup" DROP COLUMN "heading";
  ALTER TABLE "_pages_v_blocks_newsletter_signup" DROP COLUMN "intro";
  ALTER TABLE "_pages_v_blocks_work_history_card" DROP COLUMN "heading";
  ALTER TABLE "_pages_v_blocks_work_history_card" DROP COLUMN "intro";
  ALTER TABLE "posts_blocks_contact_form" DROP COLUMN "heading";
  ALTER TABLE "posts_blocks_contact_form" DROP COLUMN "intro";
  ALTER TABLE "posts_blocks_newsletter_signup" DROP COLUMN "heading";
  ALTER TABLE "posts_blocks_newsletter_signup" DROP COLUMN "intro";
  ALTER TABLE "posts_blocks_work_history_card" DROP COLUMN "heading";
  ALTER TABLE "posts_blocks_work_history_card" DROP COLUMN "intro";
  ALTER TABLE "_posts_v_blocks_contact_form" DROP COLUMN "heading";
  ALTER TABLE "_posts_v_blocks_contact_form" DROP COLUMN "intro";
  ALTER TABLE "_posts_v_blocks_newsletter_signup" DROP COLUMN "heading";
  ALTER TABLE "_posts_v_blocks_newsletter_signup" DROP COLUMN "intro";
  ALTER TABLE "_posts_v_blocks_work_history_card" DROP COLUMN "heading";
  ALTER TABLE "_posts_v_blocks_work_history_card" DROP COLUMN "intro";`)
}
