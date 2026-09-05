import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #151 — a topic's optional section home.
 *
 * One nullable FK column on `categories`, indexed, `ON DELETE set null` so
 * deleting a Page empties the pointer instead of failing the delete. That
 * emptied pointer is not a loose end: `getTopicSectionPaths` then finds no
 * published home for the topic and its chips fall back to
 * `/articles?topic=<title>` — the same branch an unpublished home takes.
 *
 * ## No `categories_rels`, and therefore no RLS line — a corrected premise
 *
 * #151's body and the #136 spike (§7.1) both expected this migration to CREATE
 * `categories_rels`, Categories' first join table, and therefore to carry
 * `ALTER TABLE "categories_rels" ENABLE ROW LEVEL SECURITY;` in the same file.
 * It does not, and the premise was wrong about the mechanism rather than about
 * the rule.
 *
 * Payload's Postgres adapter only materialises a `_rels` join table for a
 * relationship that is `hasMany` or polymorphic (`relationTo` an array) — the
 * shapes a single column cannot express. `sectionPage` is single-valued and
 * points at exactly one collection, so the adapter stores it as
 * `categories.section_page_id`, exactly as it stores every other 1:1
 * relationship in this schema. Measured against a fresh database migrated to
 * this file: `\dt categories*` returns only `categories`, and the schema
 * snapshot beside this migration contains no `categories_rels`.
 *
 * `categories` itself pre-dates the #72 lockdown, whose `pg_tables` loop
 * enabled RLS on every table that existed then — confirmed here as
 * `pg_class.relrowsecurity = true` on a database migrated to this tip. Adding
 * a column to an RLS-enabled table does not weaken it: RLS is a table
 * property, not a column one. So there is no table left unprotected, and
 * `scripts/check-migrations-rls.mjs` — which keys on `CREATE TABLE` statements
 * — has nothing to flag.
 *
 * The rule stands unchanged for the next relationship that *is* `hasMany` or
 * polymorphic on this collection: that one creates `categories_rels` and must
 * carry the RLS line in its own migration. Categories has no drafts, so there
 * would still be no `_categories_v_rels` companion.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories" ADD COLUMN "section_page_id" integer;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_section_page_id_pages_id_fk" FOREIGN KEY ("section_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "categories_section_page_idx" ON "categories" USING btree ("section_page_id");`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories" DROP CONSTRAINT "categories_section_page_id_pages_id_fk";
  
  DROP INDEX "categories_section_page_idx";
  ALTER TABLE "categories" DROP COLUMN "section_page_id";`)
}
