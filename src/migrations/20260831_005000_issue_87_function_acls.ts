import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Issue #87 — close the last residue of the #72 RLS lockdown: the default ACL
 * for FUTURE FUNCTIONS created in `public`, which still hands `EXECUTE` to the
 * Supabase `anon` and `authenticated` roles.
 *
 * @remarks
 * Board state that motivated this (measured on Supabase staging, 2026-08-22):
 * `20260820_221032_rls_lockdown` swept tables and sequences — future tables and
 * sequences created by `postgres` in `public` grant only `postgres` and
 * `service_role`, and `anon`/`authenticated` hold zero rows in
 * `role_table_grants`. It never touched the FUNCTIONS class, so
 * `pg_default_acl` for `postgres`/`public`/functions still read
 * `{postgres=X, anon=X, authenticated=X, service_role=X}`: the next function
 * anyone creates in `public` would be born anon-executable.
 *
 * Why the lockdown missed it, stated so the next reader does not re-derive it:
 * `ALTER DEFAULT PRIVILEGES` is per object class. `ON TABLES` and
 * `ON SEQUENCES` say nothing about `ON FUNCTIONS`, and the #72 migration
 * issued only the first two. This migration is the third class, written in the
 * same shape, and completes the set for the object kinds Supabase pre-grants.
 *
 * Exposure today is latent, not live: the Supabase Data API's exposed-schema
 * list is `api` only (docs/MAINTENANCE.md), so PostgREST cannot RPC into
 * `public` at all. That is config, though, and the #72 docblock makes the same
 * argument this one rests on — a config mistake alone must not be enough to
 * open a hole. Revoking the default privilege means a future `CREATE FUNCTION`
 * in `public` plus an exposed-schema drift is still not an anon-callable RPC.
 *
 * #87 called the exposure "fully latent today: 0 functions exist in `public`",
 * measured 2026-08-22. That is no longer true, and the difference matters:
 * `20260828_155359_corvus_embeddings` runs an unqualified
 * `CREATE EXTENSION IF NOT EXISTS vector`, which installs pgvector's routines
 * into `public` — 37 of them on pgvector 0.6.0. It deployed on 2026-08-28,
 * six days AFTER that measurement and while the FUNCTIONS default privilege
 * this migration removes was still granting `anon`. Reproduced on PostgreSQL
 * 16.13 by replaying exactly that order (seed Supabase's default grants, then
 * `CREATE EXTENSION vector`): all 37 routines came out carrying explicit
 * `anon=X/postgres` AND `authenticated=X/postgres` entries in `proacl`.
 *
 * So the first statement below is load-bearing, not belt-and-braces: on any
 * database where the extension landed before this migration, it is what strips
 * real, already-granted `anon`/`authenticated` EXECUTE from those 37 routines.
 * The second statement is what stops the next one being born that way.
 *
 * One boundary is worth naming, because a reader checking this against a live
 * database will trip over it. These statements revoke privileges held BY
 * `anon`/`authenticated`. They do not touch grants held by the `PUBLIC`
 * pseudo-role, which is a different grantee — and Postgres hardwires
 * `EXECUTE TO PUBLIC` into every routine it creates
 * (`acldefault('f', owner)` = `{=X/owner,owner=X/owner}`, measured). A
 * `has_function_privilege('anon', …, 'EXECUTE')` sweep therefore still returns
 * true afterward, through `PUBLIC` rather than through any `anon` grant, and
 * no `ALTER DEFAULT PRIVILEGES` form suppresses it — its
 * `REVOKE ALL ON FUNCTIONS FROM PUBLIC` spelling stores no row and changes
 * nothing about a routine created next
 * (measured, three separate databases). Closing that would take an
 * object-level `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC`,
 * which also strips `service_role` and every other consumer of the vector
 * operators. That is a materially different change with its own blast radius;
 * it belongs to whoever decides it, in its own migration. The acceptance query
 * in this issue's summary separates the two grantees so the distinction is
 * visible instead of surprising.
 *
 * Deliberate RPC contract: functions in `public` are revoke-by-default from
 * here on. If a Postgres function is ever meant to be callable through the
 * Data API, it gets an explicit `GRANT EXECUTE` in its own migration, next to
 * the reasoning for why that exposure is wanted — the same rule
 * `docs/PAYLOAD.md` §"New-table RLS convention (#72)" now records.
 *
 * `ALTER DEFAULT PRIVILEGES` role scope: intentionally NOT scoped with
 * `FOR ROLE <name>`, exactly as #72 argued. Omitting it targets objects the
 * *current* role creates — whichever `DATABASE_URI` role runs migrations in
 * each environment — which is the same reasoning that made the table and
 * sequence revokes stick on Supabase without hardcoding a role name that is
 * not guaranteed identical across local, CI, staging, and production
 * connection strings.
 *
 * Role-existence guards: `anon`/`authenticated` are Supabase-provisioned and
 * do NOT exist on bare Postgres — including the `pgvector/pgvector:pg16`
 * service CI's heavy job runs `pnpm migrate` against, and local dev. An
 * unconditional `REVOKE ... FROM anon` fails with `role "anon" does not exist`
 * and would break `pnpm migrate` everywhere except Supabase, so every
 * statement below sits behind a `pg_roles` check: a silent no-op where the
 * roles are absent (there is no anon path to close there), a real revoke where
 * they exist.
 *
 * `ALL ROUTINES` vs `ALL FUNCTIONS`, the one place this deviates from the
 * spelling #87 prescribes, because the ticket's form has a measured gap:
 * `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon` does NOT reach a
 * PROCEDURE on pg16. Measured on PostgreSQL 16.13 against a procedure holding
 * an explicit grant — after the `ALL FUNCTIONS` revoke its ACL still read
 * `{…,anon=X/postgres}`, and only the
 * `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon` form
 * removed it. `ROUTINES` is the superset (functions, aggregates,
 * AND procedures), so it discharges everything the ticket asked for and closes
 * the procedure case too.
 *
 * The `ALTER DEFAULT PRIVILEGES` statements below deliberately keep the
 * ticket's `ON FUNCTIONS` spelling, because there the gap does not exist:
 * measured on the same instance, a default-privilege revoke `ON FUNCTIONS`
 * applies to procedures as well (a procedure created afterward came out
 * `{=X/postgres,postgres=X/postgres,service_role=X/postgres}` — no
 * `anon`/`authenticated`). `ON ROUTINES` is accepted there as a synonym; the
 * asymmetry in this file is therefore real behavior, not an oversight.
 *
 * Idempotency: a `REVOKE` of a privilege that is already absent is a no-op,
 * not an error, in both forms used here — so `up` is safe to execute directly
 * against an already-migrated database, independent of the ledger short-circuit
 * that makes a second `pnpm migrate` skip it. Every statement is a `DO` block
 * with no bind parameters, so one statement per `db.execute` per house style.
 *
 * No `CREATE TABLE` here, so no RLS follow-up is owed and
 * `scripts/check-migrations-rls.mjs` records zero obligations for this file.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Existing routines in `public`. On Supabase this is the half that does real
  // work: pgvector's 37 routines landed on 2026-08-28 while the FUNCTIONS
  // default still granted these roles, so they carry explicit anon= and
  // authenticated= EXECUTE entries today (see remarks). It also catches any
  // hand-created function or procedure that was granted directly.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `)

  // The load-bearing half: functions created in `public` from now on are born
  // with no anon/authenticated privilege, closing the residue #72 left.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated';
      END IF;
    END $$;
  `)
}

/**
 * Deliberately a no-op, for the reason `20260820_221032_rls_lockdown.ts`
 * states about its own non-restored REVOKEs: a `down` that re-GRANTed
 * `EXECUTE` to `anon`/`authenticated` would silently reopen the exact hole
 * this migration exists to close, and would do it as an automatic side effect
 * of `payload migrate:down` rather than as a decision anyone made.
 *
 * Unlike #72 — which had a genuinely reversible half (the RLS enable) to undo
 * here — every statement in `up` is a revoke, so the honest inverse is empty.
 * Rolling this migration back removes it from the ledger and changes no
 * privilege. If an anon-callable function in `public` is ever genuinely wanted,
 * it is an explicit, reviewed `GRANT EXECUTE` on that one function in its own
 * migration, never a blanket restoration of the default privilege.
 */
export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {}
