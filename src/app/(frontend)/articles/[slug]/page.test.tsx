import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 signed-out shell: ArticlePage prerenders from a signed-out article
// (getArticleBySlug with { isAuthenticated: false }) — no page-level getViewer —
// so the shell + published body (or the gated teaser) are cacheable. The real
// GatedArticleBody runs; ArticleBody/SyncErrorState are probes.
const getArticleBySlug = vi.fn()
const getViewer = vi.fn()
vi.mock('@/lib/articles', () => ({
  getAllArticles: vi.fn(async () => []),
  getArticleBySlug: (...args: unknown[]) => getArticleBySlug(...args),
}))
// #153: a placed article's breadcrumb trail walks its ancestor pages.
const getAncestorPages = vi.fn(async (_path: string) => [
  { path: 'work', title: 'Work' },
])
vi.mock('@/lib/cms/pagesRepo', () => ({
  getAncestorPages: (path: string) => getAncestorPages(path),
}))
vi.mock('@/lib/auth/getViewer', () => ({ getViewer: () => getViewer() }))
vi.mock('@/components/cms/ArticleBody', () => ({
  ArticleBody: ({ blocks }: { blocks: unknown[] }) => (
    <div data-testid="article-body" data-count={blocks.length} />
  ),
}))
vi.mock('@/components/cms/SyncErrorState', () => ({
  SyncErrorState: () => <div data-testid="sync-error" />,
}))
vi.mock('@/components/ArticleLayout', () => ({
  ArticleLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@/components/cms/ArticleMeta', () => ({ ArticleMeta: () => null }))
vi.mock('@/components/cms/CmsPostBlocks', () => ({ CmsPostBlocks: () => null }))
vi.mock('@/components/cms/CopyPageButton', () => ({
  CopyPageButton: () => null,
}))
vi.mock('@/components/cms/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/lib/cms/articlesRepo', () => ({
  resolveArticleShareTargetIds: () => [],
}))
vi.mock('@/lib/cms/pageMetadata', () => ({
  resolveArticleSocialImage: () => undefined,
}))
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: vi.fn(async () => ({
    canonicalUrl: 'https://example.com',
    siteName: 'Site',
    copyPageEnabled: false,
    copyPageLabel: 'Copy',
    shareTargets: [],
    generatedOgEnabled: false,
    openGraphImage: undefined,
  })),
}))
vi.mock('@/lib/site', () => ({ getSiteUrl: () => 'https://example.com' }))
// #130: the not-found branch chooses between the two redirect APIs, so both
// have to be observable. They are stubbed as throwing sentinels because that
// is what they really do — each one terminates the render.
const getRedirectForPath = vi.fn()
vi.mock('@/lib/cms/redirectsRepo', () => ({
  getRedirectForPath: (path: string) => getRedirectForPath(path),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
  permanentRedirect: (destination: string) => {
    throw new Error(`permanentRedirect:${destination}`)
  },
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`)
  },
}))

import ArticlePage from '@/app/(frontend)/articles/[slug]/page'

const article = (over: Record<string, unknown> = {}) => ({
  slug: 'a-post',
  title: 'A Post',
  description: 'desc',
  date: '2025-01-01',
  author: 'Brandon',
  bodyBlocks: [],
  gated: false,
  ...over,
})

const renderPage = async () =>
  render(await ArticlePage({ params: Promise.resolve({ slug: 'a-post' }) }))

beforeEach(() => {
  getArticleBySlug.mockReset()
  getViewer.mockReset()
})

describe('ArticlePage signed-out shell (#76 B2)', () => {
  it('fetches the signed-out article and renders the published body — no page-level getViewer', async () => {
    getArticleBySlug.mockResolvedValue(
      article({ gated: false, bodyBlocks: [{}, {}] }),
    )
    await renderPage()
    // The shell read is signed-out (cacheable → prerenderable), not auth-scoped.
    expect(getArticleBySlug).toHaveBeenCalledWith('a-post', {
      isAuthenticated: false,
    })
    expect(getViewer).not.toHaveBeenCalled()
    expect(screen.getByTestId('article-body')).toHaveAttribute(
      'data-count',
      '2',
    )
  })

  it('renders the members teaser for a gated article (the Suspense fallback shell)', async () => {
    getArticleBySlug.mockResolvedValue(article({ gated: true, bodyBlocks: [] }))
    getViewer.mockResolvedValue({ isAuthenticated: false, userId: null })
    await renderPage()
    expect(screen.getByText('This article is for members.')).toBeInTheDocument()
  })
})

/**
 * Redirect permanence on the not-found branch (#130).
 *
 * Until #130 the collection had no permanence field and this branch called
 * `permanentRedirect` unconditionally, so a temporary move was served as a 308
 * and cached in browsers and search indexes effectively forever. The reader now
 * answers `permanent`, and these pin that the route acts on the answer instead
 * of ignoring it — including that a row with no stored type still gets the old
 * behaviour.
 */
describe('articles/[slug] redirect permanence (#130)', () => {
  beforeEach(() => {
    getRedirectForPath.mockReset()
  })

  const renderMissing = async () => {
    getArticleBySlug.mockResolvedValue(null)
    return ArticlePage({ params: Promise.resolve({ slug: 'gone' }) })
  }

  it('serves a permanent row through permanentRedirect (308)', async () => {
    getRedirectForPath.mockResolvedValue({
      destination: '/moved-here',
      permanent: true,
    })

    await expect(renderMissing()).rejects.toThrow(
      'permanentRedirect:/moved-here',
    )
    expect(getRedirectForPath).toHaveBeenCalledWith('/articles/gone')
  })

  it('serves a temporary row through redirect (307)', async () => {
    getRedirectForPath.mockResolvedValue({
      destination: '/promo',
      permanent: false,
    })

    await expect(renderMissing()).rejects.toThrow('redirect:/promo')
  })

  it('404s when no row matches', async () => {
    getRedirectForPath.mockResolvedValue(null)

    await expect(renderMissing()).rejects.toThrow('notFound')
  })
})

/**
 * Placed-article redirect (#153).
 *
 * `/articles/<slug>` is this route's only possible URL. When the article's own
 * `publicPathFor` disagrees — because an editor placed it under a section page —
 * the route must 308 to the placed path rather than serve a second copy of the
 * article at the archive URL.
 */
describe('ArticlePage · placed articles (#153)', () => {
  beforeEach(() => {
    getArticleBySlug.mockReset()
    getViewer.mockReset()
    getAncestorPages.mockClear()
  })

  it('permanently redirects a placed article to its placed path', async () => {
    getArticleBySlug.mockResolvedValue(
      article({ slug: 'a-post', path: 'work/a-post' }),
    )
    await expect(renderPage()).rejects.toThrow('permanentRedirect:/work/a-post')
  })

  it('does not redirect an unplaced article — every existing URL is untouched', async () => {
    getArticleBySlug.mockResolvedValue(article({ slug: 'a-post' }))
    await expect(renderPage()).resolves.toBeDefined()
  })

  it('emits the archive breadcrumb trail for an unplaced article', async () => {
    getArticleBySlug.mockResolvedValue(
      article({ slug: 'a-post', bodyBlocks: [{}] }),
    )
    const { container } = await renderPage()
    const scripts = Array.from(
      container.querySelectorAll('script[type="application/ld+json"]'),
    ).map((node) => node.innerHTML)
    const breadcrumb = scripts.find((json) => json.includes('BreadcrumbList'))
    expect(breadcrumb).toContain('"Articles"')
    expect(breadcrumb).toContain('https://example.com/articles')
    // An unplaced article never pays for an ancestor read.
    expect(getAncestorPages).not.toHaveBeenCalled()
  })
})
