import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Issue #82 — the `corvus_embeddings` table: pgvector storage backing Corvus's
 * retrieval grounding, plus its HNSW/btree indexes and the #72 RLS follow-up.
 *
 * @remarks
 * This is a hand-written migration in the `20260820_221032_rls_lockdown.ts`
 * style — no drizzle `.json` snapshot. `corvus_embeddings` is deliberately NOT
 * a Payload collection: it is a derived, rebuildable index over published
 * content, written by hooks and a backfill script rather than edited in the
 * admin UI. Keeping it out of `src/payload.config.ts` means it never appears in
 * a generated schema snapshot, so CI's migration-drift gate
 * (`pnpm payload migrate:create --skip-empty`) stays quiet, and there are no
 * paired `_v` / `_rels` companion tables to lock down.
 *
 * Column choices worth stating, because two of them are not obvious:
 *
 * - `visibility` mirrors Posts' `access.visibility` at embed time. Retrieval
 *   MUST filter on it: `src/access/canAccess.ts` is described in-tree as "THE
 *   single authoritative check — RSCs/routes must call it before including
 *   gated bodies in any payload sent to the client", and an unfiltered vector
 *   query over post bodies would hand gated article text to anonymous visitors
 *   through the chat stream. The column exists so that filter is possible
 *   without a join back into Payload.
 * - `content_hash` (sha256 of `content`) is what makes hook-driven refresh
 *   cheap enough to run on every save: a metadata-only edit re-embeds nothing.
 * - `model` records which embedding model produced the row, so an embedding
 *   model change is detectable instead of silently mixing vector spaces.
 * - `published_at` lets retrieval exclude scheduled-future posts, matching how
 *   the rest of the site already treats them (`isFuturePublicationDate`).
 *
 * `UNIQUE (collection, doc_id, chunk_index)` is the upsert key the refresh
 * hooks target.
 *
 * Dimension pin — `vector(1536)`: decision D6(a). `text-embedding-3-small`'s
 * native width, and the write path always passes an explicit `dimensions`
 * provider option, so `text-embedding-3-large` can be swapped in later with no
 * schema change. 1536 also sits inside pgvector's 2,000-dimension ceiling for
 * HNSW over the `vector` type; `-3-large`'s native 3072 would not, and would
 * force `halfvec`.
 *
 * Index choice — HNSW, not IVFFlat: this migration runs against an EMPTY table
 * (migrate, then backfill), and IVFFlat's `lists` parameter is only meaningful
 * once rows exist. HNSW builds correctly on empty and stays correct as rows
 * arrive, and has better query performance. At this corpus size (~600–800
 * chunks) its extra build time and memory are immaterial. `vector_cosine_ops`
 * because OpenAI embeddings are normalized and cosine is the right metric.
 * The btree on `(collection, doc_id)` serves the hooks' per-document
 * delete/refresh path, which is a plain equality lookup, not a vector search.
 *
 * `CREATE EXTENSION IF NOT EXISTS vector;` is intentionally UNQUALIFIED, and
 * the column type is intentionally the bare `vector(1536)`:
 *
 * - On the bare `pgvector/pgvector:pg16` image CI's `e2e` job runs against, and
 *   on local Postgres with pgvector installed, this is a real create into
 *   `public` (the first schema on `search_path`).
 * - On the bp-portfolio Supabase project this is ALSO a real create: `vector`
 *   is available there but NOT installed (`pg_available_extensions` shows 0.8.2
 *   available with a null `installed_version`, measured 2026-08-28). The
 *   `postgres` role's `search_path` there is `"$user", public, extensions`, so
 *   an unqualified create likewise lands in `public`.
 *
 * Both environments therefore behave identically, and the bare `vector(1536)`
 * type reference resolves in both. Two forms are deliberately NOT used here:
 * `WITH SCHEMA extensions`, because that schema does not exist on bare pg16;
 * and a schema-qualified `public.vector(1536)`, which would pin the type to a
 * schema this migration should not assume.
 * Supabase's "extension installed in public" advisor lint
 * may flag this after merge — that is accepted, and preferable to a DDL that
 * only works in one of the two environments.
 *
 * Version floor: pgvector supports Postgres 13+. CI is pg16; production
 * Supabase is Postgres 17.6. No action needed — noted so the next reader does
 * not have to re-derive it.
 *
 * RLS: `docs/PAYLOAD.md` §"New-table RLS convention (#72)" and `CLAUDE.md`
 * require a new table to enable Row Level Security in the SAME migration that
 * creates it. `ALTER DEFAULT PRIVILEGES` from the #72 migration already strips
 * `anon`/`authenticated` grants from tables this role creates afterward, but it
 * does not touch RLS state, so the explicit `ENABLE` below is still required.
 * **Never** `FORCE ROW LEVEL SECURITY` — Payload connects as the table owner
 * and owners bypass RLS, which is exactly what makes this layer invisible to
 * the app; FORCE would default-deny Payload's own connection against a table
 * that has no policies.
 *
 * Role-existence guards on the REVOKEs: `anon`/`authenticated` are
 * Supabase-provisioned roles that do not exist on bare Postgres. An
 * unconditional `REVOKE ... FROM anon` errors with `role "anon" does not exist`
 * and would break `pnpm migrate` in CI and local dev, so each REVOKE is wrapped
 * in a `pg_roles` existence check exactly as `20260820_221032_rls_lockdown.ts`
 * does — a silent no-op where the roles are absent, a real (belt-and-braces)
 * revoke on Supabase where they exist.
 *
 * Idempotency: every statement in `up` is either `IF NOT EXISTS`-guarded or
 * naturally idempotent (`ENABLE ROW LEVEL SECURITY` on an already-enabled table
 * is a no-op; the REVOKEs are unconditional revokes of privileges that may
 * already be absent). Payload's own migration ledger means `pnpm migrate` never
 * re-runs `up`, so CI's second-invocation assertion proves the ledger
 * short-circuits rather than the DDL guards; the guards are what make a
 * hand-repaired or partially-applied database recoverable.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "corvus_embeddings" (
      "id"           bigserial PRIMARY KEY,
      "collection"   text         NOT NULL,
      "doc_id"       integer      NOT NULL,
      "chunk_index"  integer      NOT NULL,
      "title"        text,
      "content"      text         NOT NULL,
      "content_hash" text         NOT NULL,
      "source_url"   text,
      "visibility"   text         NOT NULL DEFAULT 'public',
      "published_at" timestamptz,
      "embedding"    vector(1536) NOT NULL,
      "model"        text         NOT NULL,
      "updated_at"   timestamptz  NOT NULL DEFAULT now(),
      UNIQUE ("collection", "doc_id", "chunk_index")
    );
  `)

  await db.execute(
    sql`ALTER TABLE "corvus_embeddings" ENABLE ROW LEVEL SECURITY;`,
  )

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.corvus_embeddings FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.corvus_embeddings FROM authenticated';
      END IF;
    END $$;
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "corvus_embeddings_hnsw"
      ON "corvus_embeddings" USING hnsw ("embedding" vector_cosine_ops);
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "corvus_embeddings_doc"
      ON "corvus_embeddings" ("collection", "doc_id");
  `)
}

/**
 * Intentionally NOT restored by `down`:
 *
 * 1. The `vector` extension is not dropped. This is the same asymmetric-inverse
 *    rationale `20260820_221032_rls_lockdown.ts` documents for its non-restored
 *    REVOKEs: an extension is a database-wide facility, not this table's
 *    property. Another object may already depend on it (in which case
 *    `DROP EXTENSION` fails outright), and on Supabase it may have been enabled
 *    for something else entirely. Rolling back this migration removes this
 *    table; it does not un-provision a capability the rest of the database may
 *    be using.
 * 2. The `anon`/`authenticated` REVOKEs are not re-GRANTed — re-granting would
 *    reopen the exact hole #72 exists to close, and the table is gone by this
 *    point regardless.
 */
export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  // Indexes first, then the table. Dropping the table would cascade to both
  // indexes anyway; naming them makes the inverse explicit and keeps `down`
  // readable next to `up`.
  await db.execute(sql`DROP INDEX IF EXISTS "corvus_embeddings_hnsw";`)

  await db.execute(sql`DROP INDEX IF EXISTS "corvus_embeddings_doc";`)

  await db.execute(sql`DROP TABLE IF EXISTS "corvus_embeddings";`)
}
