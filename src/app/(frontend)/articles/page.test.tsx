import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Articles route `/articles`: a populated search index renders the
 * {@link ArticlesExplorer}; an empty index renders the deliberate empty state.
 * The CollectionPage/Breadcrumb JSON-LD scripts are always emitted; the
 * ItemList script only when articles exist. The reader Share control renders
 * right-aligned below the hero by default and is suppressed by the page's
 * `disableSharing` kill switch.
 */

const getSearchArticles = vi.fn()
const getCmsPageByPath = vi.fn(
  async (_path?: string): Promise<Record<string, unknown> | null> => null,
)

vi.mock('@/lib/articles', () => ({
  getSearchArticles: () => getSearchArticles(),
}))
// #154: the route resolves which topics have a published section home and
// hands the map to the explorer as a plain object. Mocked here so the route
// test stays free of the Payload Local API.
const getTopicSectionPaths = vi.fn(async () => new Map<string, string>())
vi.mock('@/lib/cms/articlesRepo', () => ({
  getTopicSectionPaths: () => getTopicSectionPaths(),
}))
vi.mock('@/lib/cms/pagesRepo', () => ({
  getCmsPageByPath: (path: string) => getCmsPageByPath(path),
}))
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: vi.fn(async () => ({
    siteName: 'Brandon Perfetti',
    siteTitle: 'Brandon Perfetti',
    siteDescription: 'Product and software.',
    canonicalUrl: 'https://example.com',
    shareTargets: ['x', 'copylink'],
  })),
}))
vi.mock('@/lib/site', () => ({
  getSiteUrl: () => 'https://example.com',
}))

// Probes for the explorer, page-builder blocks, layout, and share control. The
// layout probe surfaces the `actions` slot so share assertions can see it.
vi.mock('@/components/articles/ArticlesExplorer', () => ({
  ArticlesExplorer: ({
    articles,
    sectionPaths,
  }: {
    articles: unknown[]
    sectionPaths?: Record<string, string>
  }) => (
    <div
      data-testid="articles-explorer"
      data-count={articles.length}
      data-section-paths={JSON.stringify(sectionPaths ?? null)}
    />
  ),
}))
vi.mock('@/components/cms/CmsPageBlocks', () => ({
  CmsPageBlocks: () => <div data-testid="cms-page-blocks" />,
}))
vi.mock('@/components/cms/ShareButton', () => ({
  ShareButton: ({ url, targetIds }: { url: string; targetIds: string[] }) => (
    <div
      data-testid="share-button"
      data-url={url}
      data-count={targetIds.length}
    />
  ),
}))
vi.mock('@/components/SimpleLayout', () => ({
  SimpleLayout: ({
    actions,
    children,
  }: {
    actions?: React.ReactNode
    children: React.ReactNode
  }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}))

import ArticlesIndex from '@/app/(frontend)/articles/page'

const scriptText = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => s.textContent)
    .join(' ')

beforeEach(() => {
  vi.clearAllMocks()
  getTopicSectionPaths.mockResolvedValue(new Map())
  getCmsPageByPath.mockResolvedValue(null)
})

describe('articles route — collection-honest rendering', () => {
  it('renders the explorer and the ItemList schema when populated', async () => {
    getSearchArticles.mockResolvedValue([
      { slug: 'a', title: 'A', description: 'An article.' },
    ])
    const { container } = render(await ArticlesIndex())

    expect(screen.getByTestId('articles-explorer')).toHaveAttribute(
      'data-count',
      '1',
    )
    expect(screen.queryByText('No published articles')).toBeNull()
    const combined = scriptText(container)
    expect(combined).toContain('CollectionPage')
    expect(combined).toContain('BreadcrumbList')
    expect(combined).toContain('ItemList')
  })

  it('renders the empty state and omits the ItemList schema when empty', async () => {
    getSearchArticles.mockResolvedValue([])
    const { container } = render(await ArticlesIndex())

    expect(screen.getByText('No published articles')).toBeInTheDocument()
    expect(screen.queryByTestId('articles-explorer')).toBeNull()
    const combined = scriptText(container)
    expect(combined).toContain('CollectionPage')
    expect(combined).toContain('BreadcrumbList')
    expect(combined).not.toContain('ItemList')
  })
})

describe('articles route — reader Share control', () => {
  it('renders the Share control by default (global targets, no page override)', async () => {
    getSearchArticles.mockResolvedValue([])
    render(await ArticlesIndex())

    const share = screen.getByTestId('share-button')
    expect(share).toHaveAttribute('data-url', 'https://example.com/articles')
    expect(share).toHaveAttribute('data-count', '2')
  })

  it('hides the Share control when the page sets disableSharing', async () => {
    getSearchArticles.mockResolvedValue([])
    getCmsPageByPath.mockResolvedValue({ disableSharing: true })
    render(await ArticlesIndex())

    expect(screen.queryByTestId('share-button')).toBeNull()
  })
})

/**
 * #154 — the section affordance's server half. The route resolves the map once,
 * inside `getTopicSectionPaths`' own cache scope, and passes it down as a plain
 * serializable object: no `searchParams` read, so `/articles` stays static.
 */
describe('articles route — section paths for the explorer (#154)', () => {
  it('passes the resolved topic → section-home map to the explorer', async () => {
    getSearchArticles.mockResolvedValue([
      { slug: 'a', title: 'A', description: 'd', date: '2026-01-01' },
    ])
    getTopicSectionPaths.mockResolvedValue(
      new Map([['leadership', 'work/leadership']]),
    )

    render(await ArticlesIndex())

    expect(screen.getByTestId('articles-explorer')).toHaveAttribute(
      'data-section-paths',
      '{"leadership":"work/leadership"}',
    )
  })

  it('passes an empty object when no topic has a home', async () => {
    getSearchArticles.mockResolvedValue([
      { slug: 'a', title: 'A', description: 'd', date: '2026-01-01' },
    ])

    render(await ArticlesIndex())

    expect(screen.getByTestId('articles-explorer')).toHaveAttribute(
      'data-section-paths',
      '{}',
    )
  })

  it('resolves the map exactly once — the #151 reader, not a second one', async () => {
    getSearchArticles.mockResolvedValue([])
    render(await ArticlesIndex())

    expect(getTopicSectionPaths).toHaveBeenCalledTimes(1)
  })
})
