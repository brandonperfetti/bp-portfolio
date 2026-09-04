import { APIError } from 'payload'
import type { CollectionBeforeValidateHook } from 'payload'

import { findPublishedSlug } from '@/fields/slug/findPublishedSlug'
import { parentIdOf } from '@/fields/slug/documentPath'
import { publicPathFor } from '@/fields/slug/slugPaths'
import type { Page } from '@/payload-types'

/**
 * `beforeValidate` guard that refuses to rename the slug of a **nested,
 * published** page — a temporary stop-gap that exists only until #150.
 *
 * @remarks **This hook is deliberately droppable.** It ships in its own commit
 * and its own file, and #150 deletes it. It is the Pages mirror of
 * `refusePlacedSlugRename` (`src/collections/Posts/hooks/`), which was ratified
 * for the same hole on the Posts side; everything below is the argument for why
 * the Pages half is worth having in the meantime, and the argument against.
 *
 * ## The hole it plugs
 *
 * A redirect row's `from` is built from a *slug*
 * (`createSlugRedirect` → `publicPathForSlug`), and `publicPathForSlug` can
 * only ever spell a top-level path. For a page whose real URL is
 * `/work/brytecore` — one with a `parent` — renaming `brytecore` to `bcore`
 * writes `from: /brytecore → /bcore`: a pair of URLs that never existed and
 * that nothing will ever request. The URL that actually moved,
 * `/work/brytecore`, gets no row at all and becomes a **hard 404**: no page
 * carries that path any more, no post ever did, and the redirect table has
 * nothing spelled that way.
 *
 * That is not a stale shell that heals on the next purge. It is a dead inbound
 * link, which is the precise failure #120 exists to prevent — reappearing
 * through a door #120 could not see, because #120 reasons in slugs and #148's
 * hierarchy moved the unit of identity to paths.
 *
 * ## Why the *nested* condition, and not "has a path"
 *
 * Every page carries a `path`, because M1 backfilled it to the slug. So "has a
 * path" would fire on the whole corpus and forbid the ordinary rename #120 was
 * built to support. The condition that actually distinguishes a broken row from
 * a correct one is **having a parent**: with no parent, `path === slug` and
 * `publicPathForSlug` spells exactly the right URL, so #120 works and must keep
 * working byte for byte (AC1 of #150). The Posts hook tests `path` instead
 * because for a post `path` is NULL until it is placed, so there the two
 * questions are the same question.
 *
 * The site root is unparented by construction, so it is never touched here.
 *
 * ## Why refuse rather than repair
 *
 * Repairing it means writing the row with a path-aware `from`, which means
 * changing `createSlugRedirect` and `capturePublishedSlug` — #150's ground
 * (`capturePublishedPath` / `createPathRedirect`), and outside this change's
 * fence. Doing it here would fork the redirect writer, which is the one thing
 * #120's design most depends on not happening.
 *
 * So the choice is between a silent broken link and a loud refusal, and a
 * refusal is the honest one: it costs an editor a three-step they can perform,
 * and it costs nothing at all to the overwhelming majority of pages, which are
 * top-level and unaffected.
 *
 * ## Why it fires so rarely
 *
 * Three conditions must hold at once: the page is **nested**, it is
 * **published**, and its slug is **moving**. The third already requires an
 * explicit `slugLock: false` unlock (`enforceSlugFreeze` blocks it otherwise),
 * so this hook only ever speaks to an editor who has already deliberately
 * unlocked a URL — never to a title edit, never to a first publish, never to a
 * top-level page, and never to a draft that has never been published.
 *
 * ## Where this runs, and why that is what makes it correct
 *
 * Payload's update operation runs **field** `beforeValidate` *before*
 * **collection** `beforeValidate`, and the field hooks write their results back
 * into the same `data` object
 * (`payload/collections/operations/utilities/update.ts` →
 * `fields/hooks/beforeValidate/index.ts`, whose `siblingData` *is* the incoming
 * `data`). So by the time this collection hook is called, `data.slug` is the
 * slug the field chain `[formatSlugHook, enforceSlugFreeze]` has already
 * settled on — the **effective** slug, not the raw payload key. Comparing it to
 * `originalDoc.slug` is therefore the right comparison, and there is no
 * title-derived rename that can slip past it:
 *
 * - A payload that omits `slug` does not reach `formatSlugHook` with an empty
 *   value. Payload seeds an absent field's `value` from the stored document
 *   (`getFallbackValue`), so the hook takes its `value.length > 0` branch and
 *   returns the stored slug. Its derive-from-title fallback is unreachable on
 *   an update whose stored slug is non-empty — including
 *   `{ title, slugLock: false }`, which moves the title and leaves the URL
 *   alone.
 * - A payload that omits the unlock is reverted to the stored slug by
 *   `enforceSlugFreeze` before this hook sees it, so an unlock-less API rename
 *   on a nested, published page is a **silent no-op on the URL, not a 400**.
 *   The loud refusal below is reserved for the one write that would really move
 *   a live nested URL: an explicit `slugLock: false` with a genuinely different
 *   slug.
 *
 * Both facts are pinned by pg-tier cases in
 * `evals/pages-hierarchy-integration.test.ts` (and the Posts mirror in
 * `evals/post-placement-integration.test.ts`), because neither is visible to a
 * mocked fixture and both belong to Payload rather than to this repo.
 *
 * ## What it does not fix, stated plainly
 *
 * Re-parenting a published page *also* leaves its old URL 404ing, and so does
 * renaming an ancestor, whose descendants do not cascade at all (the known
 * limit in `docs/NAVIGATION.md`). This guard prevents neither. The difference
 * is that re-parenting is an editor deliberately saying "this lives somewhere
 * else now", where a rename is an editor changing one thing and losing another.
 * All of them close with #150; only the rename is a surprise.
 *
 * ## The argument against, for whoever decides
 *
 * It is a guard that will be deleted, and it makes a legal operation illegal
 * for a shape of document that does not exist yet — **no nested page exists on
 * production the day this lands**. If #150 is imminent, dropping this commit
 * costs almost nothing. If the hierarchy is announced to an editor before #150,
 * this is what stands between them and a dead link they will not be told about.
 */
export const refuseNestedSlugRename: CollectionBeforeValidateHook<
  Page
> = async ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update') return data

  const stored = originalDoc?.slug
  const incoming = data?.slug
  if (typeof stored !== 'string' || !stored) return data
  if (typeof incoming !== 'string' || !incoming) return data
  if (incoming === stored) return data

  // Nested is the whole precondition: a top-level page's rename is the #120
  // path, which works correctly and must stay untouched. Read through
  // `parentIdOf` because a `depth > 0` read hands back a populated document
  // where the API hands back a bare id.
  //
  // The STORED parent, deliberately, not the incoming one. The URL at risk is
  // the one being vacated, and that is spelled by the placement the document
  // already has. A save that un-parents AND renames in one action still leaves
  // `/work/old` with no row, so it is refused; a save that parents a top-level
  // page AND renames it is fine, because `from` is `/old` — which is exactly
  // the URL that moved — and `to` is a reference that resolves to the new
  // nested path.
  const parentId = parentIdOf(originalDoc?.parent)
  if (parentId === null) return data

  // Published, by the same two-step `enforceSlugFreeze` uses: `originalDoc` is
  // the published row on the admin's own path, and otherwise it may be an
  // autosaved draft over a live published version, which only the database can
  // answer. A never-published nested draft has no live URL to break.
  const isPublished =
    originalDoc?._status === 'published' ||
    (originalDoc?.id !== undefined &&
      originalDoc?.id !== null &&
      (await findPublishedSlug(req, 'pages', originalDoc.id)) !== null)
  if (!isPublished) return data

  const current = publicPathFor('pages', originalDoc)
  const topLevel = publicPathFor('pages', { slug: stored })
  throw new APIError(
    `This page is published at ${current}, and renaming its slug would leave that URL broken — the redirect that gets written would describe ${topLevel}, a URL this page has never had. Clear its parent first (which moves it to ${topLevel}), rename it there, and set the parent again — or wait for path-aware redirects (#150).`,
    400,
  )
}
