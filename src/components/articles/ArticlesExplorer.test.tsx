import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
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

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import type { ArticleWithSlug } from '@/lib/articles'

/**
 * Mutable so a test can mount the explorer at a given URL state (`?page=2`,
 * `?page=abc`, …). Reassign it *before* `render`; the mock reads it lazily.
 */
let searchParamsMock = new URLSearchParams('')
const replaceMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  usePathname: () => '/articles',
  useSearchParams: () => searchParamsMock,
}))

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

afterEach(() => {
  cleanup()
})

describe('ArticlesExplorer', () => {
  it('renders empty state copy when no articles are available', () => {
    render(<ArticlesExplorer articles={[]} />)

    expect(screen.getByText('No articles found.')).toBeInTheDocument()
  })

  it('shows a distinct tech chip when topic and first tech value would otherwise duplicate', () => {
    const articles: ArticleWithSlug[] = [
      {
        slug: 'react-form-zod',
        title: "Building Form Validation You Don't Hate",
        description: 'React Hook Form + Zod walkthrough.',
        author: 'Brandon Perfetti',
        date: '2026-03-01',
        topics: ['react'],
        tech: ['react', 'zod'],
        searchText: 'react zod form validation',
      },
    ]

    render(<ArticlesExplorer articles={articles} />)

    const articleTitle = screen.getByText(
      "Building Form Validation You Don't Hate",
    )
    const articleCard = articleTitle.closest('article')
    expect(articleCard).toBeInTheDocument()
    const articleCardScope = within(articleCard as HTMLElement)

    expect(articleCardScope.getByText('react')).toBeInTheDocument()
    expect(articleCardScope.getByText('zod')).toBeInTheDocument()
  })

  it('filters visible cards by search query', async () => {
    const user = userEvent.setup()
    const articles: ArticleWithSlug[] = [
      {
        slug: 'react-form-zod',
        title: 'React Forms with Zod',
        description: 'Form validation workflow.',
        author: 'Brandon Perfetti',
        date: '2026-03-01',
        topics: ['React'],
        tech: ['Zod'],
        searchText: 'react zod forms',
      },
      {
        slug: 'postgresql-offset',
        title: 'Pagination with PostgreSQL',
        description: 'Offset versus cursor pagination.',
        author: 'Brandon Perfetti',
        date: '2026-03-02',
        topics: ['Databases'],
        tech: ['PostgreSQL'],
        searchText: 'postgresql cursor pagination',
      },
    ]

    render(<ArticlesExplorer articles={articles} />)

    const searchInput = screen.getByPlaceholderText('Search articles')
    await user.type(searchInput, 'postgresql')

    await waitFor(() => {
      expect(screen.getByText('Pagination with PostgreSQL')).toBeInTheDocument()
      expect(screen.queryByText('React Forms with Zod')).not.toBeInTheDocument()
    })
  })

  it('filters visible cards by selected topic chip', async () => {
    const user = userEvent.setup()
    const articles: ArticleWithSlug[] = [
      {
        slug: 'react-observer-pattern',
        title: 'Observer Pattern in React',
        description: 'Practical observer pattern in component apps.',
        author: 'Brandon Perfetti',
        date: '2026-03-03',
        topics: ['React'],
        tech: ['TypeScript'],
        searchText: 'observer react typescript',
      },
      {
        slug: 'node-workers',
        title: 'Worker Threads in Node.js',
        description: 'Concurrency with worker threads.',
        author: 'Brandon Perfetti',
        date: '2026-03-04',
        topics: ['Node.js'],
        tech: ['TypeScript'],
        searchText: 'node worker threads',
      },
    ]

    render(<ArticlesExplorer articles={articles} />)

    await user.click(screen.getByRole('button', { name: 'React' }))

    await waitFor(() => {
      expect(screen.getByText('Observer Pattern in React')).toBeInTheDocument()
      expect(
        screen.queryByText('Worker Threads in Node.js'),
      ).not.toBeInTheDocument()
    })
  })
})

/** Articles page size decided in #88; kept local so the test asserts the contract. */
const ARTICLES_PAGE_SIZE = 12

function makeArticles(count: number): ArticleWithSlug[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `article-${index + 1}`,
    title: `Article ${index + 1}`,
    description: `Description ${index + 1}`,
    author: 'Brandon Perfetti',
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    topics: index % 2 === 0 ? ['React'] : ['Node.js'],
    tech: ['TypeScript'],
    searchText: `article ${index + 1}`,
  }))
}

const renderedTitles = () =>
  screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)

describe('ArticlesExplorer pagination (#88)', () => {
  it('renders no pagination control at or below the page size', () => {
    render(<ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Articles pagination' }),
    ).not.toBeInTheDocument()
    expect(renderedTitles()).toHaveLength(ARTICLES_PAGE_SIZE)
  })

  it('windows to the first page once the set exceeds the page size', () => {
    render(<ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE + 1)} />)

    expect(
      screen.getByRole('navigation', { name: 'Articles pagination' }),
    ).toBeInTheDocument()
    expect(renderedTitles()).toHaveLength(ARTICLES_PAGE_SIZE)
    expect(screen.getByText('Article 1')).toBeInTheDocument()
    expect(screen.queryByText('Article 13')).not.toBeInTheDocument()
  })

  it('renders the page requested by ?page', () => {
    searchParamsMock = new URLSearchParams('page=2')
    render(<ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE + 1)} />)

    expect(renderedTitles()).toEqual(['Article 13'])
    expect(screen.getByRole('link', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it.each(['abc', '0', '-3', '2.5', '99'])(
    'clamps an invalid ?page=%s to the first page instead of 404ing',
    (raw) => {
      searchParamsMock = new URLSearchParams(`page=${raw}`)
      render(
        <ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE + 1)} />,
      )

      expect(screen.getByText('Article 1')).toBeInTheDocument()
      expect(screen.queryByText('Article 13')).not.toBeInTheDocument()
    },
  )

  it('pushes ?page on page navigation so the back button restores position', async () => {
    const user = userEvent.setup()
    render(<ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE + 1)} />)

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))

    expect(pushMock).toHaveBeenCalledWith('/articles?page=2', { scroll: false })
    // The filter mirror stays on `replace` — paging must not go through it.
    expect(replaceMock).not.toHaveBeenCalledWith(
      expect.stringContaining('page='),
      expect.anything(),
    )
  })

  it('keeps existing filter params when paging', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('q=article&topic=React')
    render(<ArticlesExplorer articles={makeArticles(40)} />)

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))

    expect(pushMock).toHaveBeenCalledWith(
      '/articles?q=article&topic=React&page=2',
      { scroll: false },
    )
  })

  it('drops ?page when the topic filter changes', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('page=2')
    render(<ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE + 1)} />)

    // Mounting at an unchanged filter state must not write anything: the
    // skip-when-no-URL-change guard still owns that decision.
    expect(replaceMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'React' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/articles?topic=React', {
        scroll: false,
      })
    })
  })

  it('re-anchors scroll and focus to the results grid on a page step (#183)', async () => {
    const user = userEvent.setup()
    const articles = makeArticles(ARTICLES_PAGE_SIZE + 1)
    const { container, rerender } = render(
      <ArticlesExplorer articles={articles} />,
    )
    const results = container.querySelector('[tabindex="-1"]') as HTMLElement
    // jsdom implements no layout and no `scrollIntoView`; the stub is the
    // assertion surface.
    const scrollIntoView = vi.fn()
    Object.defineProperty(results, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))
    // `next/navigation` is mocked, so nothing re-renders on its own — mirror
    // the navigation the push would have caused, which is the render the
    // anchor effect actually runs in.
    searchParamsMock = new URLSearchParams('page=2')
    rerender(<ArticlesExplorer articles={articles} />)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    expect(document.activeElement).toBe(results)
  })

  it('drops ?page when the search query changes', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('page=2')
    render(<ArticlesExplorer articles={makeArticles(ARTICLES_PAGE_SIZE + 1)} />)

    await user.type(screen.getByPlaceholderText('Search articles'), 'article 3')

    await waitFor(
      () => {
        expect(replaceMock).toHaveBeenCalled()
      },
      { timeout: 2000 },
    )
    const [href] = replaceMock.mock.calls.at(-1) as [string]
    expect(href).toContain('q=article')
    expect(href).not.toContain('page=')
  })
})

/**
 * #151 — the two chip populations must stay different things.
 *
 * `ArticleMeta`'s topic chips became `<Link>`s so a reader can reach a topic's
 * section home. These chips look identical and must **not** follow: they are
 * state toggles on a static, client-filtered route, and turning one into an
 * anchor would navigate away from the very view it is meant to filter.
 */
describe('ArticlesExplorer filter chips never navigate (#151)', () => {
  const articles: ArticleWithSlug[] = [
    {
      slug: 'react-observer-pattern',
      title: 'Observer Pattern in React',
      description: 'Practical observer pattern in component apps.',
      author: 'Brandon Perfetti',
      date: '2026-03-03',
      topics: ['Leadership'],
      topicLinks: [{ title: 'Leadership', sectionPath: 'work/leadership' }],
      tech: ['TypeScript'],
      searchText: 'observer react typescript',
    },
  ]

  it('renders a topic filter as a button, not a link — even when that topic has a section home', () => {
    render(<ArticlesExplorer articles={articles} />)

    const chip = screen.getByRole('button', { name: 'Leadership' })
    expect(chip.tagName).toBe('BUTTON')
    expect(
      screen.queryByRole('link', { name: 'Leadership' }),
    ).not.toBeInTheDocument()
  })

  it('mirrors the filter through router.replace instead of navigating', async () => {
    const user = userEvent.setup()
    render(<ArticlesExplorer articles={articles} />)

    await user.click(screen.getByRole('button', { name: 'Leadership' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    // `replace`, never `push`: a filter change is not a history entry, and it
    // is certainly not a navigation to /work/leadership.
    expect(pushMock).not.toHaveBeenCalled()
    const [href] = replaceMock.mock.calls.at(-1) as [string]
    expect(href).toContain('topic=Leadership')
    expect(href).not.toContain('/work/leadership')
  })
})

/**
 * #154 — "View the ⟨X⟩ section →".
 *
 * The affordance the #151 chips deliberately are not. It appears only when
 * *exactly one* filter is active and that filter names a category with a
 * published section home; it is a real `<Link>`, and it never displaces the
 * chips it sits beside.
 */
describe('ArticlesExplorer section affordance (#154)', () => {
  const articles: ArticleWithSlug[] = [
    {
      slug: 'what-a-staff-engineer-owns',
      title: 'What a staff engineer actually owns',
      description: 'Scope is not headcount.',
      author: 'Brandon Perfetti',
      date: '2026-08-11',
      topics: ['Leadership'],
      tech: ['TypeScript'],
      searchText: 'staff engineer scope',
    },
    {
      slug: 'postgres-row-level-security',
      title: 'Row level security, without the footguns',
      description: 'Default deny, then earn every policy.',
      author: 'Brandon Perfetti',
      date: '2026-06-18',
      topics: ['Databases'],
      tech: ['PostgreSQL'],
      searchText: 'postgres rls',
    },
  ]

  const sectionPaths = { leadership: 'work/leadership' }

  const filterTo = async (label: string) => {
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: label }))
  }

  it('offers the section home when one category filter is active', async () => {
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)
    await filterTo('Leadership')

    const link = await screen.findByRole('link', {
      name: 'View the Leadership section',
    })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/work/leadership')
  })

  it('keeps the arrow out of the accessible name', async () => {
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)
    await filterTo('Leadership')

    const link = await screen.findByRole('link', {
      name: 'View the Leadership section',
    })
    // Visible glyph, hidden from assistive tech — which is why the name above
    // resolves without it.
    expect(link.textContent).toContain('→')
    expect(link.querySelector('[aria-hidden="true"]')?.textContent).toBe('→')
  })

  it('stays hidden for a category with no section home', async () => {
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)
    await filterTo('Databases')

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('link', { name: /View the/ })).toBeNull()
  })

  it('stays hidden for a tag whose name matches no homed category', async () => {
    // Only categories can have a home, so a tag normally misses — silently.
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)
    await filterTo('TypeScript')

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled()
    })
    expect(screen.queryByRole('link', { name: /View the/ })).toBeNull()
  })

  it('DOES offer the section for a tag named exactly like a homed category', async () => {
    // The intended outcome, pinned rather than left to chance. `sectionPaths`
    // is keyed on the title and the filter pool merges topic and tag names into
    // one flat, deduped string[], so a tag called "Leadership" resolves the
    // Leadership section — and should: the reader filtered on that name and a
    // section of that name exists, so the link is correct and honest about
    // where it goes.
    //
    // Suppressing it would require knowing which pool the chip came from, which
    // means widening that pool from strings to objects and rippling through the
    // matcher, the chip counting and their tests (the cost `CmsTopic`'s
    // docblock records for #151) — paid to make a correct link disappear.
    //
    // No article here carries Leadership as a *topic*, so the chip clicked
    // below can only have come from `tech`.
    const tagOnly: ArticleWithSlug[] = [
      {
        slug: 'a-tag-named-leadership',
        title: 'Notes from a team that ran itself',
        description: 'Filed under databases, tagged leadership.',
        author: 'Brandon Perfetti',
        date: '2026-05-04',
        topics: ['Databases'],
        tech: ['Leadership'],
        searchText: 'self-managing team notes',
      },
    ]

    render(<ArticlesExplorer articles={tagOnly} sectionPaths={sectionPaths} />)
    await filterTo('Leadership')

    expect(
      await screen.findByRole('link', { name: 'View the Leadership section' }),
    ).toHaveAttribute('href', '/work/leadership')
  })

  it("stays hidden for 'All' — no filter, no destination", () => {
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)

    expect(screen.queryByRole('link', { name: /View the/ })).toBeNull()
  })

  it('stays hidden when no topic has a home at all (the default)', async () => {
    render(<ArticlesExplorer articles={articles} />)
    await filterTo('Leadership')

    expect(screen.queryByRole('link', { name: /View the/ })).toBeNull()
  })

  it('matches the category case-insensitively, as the filter layer does', async () => {
    searchParamsMock = new URLSearchParams('topic=leadership')
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)

    expect(
      await screen.findByRole('link', { name: /View the .* section/ }),
    ).toHaveAttribute('href', '/work/leadership')
  })

  it('does not interrupt the chip run in the tab order', async () => {
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)
    await filterTo('Leadership')

    const link = await screen.findByRole('link', {
      name: 'View the Leadership section',
    })
    const focusables = Array.from(
      document.querySelectorAll<HTMLElement>('button, a[href], input'),
    )
    // Last in the filter card: every chip precedes it, so no chip is displaced.
    const chips = focusables.filter((el) => el.tagName === 'BUTTON')
    expect(focusables.indexOf(link)).toBeGreaterThan(
      focusables.indexOf(chips.at(-1) as HTMLElement),
    )
  })

  it('disappears again when the filter is cleared', async () => {
    render(<ArticlesExplorer articles={articles} sectionPaths={sectionPaths} />)
    await filterTo('Leadership')
    await screen.findByRole('link', { name: 'View the Leadership section' })

    await filterTo('All')

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /View the/ })).toBeNull()
    })
  })
})
