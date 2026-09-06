import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M4 (#150) — `match_descendants` on `redirects`: one row covers a moved
 * section page and everything beneath it.
 *
 * **Why a column and not N rows.** Moving `/work` to `/experience` moves every
 * URL under it. Writing one redirect row per descendant is O(subtree) writes
 * inside the editor's publish transaction and walks toward a measured ceiling:
 * `getCmsRedirects` reads at most `REDIRECT_LIMIT = 500` rows, with a docblock
 * saying a site approaching it wants a keyed lookup instead of a full-list
 * read. A prefix row is O(1) per move whatever the subtree size (D4, Brandon
 * 2026-09-02). Chains still cannot form: `to` remains a document reference
 * resolved through the target's CURRENT path at read time, so `/work/x`
 * resolves to wherever that page lives now, in one hop.
 *
 * **No RLS follow-up is owed by this migration, and the #117 gate agrees.** The
 * #72 convention requires `ENABLE ROW LEVEL SECURITY` in the migration that
 * creates a **table**. This one creates none — it adds a single boolean column
 * to `redirects`, a table already swept by the `20260820_221032_rls_lockdown`
 * backfill — and RLS is a table-level property that a new column neither
 * carries nor can weaken.
 *
 * **`DEFAULT false`, so every existing row keeps its exact behaviour.** Payload
 * writes the default for new rows and the reader treats anything but `true` as
 * an exact-only row, so a row that predates this column and a row an editor
 * left unchecked are the same row they were before #150.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" ADD COLUMN "match_descendants" boolean DEFAULT false;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" DROP COLUMN "match_descendants";`)
}
