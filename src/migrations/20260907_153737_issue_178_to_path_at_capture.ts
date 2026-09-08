import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #178 — `to_path_at_capture` on `redirects`: the path the target was being
 * served at when the row was written.
 *
 * **Why a snapshot at all, when `to` is a live reference.** That reference is
 * what makes chains impossible for the URL a row is keyed at — `/a` resolves
 * to wherever the document lives now, in one hop (#120). It is also exactly
 * what breaks a URL captured BENEATH a `match_descendants` row: the descendant
 * has its own row, and that row's `from` is the path the descendant had when
 * IT moved, which spells the ancestor as the ancestor was spelled then. Rewrite
 * the request onto the ancestor's current path and you produce a URL no row is
 * keyed at, so the descendant's row is never consulted and a request every hop
 * of which has a row still 404s. [measured, unit probe on the pre-fix tree: the
 * three-row `/lab-parent/lab-child/lab-grandchild` repro answered
 * `/lab-base/lab-kid/lab-grandchild`, a path nothing serves.] Storing the
 * capture-time spelling gives `resolveRedirect` a key it can look up again.
 *
 * **Nullable, with no default and no backfill, and that is the whole story for
 * old rows.** A row written before this column records a move that has already
 * happened; the path its target was served at that day is not recoverable from
 * anything still in the database. The reader treats an absent snapshot as
 * "rewrite onto the current path", which is the pre-#178 behaviour byte for
 * byte — so a pre-#178 row still survives exactly one move of its target, and
 * nothing regresses.
 *
 * **No RLS follow-up is owed, and the #117 gate agrees.** The #72 convention
 * attaches to a migration that creates a **table**. This one creates none — it
 * adds a single varchar column to `redirects`, a table already swept by the
 * `20260820_221032_rls_lockdown` backfill — and RLS is a table-level property
 * that a new column neither carries nor can weaken.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" ADD COLUMN "to_path_at_capture" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" DROP COLUMN "to_path_at_capture";`)
}
