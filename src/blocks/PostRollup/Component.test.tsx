import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PostRollupBlock } from '@/payload-types'

const getPostRollupByCategory = vi.fn()
const getPostRollupByPlacement = vi.fn()

vi.mock('@/lib/cms/articlesRepo', () => ({
  getPostRollupByCategory: (...args: unknown[]) =>
    getPostRollupByCategory(...args),
  getPostRollupByPlacement: (...args: unknown[]) =>
    getPostRollupByPlacement(...args),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// GSAP wrappers: jsdom has no matchMedia, and the hover/reveal choreography is
// a browser fact — the stories assert it.
vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ children }: any) => (
    <div data-hover-motion-card>{children}</div>
  ),
}))
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: any) => <div data-scroll-reveal>{children}</div>,
}))

const { PostRollupComponent } = await import('@/blocks/PostRollup/Component')

const summary = (n: number) => ({
  slug: `article-${n}`,
  title: `Article ${n}`,
  date: `2026-01-0${(n % 9) + 1}`,
  description: `Description ${n}`,
})

const block = (overrides: Partial<PostRollupBlock> = {}): PostRollupBlock =>
  ({
    blockType: 'postRollup',
    source: 'by-category',
    ...overrides,
  }) as PostRollupBlock

/**
 * The server half of #152: which query the block issues, and which treatment it
 * hands the result to. The pixels live in `PostRollupView` (stories).
 */
describe('PostRollupComponent · by-category', () => {
  beforeEach(() => {
    getPostRollupByCategory.mockReset()
    getPostRollupByPlacement.mockReset()
    getPostRollupByCategory.mockResolvedValue([summary(1), summary(2)])
  })

  it('queries the selected category with the stored sort and limit', async () => {
    render(
      await PostRollupComponent(
        block({ category: 7, sort: 'title', limit: 4 }),
      ),
    )

    expect(getPostRollupByCategory).toHaveBeenCalledWith(7, 'title', 4)
    expect(getPostRollupByPlacement).not.toHaveBeenCalled()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('defaults to newest-first and six articles', async () => {
    await PostRollupComponent(block({ category: 7 }))

    expect(getPostRollupByCategory).toHaveBeenCalledWith(7, 'newest', 6)
  })

  it('reads the id out of a populated relationship', async () => {
    await PostRollupComponent(
      block({ category: { id: 12, title: 'Leadership' } as never }),
    )

    expect(getPostRollupByCategory).toHaveBeenCalledWith(12, 'newest', 6)
  })

  it('renders nothing, and issues no query, when no category is chosen', async () => {
    const element = await PostRollupComponent(block())

    expect(element).toBeNull()
    expect(getPostRollupByCategory).not.toHaveBeenCalled()
  })
})

describe('PostRollupComponent · by-placement (#153)', () => {
  beforeEach(() => {
    getPostRollupByCategory.mockReset()
    getPostRollupByPlacement.mockReset()
    getPostRollupByPlacement.mockResolvedValue([
      { ...summary(1), path: 'work/brytecore', slug: 'brytecore' },
    ])
  })

  it('queries posts parented to the selected page', async () => {
    render(
      await PostRollupComponent(
        block({ source: 'by-placement', page: 3, limit: 2 }),
      ),
    )

    expect(getPostRollupByPlacement).toHaveBeenCalledWith(3, 'newest', 2)
    expect(getPostRollupByCategory).not.toHaveBeenCalled()
  })

  it('passes a placed article’s path through to the card href', async () => {
    render(
      await PostRollupComponent(block({ source: 'by-placement', page: 3 })),
    )

    expect(screen.getByLabelText('Read article: Article 1')).toHaveAttribute(
      'href',
      '/work/brytecore',
    )
  })

  it('renders nothing, and issues no query, when no page is chosen', async () => {
    // The design's "leave empty to use the hosting page" fallback is not
    // offered: the dispatcher carries no page identity. An empty picker must
    // therefore roll up NOTHING rather than the whole corpus.
    const element = await PostRollupComponent(block({ source: 'by-placement' }))

    expect(element).toBeNull()
    expect(getPostRollupByPlacement).not.toHaveBeenCalled()
  })
})

describe('PostRollupComponent · presentation handoff', () => {
  beforeEach(() => {
    getPostRollupByCategory.mockReset()
    getPostRollupByCategory.mockResolvedValue([summary(1), summary(2)])
  })

  it('renders nothing when the query comes back empty', async () => {
    getPostRollupByCategory.mockResolvedValue([])

    expect(await PostRollupComponent(block({ category: 7 }))).toBeNull()
  })

  it('shows a heading only when one is stored, as a real h2', async () => {
    const { unmount } = render(
      await PostRollupComponent(block({ category: 7 })),
    )
    expect(
      screen.queryByRole('heading', { name: 'From this topic' }),
    ).toBeNull()
    unmount()

    render(
      await PostRollupComponent(
        block({ category: 7, heading: 'From this topic' }),
      ),
    )
    expect(
      screen.getByRole('heading', { name: 'From this topic' }).tagName,
    ).toBe('H2')
  })

  it('renders the compact list as a real list of one-link rows', async () => {
    render(
      await PostRollupComponent(block({ category: 7, layout: 'compact-list' })),
    )

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    // One accessible name per row: the title plus its date, not two links.
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Article 1/ })).toHaveAttribute(
      'href',
      '/articles/article-1',
    )
  })

  it('reuses the ArticlesArchive card vocabulary for grid and stacked', async () => {
    const { container, unmount } = render(
      await PostRollupComponent(block({ category: 7, layout: 'grid' })),
    )
    // The whole-card link + hover overlay are ArticlesArchiveView's, not a
    // second copy of the card written here.
    expect(
      screen.getByRole('link', { name: 'Read article: Article 1' }),
    ).toHaveAttribute('href', '/articles/article-1')
    expect(container.querySelectorAll('[data-hover-overlay]')).toHaveLength(2)
    unmount()

    const stacked = render(
      await PostRollupComponent(block({ category: 7, layout: 'stacked' })),
    )
    expect(stacked.container.querySelector('section > div')).toHaveClass(
      'gap-16',
    )
  })

  it('wraps the compact list in the reveal only when asked', async () => {
    const { container, unmount } = render(
      await PostRollupComponent(block({ category: 7, layout: 'compact-list' })),
    )
    expect(container.querySelector('[data-scroll-reveal]')).toBeNull()
    unmount()

    const revealed = render(
      await PostRollupComponent(
        block({ category: 7, layout: 'compact-list', revealOnScroll: true }),
      ),
    )
    expect(
      revealed.container.querySelector('[data-scroll-reveal]'),
    ).not.toBeNull()
  })

  it('hands its rhythm to the column when hosted in one, and keeps it at root', async () => {
    const { container, unmount } = render(
      await PostRollupComponent({
        ...block({ category: 7, layout: 'compact-list' }),
        hosted: 'column',
      }),
    )
    expect(container.querySelector('section')).not.toHaveClass('my-12')
    unmount()

    const root = render(
      await PostRollupComponent(block({ category: 7, layout: 'compact-list' })),
    )
    expect(root.container.querySelector('section')).toHaveClass('my-12')
  })
})
