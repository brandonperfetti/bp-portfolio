import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * M5 (#152) — the `postRollup` block's storage.
 *
 * Registering one block in `src/blocks/library.ts` reaches **two** layout-
 * capable surfaces (Pages `layout` and the Posts below-article `layout`), and
 * both are drafts-enabled, so Payload emits **four** tables, not one:
 * `pages_blocks_post_rollup`, `_pages_v_blocks_post_rollup`,
 * `posts_blocks_post_rollup` and `_posts_v_blocks_post_rollup`.
 *
 * Adding the block to `COLUMN_CONTENT_BLOCKS` as well (it is offered inside a
 * `container` → `column`, like every other leaf) adds **no** further tables:
 * Payload stores a block once per collection and keys the nesting in `_path`.
 * Verified by regenerating this migration after that registration landed — the
 * emitted SQL was byte-identical.
 *
 * ## RLS on every one of them (#72 convention)
 *
 * All four are new, all four therefore owe
 * `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` **in this file** —
 * `docs/PAYLOAD.md` §"New-table RLS convention (#72)", gated by
 * `scripts/check-migrations-rls.mjs`, which keys on `CREATE TABLE` statements
 * per direction. The `down` direction drops tables and creates none, so it owes
 * nothing. Default-deny with no policies is the whole point: the app reads
 * through the Payload Local API on the owning role, never through an anon
 * Postgres session. Measured on a database migrated to this file:
 * `pg_class.relrowsecurity` is true for all four.
 *
 * RLS is the second of two locks, not the only one. `20260905_190000_issue_159_table_acls`
 * revoked the `anon`/`authenticated` table grants and the `TABLES` default
 * privilege, so a table created *after* it inherits no grant to begin with —
 * these four are the first to be born that way. The `ENABLE` lines still belong
 * here: the ACL migration governs who may reach a table at all, RLS governs
 * which rows they would see if a grant were ever restored, and the #72
 * convention is written per-table for exactly that reason.
 *
 * No `_rels` companions appear here, and that is the same mechanism
 * `20260905_173125_categories_section_page.ts` records: `category` and `page`
 * are both `hasMany: false` relationships to a single collection, so the
 * adapter stores each as an indexed FK column (`category_id`, `page_id`) rather
 * than materialising a join table. Both are `ON DELETE set null`, so deleting a
 * topic or a section page empties the block's pointer instead of failing the
 * delete — and the block then renders nothing, which is its ordinary
 * empty-state branch rather than a new failure mode.
 *
 * ## Three enums, all explicitly named
 *
 * `enum_post_rollup_source`, `enum_post_rollup_sort` and
 * `enum_post_rollup_layout` are the names the block config pins with
 * `enumName`. Left to Payload they would be derived from the block's full
 * nesting path (`pages.layout` → `container` → `column` → here), which crowds
 * Postgres's 63-character identifier limit and would change the moment an
 * editor moved the block — the reason `ArticlesArchive/config.ts` gives, and
 * the reason it matters more here, with three selects instead of one.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_post_rollup_source" AS ENUM('by-category', 'by-placement');
  CREATE TYPE "public"."enum_post_rollup_sort" AS ENUM('newest', 'oldest', 'title');
  CREATE TYPE "public"."enum_post_rollup_layout" AS ENUM('grid', 'stacked', 'compact-list');
  CREATE TABLE "pages_blocks_post_rollup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"source" "enum_post_rollup_source" DEFAULT 'by-category',
  	"category_id" integer,
  	"page_id" integer,
  	"sort" "enum_post_rollup_sort" DEFAULT 'newest',
  	"limit" numeric DEFAULT 6,
  	"layout" "enum_post_rollup_layout" DEFAULT 'grid',
  	"reveal_on_scroll" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_post_rollup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"source" "enum_post_rollup_source" DEFAULT 'by-category',
  	"category_id" integer,
  	"page_id" integer,
  	"sort" "enum_post_rollup_sort" DEFAULT 'newest',
  	"limit" numeric DEFAULT 6,
  	"layout" "enum_post_rollup_layout" DEFAULT 'grid',
  	"reveal_on_scroll" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_post_rollup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"source" "enum_post_rollup_source" DEFAULT 'by-category',
  	"category_id" integer,
  	"page_id" integer,
  	"sort" "enum_post_rollup_sort" DEFAULT 'newest',
  	"limit" numeric DEFAULT 6,
  	"layout" "enum_post_rollup_layout" DEFAULT 'grid',
  	"reveal_on_scroll" boolean DEFAULT false,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_post_rollup" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"source" "enum_post_rollup_source" DEFAULT 'by-category',
  	"category_id" integer,
  	"page_id" integer,
  	"sort" "enum_post_rollup_sort" DEFAULT 'newest',
  	"limit" numeric DEFAULT 6,
  	"layout" "enum_post_rollup_layout" DEFAULT 'grid',
  	"reveal_on_scroll" boolean DEFAULT false,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_post_rollup" ADD CONSTRAINT "pages_blocks_post_rollup_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_post_rollup" ADD CONSTRAINT "pages_blocks_post_rollup_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_post_rollup" ADD CONSTRAINT "pages_blocks_post_rollup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_post_rollup" ADD CONSTRAINT "_pages_v_blocks_post_rollup_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_post_rollup" ADD CONSTRAINT "_pages_v_blocks_post_rollup_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_post_rollup" ADD CONSTRAINT "_pages_v_blocks_post_rollup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_post_rollup" ADD CONSTRAINT "posts_blocks_post_rollup_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_post_rollup" ADD CONSTRAINT "posts_blocks_post_rollup_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_post_rollup" ADD CONSTRAINT "posts_blocks_post_rollup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_post_rollup" ADD CONSTRAINT "_posts_v_blocks_post_rollup_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_post_rollup" ADD CONSTRAINT "_posts_v_blocks_post_rollup_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_post_rollup" ADD CONSTRAINT "_posts_v_blocks_post_rollup_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_post_rollup_order_idx" ON "pages_blocks_post_rollup" USING btree ("_order");
  CREATE INDEX "pages_blocks_post_rollup_parent_id_idx" ON "pages_blocks_post_rollup" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_post_rollup_path_idx" ON "pages_blocks_post_rollup" USING btree ("_path");
  CREATE INDEX "pages_blocks_post_rollup_category_idx" ON "pages_blocks_post_rollup" USING btree ("category_id");
  CREATE INDEX "pages_blocks_post_rollup_page_idx" ON "pages_blocks_post_rollup" USING btree ("page_id");
  CREATE INDEX "_pages_v_blocks_post_rollup_order_idx" ON "_pages_v_blocks_post_rollup" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_post_rollup_parent_id_idx" ON "_pages_v_blocks_post_rollup" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_post_rollup_path_idx" ON "_pages_v_blocks_post_rollup" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_post_rollup_category_idx" ON "_pages_v_blocks_post_rollup" USING btree ("category_id");
  CREATE INDEX "_pages_v_blocks_post_rollup_page_idx" ON "_pages_v_blocks_post_rollup" USING btree ("page_id");
  CREATE INDEX "posts_blocks_post_rollup_order_idx" ON "posts_blocks_post_rollup" USING btree ("_order");
  CREATE INDEX "posts_blocks_post_rollup_parent_id_idx" ON "posts_blocks_post_rollup" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_post_rollup_path_idx" ON "posts_blocks_post_rollup" USING btree ("_path");
  CREATE INDEX "posts_blocks_post_rollup_category_idx" ON "posts_blocks_post_rollup" USING btree ("category_id");
  CREATE INDEX "posts_blocks_post_rollup_page_idx" ON "posts_blocks_post_rollup" USING btree ("page_id");
  CREATE INDEX "_posts_v_blocks_post_rollup_order_idx" ON "_posts_v_blocks_post_rollup" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_post_rollup_parent_id_idx" ON "_posts_v_blocks_post_rollup" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_post_rollup_path_idx" ON "_posts_v_blocks_post_rollup" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_post_rollup_category_idx" ON "_posts_v_blocks_post_rollup" USING btree ("category_id");
  CREATE INDEX "_posts_v_blocks_post_rollup_page_idx" ON "_posts_v_blocks_post_rollup" USING btree ("page_id");
  ALTER TABLE "pages_blocks_post_rollup" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_post_rollup" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_post_rollup" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_post_rollup" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_post_rollup" CASCADE;
  DROP TABLE "_pages_v_blocks_post_rollup" CASCADE;
  DROP TABLE "posts_blocks_post_rollup" CASCADE;
  DROP TABLE "_posts_v_blocks_post_rollup" CASCADE;
  DROP TYPE "public"."enum_post_rollup_source";
  DROP TYPE "public"."enum_post_rollup_sort";
  DROP TYPE "public"."enum_post_rollup_layout";`)
}
