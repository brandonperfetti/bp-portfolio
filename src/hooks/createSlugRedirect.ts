import type { CollectionAfterChangeHook } from 'payload'

import { revalidatePath } from 'next/cache'

import {
  isSlugRoutedCollection,
  publicPathForSlug,
} from '@/fields/slug/slugPaths'
import { readPreviousPublishedSlug } from '@/hooks/capturePublishedSlug'

/**
 * `afterChange` hook that keeps a renamed published URL reachable: when a
 * published Post or Page changes slug, the old path gets a `redirects` row
 * pointing at the document.
 *
 * @remarks **When it fires.** Only on an `update` that lands the document in a
 * published state, where a *previously published* slug exists and differs from
 * the new one. A draft save, a first publish, and an unchanged slug all return
 * without writing — there is no old public URL to preserve in any of those
 * cases.
 *
 * **The old slug comes from {@link capturePublishedSlug}, not `previousDoc`.**
 * With autosave enabled (both Posts and Pages run a 100ms interval) Payload's
 * `previousDoc` is the latest *version* — the autosaved draft — so on the real
 * admin rename path it already carries the NEW slug and reports
 * `_status: 'draft'`. Reading it here made this hook silently never fire for
 * the main editorial flow. The `beforeChange` companion reads the main table
 * row instead, which a draft save never touches, and stashes the true
 * pre-write published slug on `req.context`. `previousDoc` is deliberately not
 * used at all.
 *
 * **Why the redirect targets the document, not a path.** `to.type: 'reference'`
 * makes the row resolve through the document's *current* slug at read time
 * (`src/lib/cms/redirectsRepo.ts`). Renaming `a → b → c` therefore leaves
 * `/articles/a` and `/articles/b` both resolving straight to `/articles/c`:
 * redirect chains cannot form by construction, so there is no chain-collapsing
 * pass to get wrong. It also means a row needs no maintenance when the document
 * is renamed again.
 *
 * **Idempotency.** `from` is `unique: true` on the plugin's collection, so a
 * repeated rename back and forth would collide. The hook reads first and
 * updates the existing row instead of stacking a second one — which is also the
 * "old path already redirected somewhere else" case: it is repointed, not
 * duplicated.
 *
 * **Why it also revalidates the old path, and why that stays here (#132).**
 * `revalidatePost` purges the old path only on the *unpublish* transition
 * (`previousDoc._status === 'published' && doc._status !== 'published'`), so a
 * published→published rename leaves `/articles/<old>` serving its prerendered
 * shell and the new redirect would never be consulted. Purging it here is what
 * makes the old URL fall through to the not-found branch that reads the
 * redirect. Honours `context.disableRevalidate` like the other hooks; the row
 * itself is still written.
 *
 * #132 asked whether that purge should move into the revalidation hooks
 * instead. It should not, and the decisive reason is visible one line above:
 * the purge takes `from` — the exact string just written as the row's `from`,
 * built by `publicPathForSlug`. The revalidation hooks speak a different path
 * vocabulary (they hand-build `/articles/${slug}`, and `revalidatePage` maps
 * `home` to `/` where `publicPathForSlug` says `/home`), so a purge issued from
 * there could uncover a path no row was ever written for. Keeping writer and
 * purge in one expression makes them incapable of disagreeing. It also keeps
 * the purge conditional on the write having succeeded — it sits inside this
 * same `try`, after the row lands — rather than on a transition that fires
 * either way. The ownership rule, stated once for both sides: **whoever writes
 * a redirect row purges that row's `from`; the revalidation hooks purge the
 * document's own paths.** The transition matrix is pinned in
 * `revalidatePost.test.ts` and `revalidatePage.test.ts`.
 *
 * A failure here must never fail the editor's publish, so the write is wrapped
 * and logged. The `redirects` cache tag is purged for free: creating the row
 * runs the redirects collection's own `revalidateRedirects` hook.
 */
export const createSlugRedirect: CollectionAfterChangeHook = async ({
  collection,
  context,
  doc,
  operation,
  req,
}) => {
  if (operation !== 'update') return doc
  if (context?.disableSlugRedirect) return doc

  const collectionSlug = collection?.slug
  if (!collectionSlug || !isSlugRoutedCollection(collectionSlug)) return doc

  // The write must land the document published, and a published version must
  // have existed beforehand — no captured slug means a first publish.
  if (doc?._status !== 'published') return doc
  // `req.context` first: it is the object `capturePublishedSlug` wrote to, and
  // the only one guaranteed current after a nested Local API call swapped it.
  // Read before this hook makes its own `find`, which swaps it again.
  const previousSlug = readPreviousPublishedSlug(
    req.context ?? context,
    collectionSlug,
    doc.id,
  )
  if (!previousSlug) return doc

  const from = publicPathForSlug(collectionSlug, previousSlug)
  const to = publicPathForSlug(collectionSlug, doc?.slug)
  if (!from || !to || from === to) return doc

  const data = {
    from,
    to: {
      type: 'reference' as const,
      reference: { relationTo: collectionSlug, value: doc.id },
    },
  }

  try {
    const existing = await req.payload.find({
      collection: 'redirects',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { from: { equals: from } },
    })

    const current = existing.docs[0]
    if (current) {
      await req.payload.update({
        collection: 'redirects',
        data,
        id: current.id,
        overrideAccess: true,
        req,
      })
    } else {
      await req.payload.create({
        collection: 'redirects',
        data,
        overrideAccess: true,
        req,
      })
    }

    req.payload.logger.info(
      `Slug changed: redirecting ${from} -> ${to} (${collectionSlug}#${doc.id})`,
    )

    if (!context?.disableRevalidate) revalidatePath(from)
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `Failed to create redirect ${from} -> ${to}`,
    )
  }

  return doc
}
