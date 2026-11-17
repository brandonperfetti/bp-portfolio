import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { type FilterUrlSyncOptions, useFilterUrlSync } from './useFilterUrlSync'

/**
 * Pins the hook's pending-write limit (#305, N3 on #304).
 *
 * @remarks The explorer tests (`ArticlesExplorer.test.tsx`,
 * `TechExplorer.test.tsx`) cover the hook's behaviour through the surfaces,
 * including the 10 s TTL. They never queue enough unconfirmed writes to reach
 * the list's size bound, so every one of them passed with the limit set to 1.
 * This file drives the hook directly to do exactly that.
 */

const buildQueryString = (_current: string, query: string) =>
  query ? `q=${query}` : ''

type Props = Pick<
  FilterUrlSyncOptions,
  'searchParams' | 'query' | 'debouncedQuery'
>

/**
 * Renders the hook on a URL that never moves and sends `count` writes
 * (`q=w1` … `q=wN`), none of which lands.
 */
function queueWrites(count: number) {
  const replace = vi.fn()
  const applyUrl = vi.fn()
  const router = { replace }
  const confirmed = new URLSearchParams('')
  const props = (query: string, searchParams = confirmed): Props => ({
    searchParams,
    query,
    debouncedQuery: query,
  })

  const view = renderHook(
    (current: Props) =>
      useFilterUrlSync({
        ...current,
        pathname: '/articles',
        router,
        filterKey: '',
        buildQueryString,
        applyUrl,
      }),
    { initialProps: props('') },
  )
  for (let n = 1; n <= count; n += 1) {
    view.rerender(props(`w${n}`))
  }
  expect(replace).toHaveBeenCalledTimes(count)
  applyUrl.mockClear()

  /** The URL changes to `queryString` while the input still holds the last write. */
  const arrive = (queryString: string) =>
    view.rerender(props(`w${count}`, new URLSearchParams(queryString)))

  return { applyUrl, arrive }
}

/** True when the hook copied the URL into the explorer's state (a destination). */
const tookUrlAsDestination = (applyUrl: ReturnType<typeof vi.fn>) =>
  applyUrl.mock.calls.some(
    ([, options]) => (options as { syncQuery: boolean }).syncQuery,
  )

describe('useFilterUrlSync pending-write limit', () => {
  it('still recognises the 8th-newest unconfirmed write as its own echo', () => {
    // Nine writes are queued, so the 8th-newest is the second one sent.
    const { applyUrl, arrive } = queueWrites(9)

    arrive('q=w2')

    expect(tookUrlAsDestination(applyUrl)).toBe(false)
  })

  it('forgets the 9th-newest: its late echo is treated as a destination', () => {
    // The known bound the TSDoc records: past eight unconfirmed writes the
    // oldest is dropped, so its URL is copied into the input when it lands.
    const { applyUrl, arrive } = queueWrites(9)

    arrive('q=w1')

    expect(tookUrlAsDestination(applyUrl)).toBe(true)
  })
})
