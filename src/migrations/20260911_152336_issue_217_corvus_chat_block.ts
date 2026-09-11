import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #217 phase 1 — the `corvusChat` block's storage.
 *
 * ## A block IS a schema change in this repo
 *
 * Worth stating, because #217 was sized on the opposite assumption ("blocks
 * are JSON in the layout field, so no migration is expected"). They are not:
 * `@payloadcms/db-postgres` materialises every block as its own relational
 * table, per layout-capable surface, per drafts shadow. Registering one block
 * in `src/blocks/library.ts` reaches **two** surfaces (Pages `layout` and the
 * Posts below-article `layout`), both drafts-enabled, so Payload emits **four**
 * tables plus one enum type — exactly the shape
 * `20260905_221622_m5_post_rollup_block.ts` recorded for the last new block.
 *
 * Adding the block to `COLUMN_CONTENT_BLOCKS` as well adds **no** further
 * tables: Payload stores a block once per collection and keys the nesting in
 * `_path`. `[measured, 2026-09-11]` Established the way
 * `20260905_221622_m5_post_rollup_block.ts` established it — by generating
 * **both ways** and comparing, not by inspecting one run. With the column
 * registration removed, `pnpm migrate:create` emits the same **64** SQL
 * statements, statement for statement, and the same snapshot table count
 * (**198**); the only textual differences were Prettier's, since the committed
 * file has been through lint-staged and a freshly generated one has not.
 *
 * ## RLS on every one of them (#72 convention)
 *
 * All four tables are new, so all four owe
 * `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` **in this file** —
 * `docs/PAYLOAD.md` §"New-table RLS convention (#72)", gated by
 * `scripts/check-migrations-rls.mjs`, which keys on `CREATE TABLE` statements
 * per direction. The `down` direction drops tables and creates none, so it owes
 * nothing. No `_rels` companions appear: the block holds one enum and two text
 * columns and no relationships at all.
 *
 * Data-loss risk on `down`: the four `DROP TABLE … CASCADE` statements discard
 * any stored `corvusChat` block along with its draft versions. That is the same
 * shape every block migration in this repo carries, and it is recoverable only
 * from a backup.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_corvus_chat_variant" AS ENUM('compact', 'sidebar', 'full');
  CREATE TABLE "pages_blocks_corvus_chat" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "enum_corvus_chat_variant" DEFAULT 'compact',
  	"heading" varchar,
  	"starter_prompt" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_corvus_chat" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "enum_corvus_chat_variant" DEFAULT 'compact',
  	"heading" varchar,
  	"starter_prompt" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_corvus_chat" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"variant" "enum_corvus_chat_variant" DEFAULT 'compact',
  	"heading" varchar,
  	"starter_prompt" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_corvus_chat" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"variant" "enum_corvus_chat_variant" DEFAULT 'compact',
  	"heading" varchar,
  	"starter_prompt" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_corvus_chat" ADD CONSTRAINT "pages_blocks_corvus_chat_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_corvus_chat" ADD CONSTRAINT "_pages_v_blocks_corvus_chat_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_corvus_chat" ADD CONSTRAINT "posts_blocks_corvus_chat_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_corvus_chat" ADD CONSTRAINT "_posts_v_blocks_corvus_chat_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_corvus_chat_order_idx" ON "pages_blocks_corvus_chat" USING btree ("_order");
  CREATE INDEX "pages_blocks_corvus_chat_parent_id_idx" ON "pages_blocks_corvus_chat" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_corvus_chat_path_idx" ON "pages_blocks_corvus_chat" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_corvus_chat_order_idx" ON "_pages_v_blocks_corvus_chat" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_corvus_chat_parent_id_idx" ON "_pages_v_blocks_corvus_chat" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_corvus_chat_path_idx" ON "_pages_v_blocks_corvus_chat" USING btree ("_path");
  CREATE INDEX "posts_blocks_corvus_chat_order_idx" ON "posts_blocks_corvus_chat" USING btree ("_order");
  CREATE INDEX "posts_blocks_corvus_chat_parent_id_idx" ON "posts_blocks_corvus_chat" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_corvus_chat_path_idx" ON "posts_blocks_corvus_chat" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_corvus_chat_order_idx" ON "_posts_v_blocks_corvus_chat" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_corvus_chat_parent_id_idx" ON "_posts_v_blocks_corvus_chat" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_corvus_chat_path_idx" ON "_posts_v_blocks_corvus_chat" USING btree ("_path");
  ALTER TABLE "pages_blocks_corvus_chat" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_corvus_chat" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_corvus_chat" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_corvus_chat" ENABLE ROW LEVEL SECURITY;`)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_corvus_chat" CASCADE;
  DROP TABLE "_pages_v_blocks_corvus_chat" CASCADE;
  DROP TABLE "posts_blocks_corvus_chat" CASCADE;
  DROP TABLE "_posts_v_blocks_corvus_chat" CASCADE;
  DROP TYPE "public"."enum_corvus_chat_variant";`)
}
