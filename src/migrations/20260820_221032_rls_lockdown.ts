import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Issue #72 — default-deny Row Level Security on every `public` table
 * (including the `_v` version and `_rels` join tables), plus defense-in-depth
 * revokes of the Supabase `anon`/`authenticated` grants.
 *
 * @remarks
 * Board state that motivated this (measured on Supabase, 2026-08-20):
 * 189 `rls_disabled_in_public` advisor errors; `anon` held direct SELECT on
 * `public.users` (email + password hash) and SELECT+UPDATE on `public.pages`.
 *
 * Why this is safe for the app (verified against `src/payload.config.ts`,
 * not assumed): Payload's Postgres adapter opens one pool using
 * `DATABASE_URI`/`POSTGRES_URL`/`DATABASE_URL` and runs every query —
 * including this migration — as that single connection role. Migrations run
 * with that same role are what *create* every table in `public`, so that
 * role is the owner of every table this migration touches. Postgres table
 * owners bypass RLS entirely unless `FORCE ROW LEVEL SECURITY` is also set
 * on the table (superusers/BYPASSRLS roles bypass even that) — nothing in
 * this codebase sets `FORCE ROW LEVEL SECURITY` anywhere, and this migration
 * does not add it. So enabling RLS here changes nothing for Payload/PostgREST
 * paths that authenticate as that owning role; it only closes off the
 * separate `anon`/`authenticated` Postgres roles Supabase provisions for its
 * auto-generated Data API, which is the actual attack surface (see
 * docs/MAINTENANCE.md's Supabase entry: the Data API's exposed-schema list
 * is `api` only today, so `public` isn't served through it right now — but
 * the underlying GRANTs to `anon`/`authenticated` still exist and would take
 * effect immediately if that config ever drifted; RLS + revoked grants means
 * a config mistake alone can no longer leak rows).
 *
 * Grant-revoke call: DO the revoke. Nothing in this app reads through the
 * `anon`/`authenticated` Postgres roles (Payload speaks Postgres directly as
 * the owning role; the Supabase Data API is otherwise unused per
 * docs/MAINTENANCE.md), so there is no legitimate access to preserve, and
 * leaving stale GRANTs in place is exactly the kind of latent privilege the
 * 189 advisor errors already show got created without following anyone's
 * conscious decision.
 *
 * Role-existence guards: `anon`/`authenticated` are Supabase-provisioned
 * roles that do NOT exist on a bare Postgres instance — including the
 * `pgvector/pgvector:pg16` service CI's heavy job runs `pnpm migrate`
 * against (`.github/workflows/ci.yml`) and local dev Postgres. An
 * unconditional `REVOKE ... FROM anon, authenticated` errors with
 * `role "anon" does not exist` on both, which would break `pnpm migrate`
 * everywhere except Supabase. Every REVOKE/ALTER DEFAULT PRIVILEGES
 * statement below is therefore wrapped in a `pg_roles` existence check: a
 * silent no-op where the roles don't exist (nothing to revoke — those
 * environments have no anon-path access to begin with), a real revoke on
 * Supabase where the roles do exist and currently hold the grants.
 *
 * `ALTER DEFAULT PRIVILEGES` role scope: intentionally NOT scoped with
 * `FOR ROLE <name>` — omitting it defaults to "objects the *current* role
 * creates", i.e. whichever `DATABASE_URI` role runs future migrations in
 * each environment (this migration doesn't hardcode a role name because
 * that name isn't guaranteed identical across local/CI/staging/prod
 * Supabase connection strings). That is exactly the role that will own
 * every table this or any future migration creates, so this correctly
 * future-proofs new tables without a hardcoded owner name.
 *
 * RLS enable/disable needs one `ALTER TABLE ... ROW LEVEL SECURITY` per
 * table — there is no bulk "ALL TABLES" form for that specific clause — so
 * it's a `DO` block looping `pg_tables`. The REVOKEs against
 * `ALL TABLES`/`ALL SEQUENCES IN SCHEMA public` ARE bulk forms already, so
 * they don't need a loop; they're wrapped only for the role-existence
 * guard. Every statement here is a `DO` block or bulk-form DDL with no bind
 * parameters, so one statement per `db.execute` per house style.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Enable RLS with NO policies (default-deny) on every table currently in
  // `public`, dynamically enumerated so no table — including `_v` version
  // tables and `_rels` join tables — can be missed by an incomplete list.
  await db.execute(sql`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
      END LOOP;
    END $$;
  `)

  // Defense-in-depth: revoke every table privilege from the Supabase
  // anon/authenticated roles, guarded so this is a no-op on Postgres
  // instances that don't provision those roles (local dev, CI).
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

  // Same, for sequences (nextval/currval on identity/serial columns).
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)

  // Same again as ALTER DEFAULT PRIVILEGES, so tables/sequences created by
  // future migrations (run by the same DATABASE_URI role, unscoped `FOR
  // ROLE` defaults to current_user — see remarks above) don't silently
  // reopen this hole the next time someone adds a collection.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
      END IF;
    END $$;
  `)
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  // Disable RLS on every table currently in `public`, mirroring `up`.
  //
  // Intentionally NOT restored here: the anon/authenticated REVOKEs and
  // ALTER DEFAULT PRIVILEGES changes. A down-migration that re-GRANTs table
  // access to anon/authenticated would silently reopen the exact hole this
  // migration exists to close — worse than the asymmetry of an imperfect
  // inverse. Rolling back this migration only removes the RLS layer (which,
  // per the `up` remarks, was never load-bearing for the app's own access
  // anyway); it does not restore anon-path DB access. If that access is
  // ever genuinely needed again, it must be a deliberate, reviewed GRANT —
  // not an automatic side effect of `payload migrate:down`.
  await db.execute(sql`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.tablename);
      END LOOP;
    END $$;
  `)
}
