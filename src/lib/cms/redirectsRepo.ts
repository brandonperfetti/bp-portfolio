import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import {
  isSlugRoutedCollection,
  publicPathFor,
  type PathableDoc,
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
  /**
   * Does this row also cover everything under `from`, keeping the remainder of
   * the requested path? (#150)
   *
   * @remarks Optional rather than required so the dozens of existing
   * `{ from, to, type }` literals — in this file's own tests and in every
   * caller that builds a list by hand — stay valid, and so a row read back
   * before the column existed reads as `false` rather than as a type error.
   * {@link resolveRedirect} treats anything but `true` as an exact-only row.
   */
  matchDescendants?: boolean
  to: string
  /**
   * The path the target was being served at when this row was written (#178).
   *
   * @remarks `to` is resolved through the target's CURRENT path, which is the
   * right answer for `from` itself and the wrong lookup key for anything
   * captured beneath it — the rows for those descendants are keyed at the
   * spelling in force at capture. This is that spelling, and
   * {@link resolveRedirect} rewrites onto it first for exactly that reason.
   *
   * Optional, and omitted rather than `null` when unset, for the same reason
   * `matchDescendants` is: a row written before #178 has no snapshot and can
   * never gain one (the move it records already happened), so the reader must
   * treat its absence as "fall back to the current path", which is the
   * pre-#178 behaviour byte for byte.
   */
  toPathAtCapture?: string
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
 * How many capture-time rewrites one request may walk (#178).
 *
 * @remarks Each hop is one historical move of an ancestor, so five is already
 * well past what a real editorial history produces for a single URL — and the
 * cap is not there to be generous, it is there so a cycle terminates. It also
 * bounds the cost: each hop re-walks the (at most `REDIRECT_LIMIT`) rows
 * already in hand, so the worst case is five passes over an in-memory list, no
 * extra reads.
 */
const MAX_REDIRECT_HOPS = 5

/**
 * The hop budget for one call, shared by every frame of the walk.
 *
 * @remarks Mutable and shared rather than a number passed down, because the two
 * outcomes a frame must tell apart — "the chain ended, nothing further matched"
 * and "the chain ran out of budget" — are BOTH a `null` return. Without
 * `exhausted`, a cyclic pair would exhaust the budget deep in the walk and the
 * frame above would read that `null` as a clean termination and serve its own
 * capture-time URL. The flag makes exhaustion propagate all the way out as
 * `null`, which is the honest answer: we do not know where this URL goes.
 */
type HopBudget = { exhausted: boolean; remaining: number }

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
 *
 * ## Prefix rows, and why exact wins (#150)
 *
 * A row with `matchDescendants` covers `from` and everything beneath it,
 * carrying the remainder across: `/work` → `/experience` sends
 * `/work/brytecore` to `/experience/brytecore`. That is what makes a section
 * move cost one row instead of one per descendant — see the field's comment in
 * `src/plugins/index.ts` for the ceiling that motivates it.
 *
 * Four rules, all of them consequences rather than choices — and rules 1 and 4
 * are the same consequence twice, which is why the fourth was missed at first:
 *
 * 1. **Exact matches are tried first, across the whole list**, which is why
 *    this is two passes and not one loop with a `continue`. A single pass would
 *    let a prefix row that happens to sit earlier in the list beat a specific
 *    override that sits later, making the answer depend on row order — and row
 *    order here is "whatever Payload returned". An editor who writes
 *    `/work/brytecore → /clients/brytecore` beside a `/work → /experience`
 *    prefix row means the specific one.
 * 2. **The boundary is a slash.** `startsWith('/work')` would also match
 *    `/workshops`, a different page whose URL merely begins with the same
 *    letters. The test is `target === from || target.startsWith(from + '/')`.
 * 3. **The self-redirect guard applies to the REWRITTEN destination**, not to
 *    the row's raw `to`. A prefix row whose target resolves back to where it
 *    started — the shape a move-and-move-back leaves behind — produces
 *    `/work/x → /work/x` only after the suffix is appended, so checking `to`
 *    alone would miss it and serve an infinite redirect.
 * 4. **Among matching prefix rows, the LONGEST `from` wins** (ties keep the
 *    first in list order). Rule 1 says row order must not decide an answer,
 *    because row order is whatever Payload returned; this is that same argument
 *    applied to prefix-against-prefix, and it took a walkthrough on a real
 *    database to notice the first pass had only made it for exact-against-prefix.
 *
 * ## Why longest wins — the rename-under-rename case
 *
 * [measured, orchestrator walkthrough on a prod-restore database, admin UI,
 * M4 applied] a three-level tree, renamed from the inside out:
 *
 * ```text
 * rename  /lab-parent/lab-child → …/lab-kid   ⇒ row A: /lab-parent/lab-child  (prefix)
 * move    the grandchild up one level          ⇒ row B: /lab-parent/lab-kid/lab-grandchild
 * rename  /lab-parent → /lab-base              ⇒ row C: /lab-parent           (prefix)
 * ```
 *
 * A request for `/lab-parent/lab-child/lab-grandchild` — an inbound link
 * captured before either rename — matches BOTH A and C, and the answers differ:
 *
 * | chosen row | result | |
 * | --- | --- | --- |
 * | C (`/lab-parent`, shorter) | `/lab-base/lab-child/lab-grandchild` | **404** |
 * | A (`/lab-parent/lab-child`, longer) | `/lab-base/lab-kid/lab-grandchild` | resolves |
 *
 * C carries the remainder `lab-child/lab-grandchild` across verbatim, and
 * `lab-child` is a segment that has not existed since step 1 — so the shorter
 * row confidently produces a URL nothing serves. A is the more specific truth:
 * it was captured under an ancestor that has since moved, and its own
 * destination is a *reference*, so it resolves through the child's CURRENT
 * path — which already includes the renamed parent.
 *
 * [Superseded by #178, and left standing because the rule above is still the
 * one that picks the row.] This paragraph used to end "row B then covers the
 * grandchild's own move on the next request; chains still cannot form, because
 * every hop resolves through a document rather than through another row." Both
 * halves are false and the ticket exists because of it: B is keyed at a
 * spelling the current-path rewrite never produces, so B is never consulted at
 * all, and the fix below deliberately resolves one row's rewritten form through
 * the table again — a bounded chain, by design. See "The historical hop".
 *
 * Before this rule the answer was whichever of A and C `payload.find` happened
 * to return first.
 * [measured, unit probe: list C-then-A gave the dead URL, list A-then-C the
 * live one]
 *
 * ## The chosen row is the only row
 *
 * Selection happens over the whole list BEFORE any destination is inspected,
 * and a chosen row that cannot serve the request answers `null` rather than
 * yielding to a shorter one. That covers two cases:
 *
 * - **An absolute `to`.** Appending a path suffix to an editor's
 *   `https://example.com/moved` is a URL this function has no business
 *   inventing; the exact-match pass has already served that row for the one
 *   request it genuinely describes.
 * - **A self-redirect** on the rewritten destination (rule 3).
 *
 * Falling through in either case would let a less specific ancestor answer for
 * a subtree a more specific row owns — rule 4's defect arriving by a side door.
 * "The most specific row says no" means no, exactly as it does in the exact
 * pass, where a matching row with an empty or self-pointing destination
 * likewise returns `null` instead of looking for a second opinion.
 *
 * ## The historical hop — surviving a SECOND move (#178)
 *
 * Rule 4 above picks the most specific row and rewrites the remainder onto that
 * row's CURRENT destination. That is right while the chosen row's target has
 * moved once. It breaks the moment the target moves again, and the walkthrough
 * on the ticket is the same three-level tree, one step further:
 *
 * ```text
 * (1) rename  /lab-parent/lab-child → …/lab-kid   ⇒ A: /lab-parent/lab-child       (prefix)
 * (2) move    the grandchild up one level          ⇒ B: /lab-parent/lab-kid/lab-grandchild
 * (3) rename  /lab-parent → /lab-base              ⇒ C: /lab-parent                (prefix)
 * ```
 *
 * `GET /lab-parent/lab-child/lab-grandchild`: rule 4 chooses A, A's target now
 * lives at `/lab-base/lab-kid`, and the remainder lands as
 * `/lab-base/lab-kid/lab-grandchild` — **404**. Every hop of that URL's history
 * has a row, and B is sitting in the same list, unread. It is unread because B
 * is keyed at `/lab-parent/lab-kid/lab-grandchild`: the spelling in force when
 * the grandchild moved, which names A's target as `/lab-parent/lab-kid`, the
 * path A's target no longer has. The rewrite jumped straight to the present and
 * skipped the era B is filed under.
 * [measured, unit probe on the pre-#178 tree: the repro answered
 * `/lab-base/lab-kid/lab-grandchild`.]
 *
 * So the rewrite goes onto {@link CmsRedirect.toPathAtCapture} FIRST — the
 * target's path as of this row's own capture, which is exactly the era the next
 * row is filed under — and the result is re-resolved through the same table.
 * Here that is `/lab-parent/lab-kid/lab-grandchild`, which B answers exactly,
 * giving `/lab-base/lab-grandchild` — and an exact match spends no budget, so
 * the walk is one hop long even though the history is three moves.
 *
 * **When the re-resolution finds nothing, the walk does NOT serve the
 * capture-time form** — it falls through to the pre-#178 current-path rewrite.
 * Under a complete table those are the same string (nothing keyed at the
 * snapshot means the target has not moved since capture), so this is not a
 * behaviour difference; under a table missing an intermediate row — deleted in
 * admin, or past the {@link REDIRECT_LIMIT} read — the current path is a live
 * document's, and the capture-time form is a spelling that may serve nothing.
 * Serving the latter would have been a regression against the pre-#178 answer.
 *
 * Four properties fall out, and each is a test below:
 *
 * 1. **Bounded.** {@link MAX_REDIRECT_HOPS} hops, tracked in a shared
 *    {@link HopBudget}. Exhaustion answers `null` all the way up rather than
 *    serving a partial walk, which is what makes a cyclic pair terminate.
 * 2. **Every rewritten form is re-asked `isAbsoluteDestination`** — the
 *    capture-time form, and each hop's own form through the recursion. The
 *    wave-6 `//host` guard is not weakened by having more forms to guard; it is
 *    applied to all of them.
 * 3. **Permanence is the chain's product.** A permanent hop through a temporary
 *    one is temporary: `permanent && next.permanent`. This is a real behaviour
 *    change worth stating — a 301 row whose walk passes through a 302 row now
 *    answers 307 rather than 308.
 *
 *    **Decided (#178): keep the product.** The alternative — report the FIRST
 *    row's permanence, since that is the row whose URL the visitor asked for —
 *    is defensible, and it loses on the asymmetry of harm. A wrong 307 costs a
 *    ranking signal, is recoverable, and self-heals: the day the 302 becomes a
 *    301 the composite becomes 308 with no intervention. A wrong 308 is cached
 *    by the browser effectively indefinitely, the server can never retract it,
 *    and the visitor keeps going to a destination that may since have been
 *    retired. One is a temporary loss of a signal; the other is a permanent
 *    loss of a visitor no deploy can fix. The frequency is low by
 *    construction, too: `createPathRedirect` hard-codes `type: '301'` on every
 *    row it writes, so a 302 can only enter a chain by an editor hand-writing
 *    one — exactly the case where "not settled" is a deliberate statement. The
 *    rule is surfaced to that editor in the redirect-type field's admin
 *    description (`src/plugins/index.ts`), because it is their row that
 *    downgrades every chain passing through it.
 * 4. **A hop that finds nothing falls back, it does not serve the snapshot.**
 *    See the paragraph above and the branch itself: identical under a complete
 *    table, strictly safer under an incomplete one.
 *
 * **Hops are not moves.** The budget is spent only when pass 2 chooses a
 * `matchDescendants` row that carries a snapshot whose rewrite differs from the
 * request. An exactly-keyed row costs nothing, and the terminating frame costs
 * nothing, so the guarantee is a FLOOR: at least five chained ancestor moves,
 * and often more. The repro above is three moves and one hop.
 *
 * A row with no snapshot (everything written before #178) keeps the pre-#178
 * behaviour exactly: the remainder goes onto the current path, one rewrite, no
 * hop. Such a row therefore still survives exactly one move of its target, and
 * is not backfilled — not because the value is unrecorded (`path` is a stored
 * field, so `_pages_v` does hold historical paths and a `createdAt`-bounded
 * migration could reconstruct some of them) but because it cannot be
 * reconstructed RELIABLY: `versions.maxPerDoc: 50` under a 100 ms autosave
 * interval prunes version history long before an old rename's date, so a
 * backfill would leave most rows NULL and silently fill some wrongly. A NULL
 * degrades to exactly the pre-#178 behaviour; a wrong snapshot sends a walk
 * down a wrong branch and is indistinguishable from a right one.
 */
export const resolveRedirect = (
  redirects: CmsRedirect[],
  path: string,
): CmsRedirectTarget | null =>
  resolveThroughHops(redirects, path, {
    exhausted: false,
    remaining: MAX_REDIRECT_HOPS,
  })

/**
 * One step of {@link resolveRedirect}, plus the hop budget it may spend.
 *
 * @param redirects - The same flattened list, unchanged across hops.
 * @param path - The path this step is resolving.
 * @param hops - Shared, mutable budget. See {@link HopBudget}.
 *
 * @remarks Everything in {@link resolveRedirect}'s docblock is the contract for
 * this function; it is separate only because the capture-time rewrite has to
 * re-enter it.
 */
const resolveThroughHops = (
  redirects: CmsRedirect[],
  path: string,
  hops: HopBudget,
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

  // Pass two, in two steps: CHOOSE the row, then act on it. The choice is made
  // over the whole list before any destination is looked at, because a row's
  // destination must never decide which row applies — see rule 4 and the
  // absolute-`to` case below.
  let best: CmsRedirect | null = null
  let bestLength = -1

  for (const redirect of redirects) {
    if (redirect.matchDescendants !== true) continue
    const from = normalizeRedirectPath(redirect.from)
    // The exact case was decided by the pass above; here `from` is a strict
    // ancestor, and the slash is what keeps `/workshops` out of `/work`.
    if (!target.startsWith(`${from}/`)) continue
    // Strictly greater, so a tie keeps the first row in list order.
    if (from.length > bestLength) {
      best = redirect
      bestLength = from.length
    }
  }

  if (!best) return null

  const from = normalizeRedirectPath(best.from)
  const destination = best.to.trim()
  // Both of these mean "the most specific row cannot serve this request", and
  // both therefore mean NO redirect. Falling through to a shorter row here
  // would let a less specific ancestor answer for a subtree a more specific one
  // owns — the same defect rule 4 exists to prevent, arriving by a side door.
  if (!destination || isAbsoluteDestination(destination)) return null
  const permanent = isPermanentRedirect(best.type)
  const remainder = target.slice(from.length)

  // ## The historical hop (#178)
  //
  // The capture-time spelling FIRST, because it is the only form other rows are
  // keyed at. `snapshot` is absent on a pre-#178 row, and then this whole block
  // is skipped and the current-path rewrite below is the answer, exactly as it
  // was before this change.
  const snapshot = best.toPathAtCapture?.trim()
  // A snapshot is always an internal path — the writer builds it with
  // `publicPathFor` — but this function is exported and takes a caller's list,
  // and appending a suffix to a host is a URL it has no business inventing.
  if (snapshot && !isAbsoluteDestination(snapshot)) {
    const captureBase = normalizeRedirectPath(snapshot)
    const viaCapture = `${captureBase === '/' ? '' : captureBase}${remainder}`
    // Asked on THIS rewritten form too, and again on every form a further hop
    // produces: each one is a candidate destination in its own right.
    if (!isAbsoluteDestination(viaCapture) && viaCapture !== target) {
      if (hops.remaining <= 0) {
        // Out of budget: the chain is longer than a real history can be, or it
        // is a cycle. Either way this answer cannot be trusted, and the flag
        // makes every frame above return `null` rather than serve a partial
        // walk as if it had terminated.
        hops.exhausted = true
        return null
      }
      hops.remaining -= 1
      const next = resolveThroughHops(redirects, viaCapture, hops)
      if (hops.exhausted) return null
      // A further hop answered: that is the live URL, and permanence is the
      // product of the whole chain (see the docblock — a 302 anywhere makes the
      // answer temporary).
      if (next)
        return {
          destination: next.destination,
          permanent: permanent && next.permanent,
        }
      // Nothing is keyed at the capture-time spelling. Fall through to the
      // current-path rewrite below rather than serving `viaCapture`.
      //
      // Under a COMPLETE table the two are the same string: if the target had
      // moved since capture there would be a row keyed at the snapshot and the
      // hop would have matched it, so "nothing matched" means the snapshot IS
      // the current path. Under an incomplete one they differ, and the
      // capture-time form is the worse of the two — it is a spelling that was
      // current in the past and may serve nothing now, whereas the current-path
      // rewrite is at least built on a live document's path. The table can be
      // incomplete two ways: an editor deletes an intermediate row (the
      // collection is fully editable in admin), or the row falls outside the
      // {@link REDIRECT_LIMIT} read. Serving the stale form there would be a
      // regression against pre-#178 behaviour, and in the most expensive
      // direction this system has — a 301 to a dead URL, cached by the browser
      // past any server-side retraction.
    }
  }

  const base = normalizeRedirectPath(destination)
  // The root normalises to `/`, so concatenating the suffix directly would
  // spell `//<suffix>` — a protocol-relative URL that leaves the site.
  const rewritten = `${base === '/' ? '' : base}${remainder}`
  // Re-checked on the rewritten form, for the same reason the self-redirect
  // guard below is: only this form can be served.
  if (isAbsoluteDestination(rewritten)) return null
  // The guard on the REWRITTEN destination, which is the only form that can
  // equal the request.
  if (rewritten === target) return null
  return { destination: rewritten, permanent }
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
 * the rows `createPathRedirect` writes), and the shared tier is what lets that
 * purge reach the instance serving the read (#118).
 *
 * **Why the reference join is done by hand.** Rows created by
 * `createPathRedirect` point at a *document*, so the destination path has to be
 * built from that document's current **path** — `publicPathFor`, not
 * `publicPathForSlug`, because a placed post's URL is `/work/x` and its slug
 * spells `/articles/x` (#150). Reading at `depth: 1` would let
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
    select: {
      from: true,
      matchDescendants: true,
      to: true,
      // #178. One more varchar on a row this read already selects — not
      // indexed, and it needs no index: it is never a lookup key in SQL, only
      // in the in-memory walk. It is the only thing that can tell the resolver
      // which spelling a descendant's row was keyed against.
      toPathAtCapture: true,
      type: true,
    },
  })

  const idsByCollection = collectReferenceIds(docs)
  const rowById = new Map<string, PathableDoc>()

  await Promise.all(
    [...idsByCollection.entries()].map(async ([relationTo, ids]) => {
      const { docs: referenced } = await payload.find({
        collection: relationTo,
        depth: 0,
        limit: ids.size,
        overrideAccess: false,
        pagination: false,
        // `path` as well as `slug` (#150): a reference row's destination is the
        // target's CURRENT public URL, and for a placed post or a nested page a
        // slug alone spells the wrong one. Selecting one more indexed column is
        // the whole cost.
        select: { path: true, slug: true },
        where: { id: { in: [...ids] } },
      })
      for (const doc of referenced as Array<PathableDoc & { id?: unknown }>) {
        if (typeof doc.slug !== 'string' && typeof doc.path !== 'string')
          continue
        rowById.set(`${relationTo}:${doc.id}`, {
          path: doc.path,
          slug: doc.slug,
        })
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

    // A row written before M4 added the column, or one an editor left unset,
    // is an exact-only row — the pre-#150 behaviour of every row there is. The
    // key is OMITTED rather than set to `false` in that case, so a flattened
    // exact row is byte-identical to what this function returned before #150
    // and every caller holding one keeps comparing equal.
    const descendants: Pick<CmsRedirect, 'matchDescendants'> =
      (doc as { matchDescendants?: unknown }).matchDescendants === true
        ? { matchDescendants: true }
        : {}

    // #178, and the key is OMITTED when unset for the same reason: a row that
    // predates the column flattens byte-identically to what this function
    // returned before, so every caller holding one keeps comparing equal.
    const rawCapture = (doc as { toPathAtCapture?: unknown }).toPathAtCapture
    const capture: Pick<CmsRedirect, 'toPathAtCapture'> =
      typeof rawCapture === 'string' && rawCapture.trim().length > 0
        ? { toPathAtCapture: rawCapture }
        : {}

    if (to?.type === 'custom') {
      if (typeof to.url === 'string' && to.url.length > 0) {
        redirects.push({ from, ...capture, ...descendants, to: to.url, type })
      }
      continue
    }

    const relationTo = to?.reference?.relationTo
    const value = to?.reference?.value
    if (!relationTo || (typeof value !== 'number' && typeof value !== 'string'))
      continue
    const row = rowById.get(`${relationTo}:${value}`)
    const destination = publicPathFor(relationTo, row)
    if (destination)
      redirects.push({
        from,
        ...capture,
        ...descendants,
        to: destination,
        type,
      })
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
