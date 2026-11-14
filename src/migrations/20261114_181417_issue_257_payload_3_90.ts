import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * #257 — the schema half of the Payload 3.88.0 → 3.90.2 bump.
 *
 * @remarks Payload 3.90.0 (a critical-security release) adds a
 * `resetPasswordRequestedAt` field to every auth collection, so that a
 * password reset can clear a lockout and forgot-password can be throttled. Here
 * that is one nullable column on `users`; nothing else in the schema moved
 * (this file is the whole `migrate:create` diff against the 3.88 snapshot). No
 * table is created, so the new-table RLS rule (#72, #117) has nothing to add.
 *
 * Rollback is safe in either order: 3.88 code ignores the extra column (its
 * reads and writes were run against a migrated database), and `down` drops it
 * without touching any row.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;`)
}

/** Drops the 3.90 column; rows are untouched. */
export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "reset_password_requested_at";`)
}
