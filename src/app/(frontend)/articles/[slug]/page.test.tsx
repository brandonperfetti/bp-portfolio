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
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
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
