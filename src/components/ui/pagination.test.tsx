import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ListPagination,
  PAGE_PARAM,
  buildPageQueryString,
  getPageCount,
  getPageItems,
  getPageWindow,
  parsePageParam,
} from '@/components/ui/pagination'

afterEach(() => {
  cleanup()
})

/**
 * Unit coverage for the #88 URL contract as it is implemented under option
 * (b): parsing, clamping, windowing, query-string rewriting, and the
 * `total > pageSize` render threshold.
 */
describe('pagination helpers', () => {
  it('exposes a single page param name', () => {
    expect(PAGE_PARAM).toBe('page')
  })

  describe('getPageCount', () => {
    it('never reports fewer than one page', () => {
      expect(getPageCount(0, 12)).toBe(1)
      expect(getPageCount(-5, 12)).toBe(1)
    })

    it('keeps a full page at the threshold and adds one past it', () => {
      expect(getPageCount(12, 12)).toBe(1)
      expect(getPageCount(13, 12)).toBe(2)
    })

    it('matches the 52-post corpus at the articles page size', () => {
      expect(getPageCount(52, 12)).toBe(5)
    })

    it('treats a nonsensical page size as one', () => {
      expect(getPageCount(3, 0)).toBe(3)
    })
  })

  describe('parsePageParam', () => {
    it('defaults to page 1 when the param is absent', () => {
      expect(parsePageParam(null, 5)).toBe(1)
      expect(parsePageParam(undefined, 5)).toBe(1)
    })

    it('reads a valid in-range page', () => {
      expect(parsePageParam('2', 5)).toBe(2)
      expect(parsePageParam(' 3 ', 5)).toBe(3)
      expect(parsePageParam('05', 5)).toBe(5)
    })

    it('clamps non-numeric input to page 1 rather than throwing or 404ing', () => {
      expect(parsePageParam('', 5)).toBe(1)
      expect(parsePageParam('abc', 5)).toBe(1)
      expect(parsePageParam('2.5', 5)).toBe(1)
      expect(parsePageParam('1e3', 5)).toBe(1)
      expect(parsePageParam('-2', 5)).toBe(1)
      expect(parsePageParam('NaN', 5)).toBe(1)
    })

    it('clamps out-of-range input to page 1', () => {
      expect(parsePageParam('0', 5)).toBe(1)
      expect(parsePageParam('6', 5)).toBe(1)
      expect(parsePageParam('99', 5)).toBe(1)
    })
  })

  describe('getPageItems', () => {
    const items = Array.from({ length: 13 }, (_, index) => index + 1)

    it('windows to the requested page', () => {
      expect(getPageItems(items, 1, 12)).toHaveLength(12)
      expect(getPageItems(items, 2, 12)).toEqual([13])
    })

    it('returns the whole collection when it fits on one page', () => {
      expect(getPageItems(items.slice(0, 12), 1, 12)).toHaveLength(12)
    })

    it('returns nothing past the end without throwing', () => {
      expect(getPageItems(items, 9, 12)).toEqual([])
    })
  })

  describe('buildPageQueryString', () => {
    it('drops the param for page 1 so the first page has one URL', () => {
      expect(buildPageQueryString('page=3', 1)).toBe('')
      expect(buildPageQueryString('q=react&page=3', 1)).toBe('q=react')
    })

    it('sets the param for later pages, preserving filter params', () => {
      expect(buildPageQueryString('q=react&topic=React', 2)).toBe(
        'q=react&topic=React&page=2',
      )
    })

    it('replaces an existing page value in place', () => {
      expect(buildPageQueryString('page=2&q=react', 4)).toBe('page=4&q=react')
    })

    it('accepts URLSearchParams as well as a raw string', () => {
      expect(buildPageQueryString(new URLSearchParams('topic=Node'), 3)).toBe(
        'topic=Node&page=3',
      )
    })
  })

  describe('getPageWindow', () => {
    it('lists every page for a short range', () => {
      expect(getPageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
      expect(getPageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('collapses a long range around the current page', () => {
      expect(getPageWindow(10, 20)).toEqual([
        1,
        'ellipsis',
        9,
        10,
        11,
        'ellipsis',
        20,
      ])
    })

    it('keeps the first and last page reachable at either end', () => {
      expect(getPageWindow(1, 20)).toEqual([1, 2, 'ellipsis', 20])
      expect(getPageWindow(20, 20)).toEqual([1, 'ellipsis', 19, 20])
    })
  })
})

describe('ListPagination', () => {
  const buildHref = (page: number) =>
    page <= 1 ? '/articles' : `/articles?page=${page}`

  function renderControl(
    page: number,
    totalPages: number,
    onNavigate = vi.fn(),
  ) {
    render(
      <ListPagination
        page={page}
        totalPages={totalPages}
        buildHref={buildHref}
        onNavigate={onNavigate}
        label="Articles pagination"
      />,
    )
    return onNavigate
  }

  it('renders nothing at or below the threshold (total <= pageSize)', () => {
    renderControl(1, 1)

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders a labelled navigation landmark above the threshold', () => {
    renderControl(1, 5)

    expect(
      screen.getByRole('navigation', { name: 'Articles pagination' }),
    ).toBeInTheDocument()
  })

  it('marks only the current page with aria-current', () => {
    renderControl(3, 5)

    const nav = screen.getByRole('navigation', { name: 'Articles pagination' })
    const current = within(nav).getByRole('link', { name: 'Go to page 3' })
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: 'Go to page 2' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('omits Previous on the first page and Next on the last', () => {
    renderControl(1, 3)
    expect(screen.queryByRole('link', { name: /previous/i })).toBeNull()
    expect(screen.getByRole('link', { name: /next/i })).toBeInTheDocument()

    cleanup()

    renderControl(3, 3)
    expect(screen.getByRole('link', { name: /previous/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /next/i })).toBeNull()
  })

  it('gives every control a real, shareable href', () => {
    renderControl(2, 3)

    expect(screen.getByRole('link', { name: 'Go to page 1' })).toHaveAttribute(
      'href',
      '/articles',
    )
    expect(screen.getByRole('link', { name: 'Go to page 3' })).toHaveAttribute(
      'href',
      '/articles?page=3',
    )
    expect(screen.getByRole('link', { name: /previous/i })).toHaveAttribute(
      'href',
      '/articles',
    )
    expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute(
      'href',
      '/articles?page=3',
    )
  })

  it('navigates client-side on a plain click', async () => {
    const user = userEvent.setup()
    const onNavigate = renderControl(2, 5)

    await user.click(screen.getByRole('link', { name: 'Go to page 4' }))

    expect(onNavigate).toHaveBeenCalledWith(4)
  })

  it('steps by one via Previous and Next', async () => {
    const user = userEvent.setup()
    const onNavigate = renderControl(3, 5)

    await user.click(screen.getByRole('link', { name: /previous/i }))
    expect(onNavigate).toHaveBeenLastCalledWith(2)

    await user.click(screen.getByRole('link', { name: /next/i }))
    expect(onNavigate).toHaveBeenLastCalledWith(4)
  })

  it('leaves modified clicks to the browser so the href still opens a new tab', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    // Hash hrefs: jsdom implements hash navigation, so the un-prevented
    // modified click this test asserts on does not trip its
    // "Not implemented: navigation" virtual-console error.
    render(
      <ListPagination
        page={2}
        totalPages={5}
        buildHref={(page) => `#page-${page}`}
        onNavigate={onNavigate}
        label="Articles pagination"
      />,
    )

    await user.keyboard('{Meta>}')
    await user.click(screen.getByRole('link', { name: 'Go to page 4' }))
    await user.keyboard('{/Meta}')

    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('renders gap markers with a screen-reader label for long ranges', () => {
    renderControl(10, 20)

    expect(screen.getAllByText('More pages').length).toBeGreaterThan(0)
  })
})
