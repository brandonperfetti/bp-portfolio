import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #257 — the schema half of the Payload 3.88.0 → 3.90.2 bump.
 *
 * @remarks Three nullable columns, no table:
 *
 * - `users.reset_password_requested_at`: 3.90.0 (a critical-security release)
 *   adds `resetPasswordRequestedAt` to every auth collection, so a password
 *   reset can clear a lockout and forgot-password can be throttled.
 * - `media._objectkey`: since 3.90 an ENABLED cloud-storage adapter always
 *   adds `_objectKey` to the collections it serves. Staging and production
 *   run with a Blob token, so without this column every Media read there
 *   fails with Postgres 42703.
 * - `media.prefix` (default `''`): comes with `alwaysInsertFields: true` on
 *   the Blob adapter (`src/payload.config.ts`), which makes the schema the
 *   same with or without a token, so the tokenless `migrate:create` (CI's
 *   drift check) sees the `_objectKey` column too. An empty prefix builds the
 *   same Blob key as no prefix (`buildMediaBlobUrl`), so media URLs do not
 *   change.
 *
 * This file is the whole `migrate:create` diff against the 3.88 snapshot, and
 * a re-run finds nothing more with a token set or unset. No table is created,
 * so the new-table RLS rule (#72, #117) has nothing to add.
 *
 * Rollback is safe in either order: 3.88 code ignores the extra columns (its
 * reads and writes were run against a migrated database), and `down` drops
 * them without touching any row.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;`)
}

/** Drops the three 3.90 columns; rows are untouched. */
export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "prefix";
  ALTER TABLE "media" DROP COLUMN "_objectkey";
  ALTER TABLE "users" DROP COLUMN "reset_password_requested_at";`)
}
