import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
