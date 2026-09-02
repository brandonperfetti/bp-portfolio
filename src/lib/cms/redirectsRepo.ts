import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import {
  isSlugRoutedCollection,
  publicPathForSlug,
  type SlugRoutedCollection,
} from '@/fields/slug/slugPaths'
import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * The permanence codes the redirects collection offers (#130).
 *
 * @remarks Mirrors `redirectTypes` in `src/plugins/index.ts`. The plugin itself
 * can emit 301/302/303/307/308; this union is deliberately the two that are
 * configured, so a code the admin form cannot produce cannot reach the routes
 * as a valid value either.
 */
export type CmsRedirectType = '301' | '302'

/**
 * A redirect flattened to two paths plus its permanence — what the routes
 * actually need.
 *
 * @remarks `type` is carried as the stored code rather than pre-collapsed to a
 * boolean so the cached row stays a faithful record of what the editor chose;
 * {@link resolveRedirect} is where it becomes the yes/no question a route can
 * act on.
 */
export type CmsRedirect = {
  from: string
  to: string
  type: CmsRedirectType
}

/**
 * A matched redirect: where to send the request, and whether the move is
 * permanent.
 *
 * @remarks Two fields rather than a bare string because the destination alone
 * cannot answer which Next API to call. `permanent` maps to `permanentRedirect`
 * (308) and its absence to `redirect` (307).
 */
export type CmsRedirectTarget = {
  destination: string
  permanent: boolean
}

/**
 * Is a permanence code a permanent redirect?
 *
 * @param type - A normalised code from a {@link CmsRedirect}.
 *
 * @remarks Deliberately narrow. An earlier cut took `unknown` so it could also
 * absorb the `null` a pre-#130 row carries — but that made two fallbacks for
 * one question: {@link getCmsRedirects} already normalises the raw column
 * before building a `CmsRedirect`, so this function never actually saw an
 * unset value, and the wider signature was exercised only by its own tests. The
 * fallback belongs at the boundary where the raw value arrives, and it lives
 * there alone now. Runtime behaviour is unchanged either way — `!== '302'`
 * answers `true` for anything else regardless of what the signature admits.
 */
export const isPermanentRedirect = (type: CmsRedirectType): boolean =>
  type !== '302'

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
 * Does this destination address somewhere other than a path on this site?
 *
 * @param destination - A stored `to` value.
 *
 * @remarks Any URI scheme (`https:`, `mailto:`) plus the protocol-relative
 * `//host/path` form, which the browser resolves against the current scheme
 * and is therefore just as external. The point of asking is the self-redirect
 * rule below: an absolute URL leaves this site, so it can never be the loop
 * that rule exists to break — and normalising it would turn
 * `https://example.com/x` into the nonsense path `/https://example.com/x`.
 */
const isAbsoluteDestination = (destination: string): boolean =>
  /^[a-z][a-z0-9+.\-]*:/i.test(destination) || destination.startsWith('//')

/**
 * Pure lookup over an already-loaded redirect list.
 *
 * @param redirects - Flattened rows from {@link getCmsRedirects}.
 * @param path - The requested path.
 * @returns The destination as configured plus its permanence, or `null` when
 * nothing matches.
 *
 * @remarks Kept separate from the cached read so the matching rules
 * (normalisation, self-redirect rejection) are unit-testable without a Payload
 * or Next cache scope. A row whose destination equals its own source is
 * dropped rather than served: it would be an infinite redirect, and it is the
 * shape a rename-back-to-the-original leaves behind.
 *
 * **Normalisation is for comparing, never for serving.** This used to return
 * `normalizeRedirectPath(redirect.to)`, which is right for the two *questions*
 * asked here — does this row's `from` match the request, and does its
 * destination point back at the request — and wrong for the *answer*, because
 * that function's job is to strip a path down to a comparable stem. Applied to
 * an editor's destination it silently rewrote it: `/signup?campaign=launch`
 * lost the query the campaign link existed for, and
 * `https://example.com/moved` came back as the path
 * `/https://example.com/moved`, a URL nothing serves. Reference rows never
 * showed it because {@link getCmsRedirects} builds those from a slug and they
 * are already canonical; only a hand-written custom row could carry a query,
 * a fragment, or a host. So the destination is now returned as configured
 * (trimmed), and the normalised form is used only to answer the two questions.
 *
 * Both callers hand the destination to `permanentRedirect` or `redirect`, both
 * of which accept absolute URLs and query-bearing paths as-is.
 */
export const resolveRedirect = (
  redirects: CmsRedirect[],
  path: string,
): CmsRedirectTarget | null => {
  const target = normalizeRedirectPath(path)
  for (const redirect of redirects) {
    if (normalizeRedirectPath(redirect.from) !== target) continue
    const destination = redirect.to.trim()
    const permanent = isPermanentRedirect(redirect.type)
    // Nothing to serve. `getCmsRedirects` never emits this — both row types
    // require a non-empty destination — but this function is exported and a
    // caller with its own list should get "no redirect" rather than the `/`
    // that normalising an empty string would have produced.
    if (!destination) return null
    // An absolute URL leaves the site, so the loop check does not apply to it.
    if (isAbsoluteDestination(destination)) return { destination, permanent }
    // Compare stems, not spellings: `/articles/a?x=1` still points back at
    // `/articles/a`, and serving it would re-enter this same not-found branch.
    return normalizeRedirectPath(destination) === target
      ? null
      : { destination, permanent }
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
    select: { from: true, to: true, type: true },
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
    // THE permanence fallback, and the only one — see `isPermanentRedirect`.
    // This is where the raw column arrives, so this is where "anything that is
    // not '302' is permanent" belongs: a row written before #130 added the
    // field carries no value at all, and one an import left unset carries
    // whatever the import wrote. Answering permanent is the pre-#130 behaviour
    // of this whole module (`permanentRedirect`, unconditionally), so the
    // field's arrival changes nothing for a row that does not use it — and it
    // is the conservative direction, since a rename redirect is exactly the
    // case that must stay permanent.
    const type: CmsRedirectType =
      (doc as { type?: unknown }).type === '302' ? '302' : '301'
    const to = (doc as { to?: unknown }).to as
      | undefined
      | {
          reference?: { relationTo?: string; value?: unknown } | null
          type?: string
          url?: null | string
        }

    if (to?.type === 'custom') {
      if (typeof to.url === 'string' && to.url.length > 0) {
        redirects.push({ from, to: to.url, type })
      }
      continue
    }

    const relationTo = to?.reference?.relationTo
    const value = to?.reference?.value
    if (!relationTo || (typeof value !== 'number' && typeof value !== 'string'))
      continue
    const slug = slugById.get(`${relationTo}:${value}`)
    const destination = publicPathForSlug(relationTo, slug)
    if (destination) redirects.push({ from, to: destination, type })
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
): Promise<CmsRedirectTarget | null> =>
  resolveRedirect(await getCmsRedirects(), path)
