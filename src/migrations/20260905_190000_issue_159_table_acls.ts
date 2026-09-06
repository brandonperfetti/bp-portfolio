import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Issue #159 — clear the `anon`/`authenticated` TABLE-ACL residue that the #72
 * lockdown and #87 function sweep both left behind: the `Dxtm` grants Supabase
 * pre-seeds on every table in `public`, plus the matching default privilege for
 * tables created next.
 *
 * @remarks
 * Board state that motivated this (measured on production, 2026-09-02, during
 * the #141 spike): `pg_default_acl` for `postgres`/`public`/`r` listed all four
 * of `postgres=arwdDxtm/postgres`, `anon=Dxtm/postgres`,
 * `authenticated=Dxtm/postgres` and `service_role=Dxtm/postgres`, and
 * `pg_class.relacl` on every live Payload table in `public` (~150) except
 * `corvus_embeddings` — whose own migration revoked explicitly — carried the
 * same `anon=Dxtm/postgres, authenticated=Dxtm/postgres` pair. `Dxtm` is
 * TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
 *
 * Why that matters, stated so nobody re-derives it: default-deny RLS is not a
 * complete substitute here. It gates the read/write half (`arwd`) and it does
 * NOT gate `TRUNCATE` — measured on PostgreSQL 16, a role holding only `D`
 * truncates an RLS-enabled, policy-free table successfully. So on the standard
 * #72 set the lockdown left a genuinely destructive privilege in place on every
 * content table. It is unreachable today (the Supabase Data API's exposed-schema
 * list is `api` only, and PostgREST has no TRUNCATE verb at all), which makes
 * this defence-in-depth rather than an incident: the same argument #72 and #87
 * rest on — a config mistake alone must not be enough to open a hole.
 *
 * Where the residue came from: `MAINTAIN` is a PostgreSQL **17** privilege and
 * does not exist on pg16, so the `m` in those ACLs dates the entry to the
 * platform's pg17 upgrade, not to any repo migration. A synthetic pg16 replay of
 * the full migration chain produces a clean
 * `{service_role=arwdDxt/postgres, postgres=arwdDxt/postgres}` default with no
 * `anon` at all — which is why the drift never showed up locally or in CI.
 *
 * Unlike #141's function ACLs, the grantor here is `postgres`, so this **is**
 * revocable by a repo migration; that is the whole reason #159 exists as its own
 * ticket rather than being folded into #141's accepted-residue list.
 *
 * Accepted residue, deliberately not attempted: Supabase also seeds a
 * `supabase_admin`-grantor default (`anon=arwdDxtm/supabase_admin` on `public`
 * tables). A `postgres`-owned migration cannot revoke a grant it did not make —
 * `REVOKE` only removes privileges granted by the executing role — so that entry
 * survives this migration by design. It is the same class as the #141 residue
 * and is recorded as accepted there and in `docs/PAYLOAD.md`
 * §"New-table RLS convention (#72)", not as a failure of this file.
 *
 * Acceptance reads `pg_class.relacl` and `pg_default_acl`, never
 * `information_schema.role_table_grants`: that view is scoped to grants
 * *applicable to the executing role*, so it reported **0** rows for `anon` and
 * `authenticated` on the very production database whose `relacl` carried them.
 * It is not a detector for this class of drift.
 *
 * Role-existence guards, exactly as #87: `anon`/`authenticated` are
 * Supabase-provisioned and do NOT exist on bare Postgres — including the
 * `pgvector/pgvector:pg16` service CI's heavy job runs `pnpm migrate` against,
 * and local dev. An unguarded `REVOKE ... FROM anon` fails with
 * `role "anon" does not exist`, so both halves sit behind a `pg_roles` check: a
 * silent no-op where the roles are absent (there is no anon path to close
 * there), a real revoke where they exist.
 *
 * `ALTER DEFAULT PRIVILEGES` role scope: intentionally NOT scoped with
 * `FOR ROLE <name>`, for the reason #72 and #87 both give — omitting it targets
 * objects the *current* role creates, i.e. whichever `DATABASE_URI` role runs
 * migrations in each environment, rather than hardcoding a role name that is not
 * guaranteed identical across local, CI, staging and production connection
 * strings.
 *
 * Idempotency: a `REVOKE` of a privilege that is already absent is a no-op, not
 * an error, in both forms used here — so `up` is safe to execute directly
 * against an already-migrated database, independent of the ledger short-circuit
 * that makes a second `pnpm migrate` skip it. One `DO` block per `db.execute`
 * with no bind parameters, per house style.
 *
 * No `CREATE TABLE` here, so no RLS follow-up is owed and
 * `scripts/check-migrations-rls.mjs` records zero obligations for this file.
 * No schema change either: this file carries no JSON snapshot, matching
 * `20260820_221032_rls_lockdown`, `20260828_155359_corvus_embeddings` and
 * `20260831_005000_issue_87_function_acls`.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Existing tables in `public`. This is the half that does real work on
  // Supabase: it strips the already-granted `Dxtm` — TRUNCATE included — from
  // every live Payload table.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)

  // The forward-looking half: tables created in `public` from now on are born
  // with no anon/authenticated privilege, so the next Payload collection does
  // not reintroduce what the statement above just removed.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
      END IF;
    END $$;
  `)
}

/**
 * Deliberately a no-op, for the same asymmetric-inverse reason
 * `20260831_005000_issue_87_function_acls.ts` and `20260820_221032_rls_lockdown.ts`
 * give about their own non-restored REVOKEs: a `down` that re-GRANTed `TRUNCATE`
 * (and REFERENCES/TRIGGER) to `anon`/`authenticated` would silently reopen the
 * exact hole this migration exists to close, and would do it as an automatic
 * side effect of `payload migrate:down` rather than as a decision anyone made.
 *
 * Every statement in `up` is a revoke, so the honest inverse is empty. Rolling
 * this migration back removes it from the ledger and changes no privilege. If a
 * Data API role is ever genuinely meant to reach a table in `public`, that is an
 * explicit, reviewed `GRANT` on that one table in its own migration, never a
 * blanket restoration of the default privilege.
 */
export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {}
