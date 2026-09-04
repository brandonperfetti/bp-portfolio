import { APIError } from 'payload'
import type { CollectionBeforeValidateHook } from 'payload'

import { findPublishedSlug } from '@/fields/slug/findPublishedSlug'
import { publicPathFor } from '@/fields/slug/slugPaths'
import type { Post } from '@/payload-types'

/**
 * `beforeValidate` guard that refuses to rename the slug of a **placed,
 * published** article — a temporary stop-gap that exists only until #150.
 *
 * @remarks **This hook is deliberately droppable.** It ships in its own commit
 * and its own file, and #150 deletes it. Everything below is the argument for
 * why it is worth having in the meantime, and the argument against.
 *
 * ## The hole it plugs
 *
 * A redirect row's `from` is built from a *slug*
 * (`createSlugRedirect` → `publicPathForSlug`), which is correct for the whole
 * corpus and wrong for exactly one document shape: an article placed under a
 * section page. Rename `/work/old` to `/work/new` and the row that gets written
 * is `from: /articles/old → /articles/new` — a pair of archive URLs, for a
 * document that lives under `/work`. The URL that actually moved, `/work/old`,
 * gets no row at all and becomes a **hard 404**: no post carries that path any
 * more, no page ever did, and the redirect table has nothing spelled that way.
 *
 * That is not a stale shell that heals on the next purge. It is a dead inbound
 * link, which is the precise failure #120 exists to prevent — reappearing
 * through a door #120 could not see, because #120 reasons in slugs and
 * placement moved the unit of identity to paths.
 *
 * ## Why refuse rather than repair
 *
 * Repairing it means writing the row with a path-aware `from`, which means
 * changing `createSlugRedirect` and `capturePublishedSlug` — #150's ground, and
 * outside this change's fence. Doing it here would fork the redirect writer,
 * which is the one thing #120's design most depends on not happening.
 *
 * So the choice is between a silent broken link and a loud refusal, and a
 * refusal is the honest one: it costs an editor a two-step they can perform,
 * and it costs nothing at all to the overwhelming majority of articles, which
 * are unplaced and unaffected.
 *
 * ## Why it fires so rarely
 *
 * Three conditions must hold at once: the article is **placed**, it is
 * **published**, and its slug is **moving**. The third already requires an
 * explicit `slugLock: false` unlock (`enforceSlugFreeze` blocks it otherwise),
 * so this hook only ever speaks to an editor who has already deliberately
 * unlocked a URL — never to a title edit, never to a first publish, never to an
 * unplaced article, and never to a draft that has never been published.
 *
 * ## Where this runs, and why that is what makes it correct
 *
 * Payload runs **field** `beforeValidate` *before* **collection**
 * `beforeValidate`, and the field hooks write back into the same `data` object,
 * so `data.slug` here is the slug the field chain
 * `[formatSlugHook, enforceSlugFreeze]` already settled on — the **effective**
 * slug, not the raw payload key. Two consequences, both pinned by pg-tier cases
 * in `evals/post-placement-integration.test.ts`: a payload that omits `slug`
 * cannot derive a new one from the title (Payload seeds an absent field's value
 * from the stored document, so `formatSlugHook` returns the stored slug), and a
 * payload that omits the unlock has already been reverted by
 * `enforceSlugFreeze`, making an unlock-less API rename a silent no-op on the
 * URL rather than this 400. The Pages mirror
 * (`src/collections/Pages/hooks/refuseNestedSlugRename.ts`) carries the full
 * argument and the Payload source references.
 *
 * ## What it does not fix, stated plainly
 *
 * Un-placing an article *also* leaves its section URL 404ing, and this guard
 * does not prevent that. The difference is that un-placing is an editor
 * deliberately saying "this no longer lives here", where a rename is an editor
 * changing one thing and losing another. Both close with #150; only the second
 * is a surprise.
 *
 * ## The argument against, for whoever decides
 *
 * It is a guard that will be deleted, and it makes a legal operation illegal
 * for a shape of document that does not exist yet — nothing is placed on the
 * day this lands. If #150 is imminent, dropping this commit costs almost
 * nothing. If placement is announced to an editor before #150, this is what
 * stands between them and a dead link they will not be told about.
 */
export const refusePlacedSlugRename: CollectionBeforeValidateHook<
  Post
> = async ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update') return data

  const stored = originalDoc?.slug
  const incoming = data?.slug
  if (typeof stored !== 'string' || !stored) return data
  if (typeof incoming !== 'string' || !incoming) return data
  if (incoming === stored) return data

  // Placed is the whole precondition: an unplaced article's rename is the #120
  // path, which works correctly and must stay untouched.
  const placedPath =
    typeof originalDoc?.path === 'string' ? originalDoc.path : ''
  if (!placedPath) return data

  // Published, by the same two-step `enforceSlugFreeze` uses: `originalDoc` is
  // the published row on the admin's own path, and otherwise it may be an
  // autosaved draft over a live published version, which only the database can
  // answer. A never-published placed draft has no live URL to break.
  const isPublished =
    originalDoc?._status === 'published' ||
    (originalDoc?.id !== undefined &&
      originalDoc?.id !== null &&
      (await findPublishedSlug(req, 'posts', originalDoc.id)) !== null)
  if (!isPublished) return data

  const current = publicPathFor('posts', originalDoc)
  throw new APIError(
    `This article is published at ${current}, and renaming its slug would leave that URL broken — the redirect that gets written would point at /articles instead. Clear its parent page first (which returns it to ${publicPathFor('posts', { slug: stored })}), rename it there, and place it again — or wait for path-aware redirects (#150).`,
    400,
  )
}
