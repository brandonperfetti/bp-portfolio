import { useEffect, useRef } from 'react'

/** The read side of `useSearchParams()` the hook needs. */
export type FilterSearchParams = Pick<URLSearchParams, 'get' | 'toString'>

/** How long an unconfirmed write is still believed to be on its way. */
const PENDING_WRITE_TTL_MS = 10_000

/** A hard bound, so a router that never lands URLs cannot grow the list. */
const PENDING_WRITE_LIMIT = 8

type PendingWrite = { queryString: string; at: number }

/**
 * Options for {@link useFilterUrlSync}.
 *
 * @typeParam Params - The search-params shape the explorer reads.
 */
export type FilterUrlSyncOptions<
  Params extends FilterSearchParams = FilterSearchParams,
> = {
  /** `useSearchParams()`: the confirmed URL. */
  searchParams: Params
  pathname: string
  router: {
    replace: (href: string, options: { scroll: boolean }) => void
  }
  /** The input's own text, updated on every keystroke. */
  query: string
  /** `query` after the debounce; equals `query` once it has settled. */
  debouncedQuery: string
  /**
   * Every filter other than `query`, serialised. Any stable string that
   * changes exactly when one of them does.
   */
  filterKey: string
  /**
   * The query string the explorer would write for `query` and its current
   * filters, from `currentQueryString` (which keeps unrelated params such as
   * `page`). Must be pure and change identity when the filters do.
   */
  buildQueryString: (currentQueryString: string, query: string) => string
  /**
   * Copies the URL into the explorer's state. `syncQuery` is false when only
   * the other filters need re-reading (their option list changed).
   */
  applyUrl: (params: Params, options: { syncQuery: boolean }) => void
  /** Dev-only label: logs each write decision with `console.debug`. */
  debugLabel?: string
}

/**
 * Keeps an explorer's filter state and its URL in step, for `/articles` and
 * `/tech` (#249, #267, #302, and release finding F1 on #303).
 *
 * @remarks The explorer mirrors filters into the URL with `router.replace`.
 * Every write costs a `history.replaceState`, and Safari throws past 100 of
 * those in ten seconds, so the URL is written only when the READER changed the
 * filters. Three things are tracked apart from the confirmed URL:
 *
 * - **Pending writes.** A `router.replace` lands later, and the reader keeps
 *   typing meanwhile. Each write is remembered until its URL arrives. A URL
 *   that matches one is the echo of the explorer's own write: it never
 *   touches the input (typing is not overwritten), and the next write is
 *   judged against the newest pending URL, not the stale confirmed one. That
 *   is F1: a clear made while `?q=react` was in flight used to compare itself
 *   with the not-yet-moved URL, find nothing to write, and leave `?q=react`
 *   over an unfiltered list.
 * - **External URL changes.** Back/Forward or an in-app link produces a URL
 *   that matches no pending write. The destination wins, focused input or not
 *   (#302): the state is copied from it and nothing is written over it.
 * - **The gate.** The filter state last written or confirmed. A write is made
 *   only when the state differs from it, and it is recorded from the URL only
 *   once the state has caught up with a canonical URL and nothing is pending.
 *
 * A `popstate` forgets every pending write: a traversal moves to an existing
 * entry, so no earlier write can still be about to land on top of it, and a
 * write that never produced a URL change cannot be mistaken for a later
 * traversal to the same URL. Entries also expire after
 * {@link PENDING_WRITE_TTL_MS}.
 *
 * Effects are declared in the order they must run: read the URL, record it,
 * then write.
 */
export function useFilterUrlSync<Params extends FilterSearchParams>({
  searchParams,
  pathname,
  router,
  query,
  debouncedQuery,
  filterKey,
  buildQueryString,
  applyUrl,
  debugLabel,
}: FilterUrlSyncOptions<Params>): void {
  const isDev = process.env.NODE_ENV !== 'production'
  const urlRef = useRef(searchParams.toString())
  const pendingRef = useRef<PendingWrite[]>([])
  const gateRef = useRef<string | null>(null)

  const livePending = () => {
    const now = Date.now()
    pendingRef.current = pendingRef.current.filter(
      (write) => now - write.at < PENDING_WRITE_TTL_MS,
    )
    return pendingRef.current
  }

  useEffect(() => {
    const forgetPending = () => {
      pendingRef.current = []
    }
    // Capture phase, as the history guard does: it must run before Next's own
    // `popstate` listener turns the traversal into a URL change.
    window.addEventListener('popstate', forgetPending, { capture: true })
    return () => {
      window.removeEventListener('popstate', forgetPending, { capture: true })
    }
  }, [])

  // 1. Read the URL.
  useEffect(() => {
    const queryString = searchParams.toString()
    if (queryString === urlRef.current) {
      // Only `applyUrl` changed (an option list); re-read the filters that
      // depend on it and leave the input alone.
      applyUrl(searchParams, { syncQuery: false })
      return
    }
    urlRef.current = queryString

    const pending = livePending()
    const arrived = pending.findIndex(
      (write) => write.queryString === queryString,
    )
    if (arrived !== -1) {
      // Our own write landed (Next may skip the ones before it). The state is
      // already at, or ahead of, this URL: leave it all alone.
      pendingRef.current = pending.slice(arrived + 1)
      return
    }
    pendingRef.current = []
    applyUrl(searchParams, { syncQuery: true })
  }, [searchParams, applyUrl])

  // 2. Record the URL the state has caught up with. Judged on the raw
  // `query` so it lands before the debounce settles. Never while a write is
  // pending: the URL is then behind the state, and recording a state the URL
  // still shows would let a later write be skipped (F1).
  useEffect(() => {
    if (livePending().length > 0) {
      return
    }
    const currentQueryString = searchParams.toString()
    if (buildQueryString(currentQueryString, query) === currentQueryString) {
      gateRef.current = JSON.stringify([query.trim(), filterKey])
    }
  }, [query, filterKey, searchParams, buildQueryString])

  // 3. Write.
  useEffect(() => {
    // A debounce is still pending, so `debouncedQuery` is stale: it is either
    // the reader mid-word or a URL-driven `setQuery` catching up. Either way
    // the write waits for the value to settle, which also folds a chip tap
    // made inside the debounce window into the one write that follows it.
    if (debouncedQuery !== query) {
      return
    }
    const filterState = JSON.stringify([debouncedQuery.trim(), filterKey])
    if (filterState === gateRef.current) {
      return
    }
    gateRef.current = filterState

    const pending = livePending()
    const current = searchParams.toString()
    // What the URL will read once everything already sent has landed.
    const base =
      pending.length > 0 ? pending[pending.length - 1].queryString : current
    const queryString = buildQueryString(base, debouncedQuery)
    if (queryString === base) {
      if (isDev && debugLabel) {
        console.debug(`[${debugLabel}] skip router.replace (no URL change)`, {
          currentQueryString: base,
        })
      }
      return
    }
    if (isDev && debugLabel) {
      console.debug(`[${debugLabel}] apply router.replace`, {
        from: base,
        to: queryString,
      })
    }
    pendingRef.current = [...pending, { queryString, at: Date.now() }].slice(
      -PENDING_WRITE_LIMIT,
    )
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    })
  }, [
    query,
    debouncedQuery,
    filterKey,
    searchParams,
    buildQueryString,
    router,
    pathname,
    isDev,
    debugLabel,
  ])
}
