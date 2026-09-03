import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M2 (#153) — post placement: `parent` + computed `path` on `posts`/`_posts_v`.
 *
 * **No backfill, deliberately.** M1 backfilled every page's `path` to its
 * `slug` because a page's URL genuinely *is* `/<slug>`. A post's is
 * `/articles/<slug>`, so the equivalent backfill would be a lie: it would give
 * every article a `path` and `publicPathFor` would then read the whole corpus
 * as placed and serve it at `/<slug>`. `path` stays NULL until an editor picks
 * a parent page, which is what makes "every existing post URL is byte-identical
 * after the migration" true by construction rather than by inspection.
 * Postgres unique indexes admit unlimited NULLs, so the whole corpus sharing
 * "no path" costs nothing.
 *
 * **No RLS follow-up is owed by this migration.** The #72 convention and the
 * #117 gate require `ENABLE ROW LEVEL SECURITY` in the migration that creates a
 * **table**. This one creates none: it adds columns, a foreign key and indexes
 * to `posts` and `_posts_v`, both already swept by the
 * `20260820_221032_rls_lockdown` backfill, and RLS is a table-level property a
 * new column inherits. `parent` is a `hasMany: false` relationship, so Payload
 * materialises it as a plain `parent_id` column rather than a `posts_rels` row
 * — no new rels table either.
 *
 * `_posts_v` takes `version_parent_id` / `version_path`: `parent_id` on the
 * versions table is already Payload's own version→document pointer, the same
 * collision M1 hit on `_pages_v`.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "parent_id" integer;
  ALTER TABLE "posts" ADD COLUMN "path" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_parent_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_path" varchar;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_parent_idx" ON "posts" USING btree ("parent_id");
  CREATE UNIQUE INDEX "posts_path_idx" ON "posts" USING btree ("path");
  CREATE INDEX "_posts_v_version_version_parent_idx" ON "_posts_v" USING btree ("version_parent_id");
  CREATE INDEX "_posts_v_version_version_path_idx" ON "_posts_v" USING btree ("version_path");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP CONSTRAINT "posts_parent_id_pages_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_parent_id_pages_id_fk";
  
  DROP INDEX "posts_parent_idx";
  DROP INDEX "posts_path_idx";
  DROP INDEX "_posts_v_version_version_parent_idx";
  DROP INDEX "_posts_v_version_version_path_idx";
  ALTER TABLE "posts" DROP COLUMN "parent_id";
  ALTER TABLE "posts" DROP COLUMN "path";
  ALTER TABLE "_posts_v" DROP COLUMN "version_parent_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_path";`)
}
