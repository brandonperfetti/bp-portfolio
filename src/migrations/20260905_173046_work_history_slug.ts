import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #137 — the `/work` section's schema half.
 *
 * Two additive changes, no new table:
 *
 * - `work_history.slug` (+ its `slug_lock` companion) with a **unique** index.
 *   The slug is an addressing key, not a route: Corvus composes `/work/<slug>`
 *   from it, and unique is what stops two rows making that citation ambiguous.
 *   Existing rows keep `slug` NULL — Postgres allows many NULLs under a unique
 *   index — and each derives one from `company` on its next save, so this
 *   needs no backfill and breaks nothing that has not been re-saved.
 * - `entry_id` / `show_description` on all four `work_history_card` block
 *   tables (pages + posts, each with its `_v` draft companion), giving the
 *   block its optional per-role mode. `ON DELETE set null` means deleting a
 *   role empties the relationship rather than failing the delete, and the
 *   block falls back to the full résumé card — which is why the component
 *   treats a null `entry` as the default rather than as an error.
 *
 * **No RLS line, deliberately.** The #72/#117 convention applies to a
 * migration that CREATES a table; this one only ALTERs tables the #72 backfill
 * already swept, and adds no `_rels` companion (the block's relationship is a
 * column on the block table, not a join table). `scripts/check-migrations-rls.mjs`
 * agrees: it keys on `CREATE TABLE` statements, of which this file has none.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_work_history_card" ADD COLUMN "entry_id" integer;
  ALTER TABLE "pages_blocks_work_history_card" ADD COLUMN "show_description" boolean DEFAULT true;
  ALTER TABLE "_pages_v_blocks_work_history_card" ADD COLUMN "entry_id" integer;
  ALTER TABLE "_pages_v_blocks_work_history_card" ADD COLUMN "show_description" boolean DEFAULT true;
  ALTER TABLE "posts_blocks_work_history_card" ADD COLUMN "entry_id" integer;
  ALTER TABLE "posts_blocks_work_history_card" ADD COLUMN "show_description" boolean DEFAULT true;
  ALTER TABLE "_posts_v_blocks_work_history_card" ADD COLUMN "entry_id" integer;
  ALTER TABLE "_posts_v_blocks_work_history_card" ADD COLUMN "show_description" boolean DEFAULT true;
  ALTER TABLE "work_history" ADD COLUMN "slug" varchar;
  ALTER TABLE "work_history" ADD COLUMN "slug_lock" boolean DEFAULT true;
  ALTER TABLE "pages_blocks_work_history_card" ADD CONSTRAINT "pages_blocks_work_history_card_entry_id_work_history_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."work_history"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_work_history_card" ADD CONSTRAINT "_pages_v_blocks_work_history_card_entry_id_work_history_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."work_history"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_work_history_card" ADD CONSTRAINT "posts_blocks_work_history_card_entry_id_work_history_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."work_history"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_work_history_card" ADD CONSTRAINT "_posts_v_blocks_work_history_card_entry_id_work_history_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."work_history"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_work_history_card_entry_idx" ON "pages_blocks_work_history_card" USING btree ("entry_id");
  CREATE INDEX "_pages_v_blocks_work_history_card_entry_idx" ON "_pages_v_blocks_work_history_card" USING btree ("entry_id");
  CREATE INDEX "posts_blocks_work_history_card_entry_idx" ON "posts_blocks_work_history_card" USING btree ("entry_id");
  CREATE INDEX "_posts_v_blocks_work_history_card_entry_idx" ON "_posts_v_blocks_work_history_card" USING btree ("entry_id");
  CREATE UNIQUE INDEX "work_history_slug_idx" ON "work_history" USING btree ("slug");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_work_history_card" DROP CONSTRAINT "pages_blocks_work_history_card_entry_id_work_history_id_fk";
  
  ALTER TABLE "_pages_v_blocks_work_history_card" DROP CONSTRAINT "_pages_v_blocks_work_history_card_entry_id_work_history_id_fk";
  
  ALTER TABLE "posts_blocks_work_history_card" DROP CONSTRAINT "posts_blocks_work_history_card_entry_id_work_history_id_fk";
  
  ALTER TABLE "_posts_v_blocks_work_history_card" DROP CONSTRAINT "_posts_v_blocks_work_history_card_entry_id_work_history_id_fk";
  
  DROP INDEX "pages_blocks_work_history_card_entry_idx";
  DROP INDEX "_pages_v_blocks_work_history_card_entry_idx";
  DROP INDEX "posts_blocks_work_history_card_entry_idx";
  DROP INDEX "_posts_v_blocks_work_history_card_entry_idx";
  DROP INDEX "work_history_slug_idx";
  ALTER TABLE "pages_blocks_work_history_card" DROP COLUMN "entry_id";
  ALTER TABLE "pages_blocks_work_history_card" DROP COLUMN "show_description";
  ALTER TABLE "_pages_v_blocks_work_history_card" DROP COLUMN "entry_id";
  ALTER TABLE "_pages_v_blocks_work_history_card" DROP COLUMN "show_description";
  ALTER TABLE "posts_blocks_work_history_card" DROP COLUMN "entry_id";
  ALTER TABLE "posts_blocks_work_history_card" DROP COLUMN "show_description";
  ALTER TABLE "_posts_v_blocks_work_history_card" DROP COLUMN "entry_id";
  ALTER TABLE "_posts_v_blocks_work_history_card" DROP COLUMN "show_description";
  ALTER TABLE "work_history" DROP COLUMN "slug";
  ALTER TABLE "work_history" DROP COLUMN "slug_lock";`)
}
