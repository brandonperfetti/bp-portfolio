import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #201 — `to_collection_at_capture` / `to_id_at_capture` on `redirects`: WHICH
 * document `to_path_at_capture` was the path of.
 *
 * **Why a path was not enough.** #178 froze the target's path onto the row so a
 * URL captured beneath a prefix row could be looked up again. A path is only an
 * identity at a point in time: `from` is `unique`, so when a later document
 * occupies the captured path and vacates it in turn, `createPathRedirect`
 * REPOINTS this row at that document while the snapshot still names the first
 * one's era — and every URL from that era is then rewritten into a subtree it
 * was never about. Silently, as a 301 to a live page, which is the most
 * expensive failure this system has: a 404 is visible and gets reported, a
 * plausible wrong page is not. These two columns say which document the era
 * belonged to, and `resolveRedirect` anchors the subtree rewrite to it.
 *
 * **Two inert varchars and not a relationship, deliberately.** A relationship
 * would be the obvious modelling of "which document", and it is the wrong one
 * here: Payload cleans a relationship up when its target is deleted, which
 * would collapse "the captured document is gone" into "there was never a
 * capture" — and those two states have opposite answers. The first must 404
 * rather than hand the subtree to whoever holds the path now; the second is a
 * pre-#201 row and must behave exactly as it does today. Text columns survive
 * the deletion, so the reader can still tell them apart. Nothing here resolves
 * to a live document at write time either — the whole point is to reconstruct a
 * URL that is no longer served.
 *
 * **Nullable, no default, no backfill.** Same story as #178's column, one step
 * on: a row written before this migration records a capture whose document
 * cannot be recovered from anything still in the database, and a WRONG anchor
 * is worse than none — it would confidently send a whole subtree to a document
 * that never held the path. An absent identity reads as "unanchored", which is
 * the pre-#201 behaviour byte for byte.
 *
 * **No RLS follow-up is owed, and the #117 gate agrees.** The #72 convention
 * attaches to a migration that creates a **table**. This one creates none — it
 * adds two varchar columns to `redirects`, a table already swept by the
 * `20260820_221032_rls_lockdown` backfill — and RLS is a table-level property
 * that a new column neither carries nor can weaken.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" ADD COLUMN "to_collection_at_capture" varchar;
  ALTER TABLE "redirects" ADD COLUMN "to_id_at_capture" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" DROP COLUMN "to_collection_at_capture";
  ALTER TABLE "redirects" DROP COLUMN "to_id_at_capture";`)
}
