import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArticlesArchiveBlock } from '@/payload-types'

const getAllArticles = vi.fn()

vi.mock('@/lib/articles', () => ({
  getAllArticles: () => getAllArticles(),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// GSAP wrapper: jsdom has no matchMedia, and the hover choreography is a
// browser fact — the stories assert it.
vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ children }: any) => (
    <div data-hover-motion-card>{children}</div>
  ),
}))
// GSAP wrapper (registers ScrollTrigger at import, which needs matchMedia):
// the opt-in `revealOnScroll` reveal is a browser fact the stories assert.
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: any) => <div data-scroll-reveal>{children}</div>,
}))

const { ArticlesArchiveComponent } =
  await import('@/blocks/ArticlesArchive/Component')

const article = (n: number) => ({
  slug: `article-${n}`,
  title: `Article ${n}`,
  date: '2026-01-0' + ((n % 9) + 1),
  description: `Description ${n}`,
  searchText: '',
})

const block = (
  overrides: Partial<ArticlesArchiveBlock> = {},
): ArticlesArchiveBlock =>
  ({ blockType: 'articlesArchive', ...overrides }) as ArticlesArchiveBlock

/**
 * The server half of #34: how many articles the block asks for and which
 * treatment it hands them to. The pixels live in `ArticlesArchiveView`
 * (stories) and its parity with the home page in `homeParity.test.ts`.
 */
describe('ArticlesArchiveComponent', () => {
  beforeEach(() => {
    getAllArticles.mockReset()
    getAllArticles.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => article(index + 1)),
    )
  })

  it('defaults to three cards in the grid treatment', async () => {
    render(await ArticlesArchiveComponent(block()))

    expect(screen.getAllByRole('article')).toHaveLength(3)
    // The grid's browse-all link, which the stacked treatment has not got.
    expect(
      screen.getByRole('link', { name: /Browse all articles/ }),
    ).toHaveAttribute('href', '/articles')
  })

  it('honours limit in either treatment — the home page shows seven', async () => {
    const { unmount } = render(
      await ArticlesArchiveComponent(block({ limit: 7, variant: 'stacked' })),
    )
    expect(screen.getAllByRole('article')).toHaveLength(7)
    unmount()

    render(await ArticlesArchiveComponent(block({ limit: 5 })))
    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('renders the home treatment for the stacked variant: full-card link, no browse link', async () => {
    const { container } = render(
      await ArticlesArchiveComponent(block({ variant: 'stacked', limit: 2 })),
    )

    expect(
      screen.getByRole('link', { name: 'Read article: Article 1' }),
    ).toHaveAttribute('href', '/articles/article-1')
    expect(container.querySelectorAll('[data-hover-overlay]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-hover-motion-card]')).toHaveLength(
      2,
    )
    expect(screen.queryByText(/Browse all articles/)).toBeNull()
  })

  it('keeps the grid treatment on its per-card title link', async () => {
    render(await ArticlesArchiveComponent(block({ limit: 1 })))

    expect(screen.getByRole('link', { name: 'Article 1' })).toHaveAttribute(
      'href',
      '/articles/article-1',
    )
    expect(screen.queryByLabelText(/Read article:/)).toBeNull()
  })

  it('shows a heading only when one is stored', async () => {
    // Card titles are headings too, so the section heading is identified by
    // name rather than by role alone.
    const { unmount } = render(await ArticlesArchiveComponent(block()))
    expect(screen.queryByRole('heading', { name: 'Latest words' })).toBeNull()
    unmount()

    render(await ArticlesArchiveComponent(block({ heading: 'Latest words' })))
    expect(screen.getByRole('heading', { name: 'Latest words' }).tagName).toBe(
      'H2',
    )
  })

  it('renders nothing when there are no published articles', async () => {
    getAllArticles.mockResolvedValue([])
    const { container } = render(await ArticlesArchiveComponent(block()))
    expect(container).toBeEmptyDOMElement()
  })

  it('de-duplicates articles that share a slug before limiting', async () => {
    getAllArticles.mockResolvedValue([article(1), article(1), article(2)])
    render(await ArticlesArchiveComponent(block()))
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('hands its rhythm to the column when hosted in one, and keeps it at root', async () => {
    const { container, unmount } = render(
      await ArticlesArchiveComponent({ ...block(), hosted: 'column' }),
    )
    expect(container.querySelector('section')).not.toHaveClass('my-12')
    unmount()

    const root = render(await ArticlesArchiveComponent(block()))
    expect(root.container.querySelector('section')).toHaveClass('my-12')
  })
})
