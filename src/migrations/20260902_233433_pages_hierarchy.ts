import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M1 for #148 — Pages hierarchy: the `parent` relation and the computed `path`
 * column, on both `pages` and its versions table `_pages_v`.
 *
 * **No RLS follow-up is owed by this migration, and here is why.** The #72
 * convention (enforced by `scripts/check-migrations-rls.mjs`, #117) requires
 * `ENABLE ROW LEVEL SECURITY` in the same migration that creates a *table*.
 * This migration creates none: it only adds columns, constraints and indexes
 * to `pages` and `_pages_v`, both of which the `20260820_221032_rls_lockdown`
 * backfill already swept. Adding a column to an RLS-protected table inherits
 * that protection — RLS is a table-level property, not a column-level one — so
 * there is nothing to enable.
 *
 * **The backfill runs between the columns and the unique index, deliberately.**
 * `path = slug` for every existing row, which is exactly what today's flat
 * `/[slug]` route already serves, so **no existing URL moves**. Ordering the
 * backfill before `CREATE UNIQUE INDEX` means a database that somehow holds two
 * pages with the same slug fails at index creation — loudly, inside the
 * transaction, naming the duplicate — instead of leaving the column silently
 * half-populated behind an index that permitted it because unique indexes admit
 * unlimited NULLs.
 *
 * `_pages_v.version_path` is backfilled from `version_slug` for the same reason
 * and carries a NON-unique index, matching what Payload generates: many
 * versions of one document legitimately share a path.
 *
 * `parent_id` is left NULL everywhere. Every existing page is top-level, which
 * is what makes `path = slug` the correct backfill.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "parent_id" integer;
  ALTER TABLE "pages" ADD COLUMN "path" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_parent_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN "version_path" varchar;`)

  // Backfill: every page is top-level today, so its path is its slug and its
  // public URL is byte-for-byte unchanged.
  await db.execute(sql`
   UPDATE "pages" SET "path" = "slug" WHERE "slug" IS NOT NULL AND "path" IS NULL;
  UPDATE "_pages_v" SET "version_path" = "version_slug" WHERE "version_slug" IS NOT NULL AND "version_path" IS NULL;`)

  await db.execute(sql`
   ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");
  CREATE UNIQUE INDEX "pages_path_idx" ON "pages" USING btree ("path");
  CREATE INDEX "_pages_v_version_version_parent_idx" ON "_pages_v" USING btree ("version_parent_id");
  CREATE INDEX "_pages_v_version_version_path_idx" ON "_pages_v" USING btree ("version_path");`)
}

/**
 * Drops the hierarchy columns, their constraints and their indexes.
 *
 * @remarks Reversing this migration is lossy for a site that has actually
 * placed pages: the parent chain is discarded and every page reverts to being
 * served at `/<slug>` by whatever route is deployed. That is the correct
 * behaviour for a rollback — the pre-#148 code has no `path` to read — but it
 * means a rollback after real placement needs redirect rows for the moved URLs,
 * which the #120 machinery writes on the way *in*, not on the way out.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP CONSTRAINT "pages_parent_id_pages_id_fk";

  ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_parent_id_pages_id_fk";

  DROP INDEX "pages_parent_idx";
  DROP INDEX "pages_path_idx";
  DROP INDEX "_pages_v_version_version_parent_idx";
  DROP INDEX "_pages_v_version_version_path_idx";
  ALTER TABLE "pages" DROP COLUMN "parent_id";
  ALTER TABLE "pages" DROP COLUMN "path";
  ALTER TABLE "_pages_v" DROP COLUMN "version_parent_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_path";`)
}
