import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * B6.1 — the three additive per-hero banner toggle columns (+ their versions
 * table), each a nullable boolean defaulting `true`:
 *
 * - `hero_show_content` — gate the overlaid text block on the `image`/`carousel`
 *   heroes.
 * - `hero_navigation` / `hero_pagination` — toggle the carousel hero's overlaid
 *   arrows / dots.
 *
 * Purely additive: `ADD COLUMN ... DEFAULT true` backfills every existing row to
 * `true`, so no stored banner changes. `normalizeHeroByType` clears them to
 * `null` off the types that don't render them (nullable, so that is safe). One
 * SQL statement per `db.execute` — no `ALTER TYPE ... ADD VALUE` here, so the
 * statements are independent plain column adds.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "pages" ADD COLUMN "hero_show_content" boolean DEFAULT true;`,
  )
  await db.execute(
    sql`ALTER TABLE "pages" ADD COLUMN "hero_navigation" boolean DEFAULT true;`,
  )
  await db.execute(
    sql`ALTER TABLE "pages" ADD COLUMN "hero_pagination" boolean DEFAULT true;`,
  )
  await db.execute(
    sql`ALTER TABLE "_pages_v" ADD COLUMN "version_hero_show_content" boolean DEFAULT true;`,
  )
  await db.execute(
    sql`ALTER TABLE "_pages_v" ADD COLUMN "version_hero_navigation" boolean DEFAULT true;`,
  )
  await db.execute(
    sql`ALTER TABLE "_pages_v" ADD COLUMN "version_hero_pagination" boolean DEFAULT true;`,
  )
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "pages" DROP COLUMN "hero_show_content";`)
  await db.execute(sql`ALTER TABLE "pages" DROP COLUMN "hero_navigation";`)
  await db.execute(sql`ALTER TABLE "pages" DROP COLUMN "hero_pagination";`)
  await db.execute(
    sql`ALTER TABLE "_pages_v" DROP COLUMN "version_hero_show_content";`,
  )
  await db.execute(
    sql`ALTER TABLE "_pages_v" DROP COLUMN "version_hero_navigation";`,
  )
  await db.execute(
    sql`ALTER TABLE "_pages_v" DROP COLUMN "version_hero_pagination";`,
  )
}
