import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import type { ArticleWithSlug } from '@/lib/articles'

const searchParamsMock = new URLSearchParams('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => {} }),
  usePathname: () => '/articles',
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
