import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * W5B1c data backfill (#25): make the site-owner byline land on ALL published
 * posts, and give the owner Author a real avatar.
 *
 * Context: the schema migration (20260813_154606) seeded one owner Author and
 * re-pointed the 14 posts that already had an author relation. Staging QA found
 * the other 33 published posts have NO author relation and render the name-only
 * fallback. This backfill assigns the owner Author to every authorless
 * published post (main table + latest version row, so admin/preview match), and
 * sets the owner Author's avatar to the Identity global's portrait Media.
 *
 * Author/portrait are resolved at RUNTIME by stable keys (author slug
 * `brandon-perfetti`; the Identity global's `image` relation) — never a
 * hardcoded id, since ids differ per environment and prod is promoted from
 * staging. Data-only: no schema/DDL, so payload-types is unchanged.
 */

/** Stable slug of the seeded site-owner Author (see 20260813_154606). */
const OWNER_SLUG = 'brandon-perfetti'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Resolve the seeded owner Author by its stable slug (depth 0 → `avatar` is
  // the Media id or null). Fail loudly if the seed is missing — the byline
  // backfill is meaningless without it.
  const { docs } = await payload.find({
    collection: 'authors',
    where: { slug: { equals: OWNER_SLUG } },
    limit: 1,
    depth: 0,
    req,
  })
  const owner = docs[0]
  if (!owner) {
    throw new Error(
      `[assign_owner_author_backfill] no Author with slug "${OWNER_SLUG}" — run 20260813_154606 first.`,
    )
  }

  // 1. Public byline: add the owner as author to every PUBLISHED post that has
  //    no author relation. Direct SQL (not payload.update) on purpose — it does
  //    NOT spawn a new version or bump `updatedAt` (which would wrongly move
  //    every post's JSON-LD dateModified / sitemap lastmod). Idempotent via
  //    NOT EXISTS; `order` = max+1 so it never collides with existing rel rows.
  //    Single parameterized statement per execute (extended protocol =
  //    one-command-per-execute — the bug fixed in the prior migration).
  await db.execute(sql`
  INSERT INTO "posts_rels" ("order", "parent_id", "path", "authors_id")
  SELECT
    COALESCE((SELECT MAX(r2."order") FROM "posts_rels" r2 WHERE r2."parent_id" = p."id"), 0) + 1,
    p."id",
    'authors',
    ${owner.id}
  FROM "posts" p
  WHERE p."_status" = 'published'
    AND NOT EXISTS (
      SELECT 1 FROM "posts_rels" r WHERE r."parent_id" = p."id" AND r."path" = 'authors'
    );`)

  // 2. Draft/preview parity: mirror the assignment onto the LATEST version row
  //    (`_posts_v.latest = true`) of those same published posts, so the admin
  //    editor and live-preview show the author too. Same idempotency + order.
  await db.execute(sql`
  INSERT INTO "_posts_v_rels" ("order", "parent_id", "path", "authors_id")
  SELECT
    COALESCE((SELECT MAX(r2."order") FROM "_posts_v_rels" r2 WHERE r2."parent_id" = v."id"), 0) + 1,
    v."id",
    'authors',
    ${owner.id}
  FROM "_posts_v" v
  JOIN "posts" p ON p."id" = v."parent_id"
  WHERE p."_status" = 'published'
    AND v."latest" = true
    AND NOT EXISTS (
      SELECT 1 FROM "_posts_v_rels" r WHERE r."parent_id" = v."id" AND r."path" = 'authors'
    );`)

  // 3. Owner avatar: resolve the portrait from the Identity global's `image`
  //    (the same Media doc the About page + Person JSON-LD use) at runtime — no
  //    hardcoded id, env-stable because the global is promoted staging→prod.
  //    Only set when a Media doc is resolved AND the Author has no avatar yet.
  //    If the global's image is unset, we leave avatar null (byline shows
  //    name + role + socials) — never guess a Media doc.
  if (owner.avatar == null) {
    const identity = await payload.findGlobal({
      slug: 'identity',
      depth: 0,
      req,
    })
    const portraitId =
      identity && identity.image != null
        ? typeof identity.image === 'object'
          ? identity.image.id
          : identity.image
        : null

    if (portraitId != null) {
      await payload.update({
        collection: 'authors',
        id: owner.id,
        data: { avatar: portraitId },
        // No request scope inside a migration — never fire revalidation.
        context: { disableRevalidate: true },
        req,
      })
    }
  }
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  // Resolve the owner Author (stable slug) to scope the reversal.
  const { docs } = await payload.find({
    collection: 'authors',
    where: { slug: { equals: OWNER_SLUG } },
    limit: 1,
    depth: 0,
    req,
  })
  const owner = docs[0]
  if (!owner) return

  // 1. Remove the owner-author byline from published posts (main + version).
  //    COARSE by necessity: backfilled rows are indistinguishable from the 14
  //    the prior migration re-pointed, so this also removes those. That is
  //    acceptable because up() re-adds EVERY authorless published post, making
  //    the up/down pair symmetric around the "all published posts show the
  //    owner" end state. A wholesale teardown of the authors relation is the
  //    schema migration's (20260813_154606) down.
  await db.execute(sql`
  DELETE FROM "posts_rels"
  WHERE "path" = 'authors' AND "authors_id" = ${owner.id}
    AND "parent_id" IN (SELECT "id" FROM "posts" WHERE "_status" = 'published');`)
  await db.execute(sql`
  DELETE FROM "_posts_v_rels"
  WHERE "path" = 'authors' AND "authors_id" = ${owner.id}
    AND "parent_id" IN (
      SELECT v."id" FROM "_posts_v" v
      JOIN "posts" p ON p."id" = v."parent_id"
      WHERE p."_status" = 'published'
    );`)

  // 2. Reverse the avatar — but only if it still points to the Identity
  //    portrait this migration set, so a hand-picked avatar is never clobbered.
  const identity = await payload.findGlobal({ slug: 'identity', depth: 0, req })
  const portraitId =
    identity && identity.image != null
      ? typeof identity.image === 'object'
        ? identity.image.id
        : identity.image
      : null
  if (portraitId != null) {
    await db.execute(sql`
  UPDATE "authors" SET "avatar_id" = NULL
  WHERE "id" = ${owner.id} AND "avatar_id" = ${portraitId};`)
  }
}
