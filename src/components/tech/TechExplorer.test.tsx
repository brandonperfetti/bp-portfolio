import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { TechExplorer } from '@/components/tech/TechExplorer'
import type { CmsEntityItem } from '@/lib/cms/types'

/** Reassign before `render` to mount the explorer at a given URL state. */
let searchParamsMock = new URLSearchParams('')
const replaceMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  usePathname: () => '/tech',
  useSearchParams: () => searchParamsMock,
}))

/* eslint-disable @next/next/no-img-element */
vi.mock('next/image', () => ({
  default: (props: any) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img {...props} />
  ),
}))
/* eslint-enable @next/next/no-img-element */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ as: Tag = 'div', children }: any) => (
    <Tag>{children}</Tag>
  ),
}))

/**
 * The `/tech` page size chosen in #88. Kept local so the assertions below pin
 * the contract rather than importing the component's own constant.
 */
const TECH_PAGE_SIZE = 48

/**
 * Rough size of the live tech-stack corpus (#88 records "uses = 16 items
 * measured, tech similar"; the in-tree `CATEGORY_BY_NAME` map names 44). The
 * point of the assertion is that a realistic corpus stays under the threshold.
 */
const CURRENT_TECH_CORPUS = 44

function makeTech(count: number): CmsEntityItem[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `tech-${index + 1}`,
    name: `Tech ${index + 1}`,
    description: `Description ${index + 1}`,
    category: 'Tooling',
  }))
}

// jsdom ships no `matchMedia`, and the #183 anchor reads the shared
// reduced-motion preference through it. Stubbed to "no preference" so the
// anchor takes its smooth-scroll branch (mirrors `CookieBanner.test`).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

beforeEach(() => {
  searchParamsMock = new URLSearchParams('')
  replaceMock.mockClear()
  pushMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('TechExplorer pagination (#88)', () => {
  it('is a no-op at the current corpus size — no control, every card rendered', () => {
    render(<TechExplorer items={makeTech(CURRENT_TECH_CORPUS)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Tech pagination' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Tech 1')).toBeInTheDocument()
    expect(screen.getByText(`Tech ${CURRENT_TECH_CORPUS}`)).toBeInTheDocument()
  })

  it('renders nothing at exactly the page size', () => {
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Tech pagination' }),
    ).not.toBeInTheDocument()
  })

  it('windows once the collection exceeds the page size', () => {
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)

    expect(
      screen.getByRole('navigation', { name: 'Tech pagination' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(`Tech ${TECH_PAGE_SIZE + 1}`),
    ).not.toBeInTheDocument()
  })

  it('renders the page requested by ?page and clamps invalid values', () => {
    searchParamsMock = new URLSearchParams('page=2')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)
    expect(screen.getByText(`Tech ${TECH_PAGE_SIZE + 1}`)).toBeInTheDocument()

    cleanup()

    searchParamsMock = new URLSearchParams('page=nope')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)
    expect(screen.getByText('Tech 1')).toBeInTheDocument()
    expect(
      screen.queryByText(`Tech ${TECH_PAGE_SIZE + 1}`),
    ).not.toBeInTheDocument()
  })

  it('pushes ?page on page navigation, preserving filter params', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('category=Tooling')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))

    expect(pushMock).toHaveBeenCalledWith('/tech?category=Tooling&page=2', {
      scroll: false,
    })
  })

  it('re-anchors scroll and focus to the results list on a page step (#183)', async () => {
    const user = userEvent.setup()
    const items = makeTech(TECH_PAGE_SIZE + 1)
    const { rerender } = render(<TechExplorer items={items} />)
    // Queried by role and name, not by `[tabindex]`: the anchor is a focus
    // target, so it has to announce itself (#183 / `docs/ACCESSIBILITY.md`).
    const results = screen.getByRole('list', { name: 'Tech results' })
    // jsdom implements no layout and no `scrollIntoView`; the stub is the
    // assertion surface.
    const scrollIntoView = vi.fn()
    Object.defineProperty(results, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))
    // `next/navigation` is mocked, so mirror the navigation the push would
    // have caused — that is the render the anchor effect runs in.
    searchParamsMock = new URLSearchParams('page=2')
    rerender(<TechExplorer items={items} />)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    expect(document.activeElement).toBe(results)
  })

  it('drops ?page when a category filter changes', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('page=2')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)

    expect(replaceMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Tooling' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/tech?category=Tooling', {
        scroll: false,
      })
    })
  })
})

/**
 * #249: `/tech` hit Safari's 100-writes-per-10s history throttle in production,
 * and Next's `HistoryUpdater` throws that `SecurityError` in the commit phase —
 * which takes down the whole app, not just the explorer. These pin how many URL
 * writes the explorer itself issues for one burst of input.
 *
 * The URL is mocked, so `router.replace` never moves `searchParamsMock`: a test
 * that wants the URL to move (Back/Forward, an in-app link) reassigns it and
 * re-renders, exactly as a traversal would re-render the explorer.
 */
describe('TechExplorer URL writes per burst (#249)', () => {
  it('never writes stale filter state over a URL that moved under a blurred input (Back/link)', () => {
    const items = makeTech(3)
    const { rerender } = render(<TechExplorer items={items} />)
    expect(replaceMock).not.toHaveBeenCalled()

    // Back to an entry the reader had filtered: the URL is now the source of truth.
    searchParamsMock = new URLSearchParams('q=react&category=Tooling')
    rerender(<TechExplorer items={items} />)
    // And forward again.
    searchParamsMock = new URLSearchParams('')
    rerender(<TechExplorer items={items} />)

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('issues zero writes for a burst of ten Back/Forward traversals', async () => {
    const items = makeTech(3)
    const { rerender } = render(<TechExplorer items={items} />)

    for (let i = 0; i < 10; i++) {
      searchParamsMock = new URLSearchParams('q=react')
      rerender(<TechExplorer items={items} />)
      searchParamsMock = new URLSearchParams('category=Tooling')
      rerender(<TechExplorer items={items} />)
    }
    // Past the 350 ms debounce, so a pending write would have landed.
    await new Promise((resolve) => setTimeout(resolve, 450))

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('a chip tap inside the typing debounce writes once, not twice', async () => {
    const user = userEvent.setup()
    render(<TechExplorer items={makeTech(3)} />)

    await user.type(
      screen.getByRole('searchbox', { name: 'Search technologies' }),
      'tech',
    )
    await user.click(screen.getByRole('button', { name: 'Tooling' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        '/tech?q=tech&category=Tooling',
        { scroll: false },
      )
    })
    expect(replaceMock).toHaveBeenCalledTimes(1)
  })

  it('a clear made inside the debounce after a traversal still clears the URL', async () => {
    // CodeRabbit on PR #271: Back/Forward to `?q=react` syncs `query` while
    // `debouncedQuery` is still '' for 350 ms. A clear inside that window
    // returned the filters to the state the write gate last recorded (''),
    // so the gate skipped the write: an unfiltered list under `?q=react`.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const items = makeTech(3)
      const { rerender } = render(<TechExplorer items={items} />)

      searchParamsMock = new URLSearchParams('q=react')
      rerender(<TechExplorer items={items} />)
      const box = screen.getByRole('searchbox', { name: 'Search technologies' })
      expect(box).toHaveValue('react')

      await user.clear(box)
      await vi.advanceTimersByTimeAsync(450)

      expect(box).toHaveValue('')
      expect(replaceMock).toHaveBeenCalledWith('/tech', { scroll: false })
      expect(replaceMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('still rewrites a non-canonical URL once on load', async () => {
    // The gate records a URL only when it is exactly what the explorer would
    // write, so `?sort=name` (the default, spelled out) is still dropped.
    searchParamsMock = new URLSearchParams('sort=name')
    render(<TechExplorer items={makeTech(3)} />)

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/tech', { scroll: false })
    })
    expect(replaceMock).toHaveBeenCalledTimes(1)
  })

  it('a type-and-clear burst on a clean URL issues no writes at all', async () => {
    const user = userEvent.setup()
    render(<TechExplorer items={makeTech(3)} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })

    for (let i = 0; i < 10; i++) {
      await user.type(box, 're')
      await user.clear(box)
    }
    await new Promise((resolve) => setTimeout(resolve, 450))

    expect(replaceMock).not.toHaveBeenCalled()
  })
})

describe('TechExplorer focused input and URL changes (#302, release finding F1)', () => {
  const focusItems = makeTech(3)

  /** The URL a mocked `router.replace` has been asked for, not yet landed. */
  let inFlight: string[] = []

  beforeEach(() => {
    inFlight = []
    replaceMock.mockImplementation((href: string) => {
      inFlight.push(href)
    })
  })

  afterEach(() => {
    replaceMock.mockReset()
  })

  const queryOf = (href: string) =>
    new URLSearchParams(href.split('?')[1] ?? '')

  /** Lands the oldest in-flight write, as Next would after its navigation. */
  function landNext(rerender: (ui: React.ReactElement) => void) {
    const href = inFlight.shift()
    if (href === undefined) throw new Error('nothing in flight')
    searchParamsMock = queryOf(href)
    act(() => rerender(<TechExplorer items={focusItems} />))
  }

  function traverseTo(
    rerender: (ui: React.ReactElement) => void,
    search: string,
  ) {
    // Back/Forward moves the entry; the focused input does not blur.
    searchParamsMock = new URLSearchParams(search)
    act(() => rerender(<TechExplorer items={focusItems} />))
  }

  it('a Back/Forward that changes only q syncs the focused input, the URL and the list (#302)', async () => {
    searchParamsMock = new URLSearchParams('q=Tech+2')
    const { rerender } = render(<TechExplorer items={focusItems} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })
    await userEvent.setup().click(box)
    expect(box).toHaveFocus()
    expect(box).toHaveValue('Tech 2')

    traverseTo(rerender, 'q=Tech+3')

    expect(box).toHaveFocus()
    expect(box).toHaveValue('Tech 3')
    await waitFor(
      () => {
        expect(screen.getByText('Tech 3')).toBeInTheDocument()
        expect(screen.queryByText('Tech 2')).not.toBeInTheDocument()
      },
      { timeout: 2000 },
    )
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('a Back/Forward that changes q and another filter writes nothing over the entry (#302)', async () => {
    searchParamsMock = new URLSearchParams('q=Tech+2')
    const { rerender } = render(<TechExplorer items={focusItems} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })
    await userEvent.setup().click(box)

    traverseTo(rerender, 'sort=active')

    expect(box).toHaveFocus()
    expect(box).toHaveValue('')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it("typing is never overwritten by the echo of the explorer's own write (#302)", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TechExplorer items={focusItems} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })

    await user.type(box, 'tech')
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    })
    // The reader keeps typing while that write is still in flight.
    await user.type(box, 'x')
    landNext(rerender)

    expect(box).toHaveFocus()
    expect(box).toHaveValue('techx')
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    })
    expect(replaceMock).toHaveBeenLastCalledWith('/tech?q=techx', {
      scroll: false,
    })
    landNext(rerender)
    expect(box).toHaveValue('techx')
  })

  it("F1: a clear made while the explorer's own write is in flight converges the URL and the list", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TechExplorer items={focusItems} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })

    await user.type(box, 'tech')
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    })
    expect(replaceMock).toHaveBeenLastCalledWith('/tech?q=tech', {
      scroll: false,
    })

    // Still focused, the reader clears the box before the first write lands.
    await user.clear(box)
    expect(box).toHaveFocus()

    // The delayed navigations now land, oldest first.
    while (inFlight.length > 0) {
      landNext(rerender)
    }
    await new Promise((resolve) => setTimeout(resolve, 700))
    while (inFlight.length > 0) {
      landNext(rerender)
    }

    expect(box).toHaveValue('')
    expect(searchParamsMock.get('q') ?? '').toBe('')
    expect(
      screen.queryByText('Tech 1') !== null &&
        screen.queryByText('Tech 3') !== null,
    ).toBe(true)
  })

  it('F1: the same holds when Next skips the first URL and lands only the last', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TechExplorer items={focusItems} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })

    await user.type(box, 'tech')
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    })
    await user.clear(box)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(2))

    inFlight.shift()
    landNext(rerender)
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(box).toHaveValue('')
    expect(searchParamsMock.get('q') ?? '').toBe('')
    expect(replaceMock).toHaveBeenCalledTimes(2)
  })

  it('a traversal after the write has landed is not mistaken for its echo', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TechExplorer items={focusItems} />)
    const box = screen.getByRole('searchbox', { name: 'Search technologies' })

    await user.type(box, 'tech')
    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    })
    landNext(rerender)
    traverseTo(rerender, '')
    expect(box).toHaveValue('')
    traverseTo(rerender, 'q=tech')
    expect(box).toHaveValue('tech')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(replaceMock).toHaveBeenCalledTimes(1)
  })
})
