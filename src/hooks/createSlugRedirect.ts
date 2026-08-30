import type { CollectionAfterChangeHook } from 'payload'

import { revalidatePath } from 'next/cache'

import {
  isSlugRoutedCollection,
  publicPathForSlug,
} from '@/fields/slug/slugPaths'

/**
 * `afterChange` hook that keeps a renamed published URL reachable: when a
 * published Post or Page changes slug, the old path gets a `redirects` row
 * pointing at the document.
 *
 * @remarks **When it fires.** Only on an `update` where the document is
 * published *and was already published before the change*, and where the
 * public path actually moved. A draft save, a first publish, and an unchanged
 * slug all return without writing — there is no old public URL to preserve in
 * any of those cases.
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
 * **Why it also revalidates the old path.** `revalidatePost` purges the old
 * path only on the *unpublish* transition
 * (`previousDoc._status === 'published' && doc._status !== 'published'`), so a
 * published→published rename leaves `/articles/<old>` serving its prerendered
 * shell and the new redirect would never be consulted. Purging it here is what
 * makes the old URL fall through to the not-found branch that reads the
 * redirect. Honours `context.disableRevalidate` like the other hooks; the row
 * itself is still written.
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
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return doc
  if (context?.disableSlugRedirect) return doc

  const collectionSlug = collection?.slug
  if (!collectionSlug || !isSlugRoutedCollection(collectionSlug)) return doc

  // Both sides must be published: a first publish has no old public URL, and a
  // draft save has not moved one.
  if (doc?._status !== 'published') return doc
  if (previousDoc?._status !== 'published') return doc

  const from = publicPathForSlug(collectionSlug, previousDoc?.slug)
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
