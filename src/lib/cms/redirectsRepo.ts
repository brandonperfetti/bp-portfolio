import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import {
  isSlugRoutedCollection,
  publicPathForSlug,
  type SlugRoutedCollection,
} from '@/fields/slug/slugPaths'
import { CMS_TAGS } from '@/lib/cms/cache'

/** A redirect flattened to two paths — what the routes actually need. */
export type CmsRedirect = {
  from: string
  to: string
}

/**
 * Upper bound on rows read per lookup. Redirects here are editorial plus one
 * row per deliberate published rename, so this is generous; a site that ever
 * approached it would want a keyed lookup instead of a full-list read.
 */
const REDIRECT_LIMIT = 500

/**
 * Canonical form for comparing paths: leading slash, no trailing slash, no
 * query or hash. `/articles/x/` and `articles/x` must match the stored
 * `/articles/x`.
 *
 * @param path - A path or stored `from`/`to` value.
 */
export const normalizeRedirectPath = (path: string): string => {
  const withoutSuffix = path.split('#')[0].split('?')[0].trim()
  const withLeadingSlash = withoutSuffix.startsWith('/')
    ? withoutSuffix
    : `/${withoutSuffix}`
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/, '')
    : withLeadingSlash
}

/**
 * Pure lookup over an already-loaded redirect list.
 *
 * @param redirects - Flattened rows from {@link getCmsRedirects}.
 * @param path - The requested path.
 * @returns The destination path, or `null` when nothing matches.
 *
 * @remarks Kept separate from the cached read so the matching rules
 * (normalisation, self-redirect rejection) are unit-testable without a Payload
 * or Next cache scope. A row whose destination equals its own source is
 * dropped rather than served: it would be an infinite redirect, and it is the
 * shape a rename-back-to-the-original leaves behind.
 */
export const resolveRedirect = (
  redirects: CmsRedirect[],
  path: string,
): null | string => {
  const target = normalizeRedirectPath(path)
  for (const redirect of redirects) {
    if (normalizeRedirectPath(redirect.from) !== target) continue
    const destination = normalizeRedirectPath(redirect.to)
    return destination === target ? null : destination
  }
  return null
}

/** Collect the referenced document ids per collection, at depth 0. */
const collectReferenceIds = (
  docs: Array<{ to?: unknown }>,
): Map<SlugRoutedCollection, Set<number | string>> => {
  const byCollection = new Map<SlugRoutedCollection, Set<number | string>>()
  for (const doc of docs) {
    const to = doc.to as
      | undefined
      | {
          reference?: { relationTo?: string; value?: unknown } | null
          type?: string
        }
    if (to?.type !== 'reference') continue
    const relationTo = to.reference?.relationTo
    const value = to.reference?.value
    if (!relationTo || !isSlugRoutedCollection(relationTo)) continue
    if (typeof value !== 'number' && typeof value !== 'string') continue
    const ids = byCollection.get(relationTo) ?? new Set()
    ids.add(value)
    byCollection.set(relationTo, ids)
  }
  return byCollection
}

/**
 * Every redirect the site serves, flattened to `{ from, to }` path pairs.
 *
 * @remarks `'use cache: remote'` + the `redirects` tag: the tag is already
 * purged by `revalidateRedirects` on every write to the collection (including
 * the rows `createSlugRedirect` writes), and the shared tier is what lets that
 * purge reach the instance serving the read (#118).
 *
 * **Why the reference join is done by hand.** Rows created by
 * `createSlugRedirect` point at a *document*, so the destination path has to be
 * built from that document's current slug. Reading at `depth: 1` would let
 * Payload populate it, but the populated Posts would then be what this
 * function caches — well past the 2 MB Runtime Cache item ceiling that
 * `cacheTags.test.ts` documents. Reading at `depth: 0` and resolving the ids in
 * two small `select: { slug: true }` queries keeps the cached value the tiny
 * path list it should be.
 *
 * A reference to a deleted document resolves to nothing and its row is
 * dropped, so a dangling redirect 404s rather than throwing.
 */
export const getCmsRedirects = async (): Promise<CmsRedirect[]> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.redirects)
  cacheLife('cmsContent')

  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'redirects',
    depth: 0,
    limit: REDIRECT_LIMIT,
    overrideAccess: false,
    pagination: false,
    select: { from: true, to: true },
  })

  const idsByCollection = collectReferenceIds(docs)
  const slugById = new Map<string, string>()

  await Promise.all(
    [...idsByCollection.entries()].map(async ([relationTo, ids]) => {
      const { docs: referenced } = await payload.find({
        collection: relationTo,
        depth: 0,
        limit: ids.size,
        overrideAccess: false,
        pagination: false,
        select: { slug: true },
        where: { id: { in: [...ids] } },
      })
      for (const doc of referenced as Array<{ id?: unknown; slug?: unknown }>) {
        if (typeof doc.slug !== 'string') continue
        slugById.set(`${relationTo}:${doc.id}`, doc.slug)
      }
    }),
  )

  const redirects: CmsRedirect[] = []
  for (const doc of docs) {
    const from = (doc as { from?: unknown }).from
    if (typeof from !== 'string' || from.length === 0) continue
    const to = (doc as { to?: unknown }).to as
      | undefined
      | {
          reference?: { relationTo?: string; value?: unknown } | null
          type?: string
          url?: null | string
        }

    if (to?.type === 'custom') {
      if (typeof to.url === 'string' && to.url.length > 0) {
        redirects.push({ from, to: to.url })
      }
      continue
    }

    const relationTo = to?.reference?.relationTo
    const value = to?.reference?.value
    if (!relationTo || (typeof value !== 'number' && typeof value !== 'string'))
      continue
    const slug = slugById.get(`${relationTo}:${value}`)
    const destination = publicPathForSlug(relationTo, slug)
    if (destination) redirects.push({ from, to: destination })
  }

  return redirects
}

/**
 * The destination a requested path should redirect to, or `null`.
 *
 * @param path - The path that did not resolve to a document.
 *
 * @remarks Call this only on a route's not-found branch. A real document always
 * wins: a redirect row whose `from` matches a live path is simply never
 * consulted, which is what makes renaming a slug back to a previous value safe.
 */
export const getRedirectForPath = async (
  path: string,
): Promise<null | string> => resolveRedirect(await getCmsRedirects(), path)
