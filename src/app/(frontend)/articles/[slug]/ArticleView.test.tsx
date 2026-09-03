import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `ArticleView` is the render both article URLs share (#153): `/articles/[slug]`
 * for an unplaced article and the `[...segments]` catch-all for a placed one.
 * These cases pin the one thing that differs between them — the
 * `BreadcrumbList` trail and the canonical — so a placed article can never be
 * described to a crawler as living in the archive it left.
 */

vi.mock('@/components/cms/ArticleBody', () => ({
  ArticleBody: () => <div data-testid="article-body" />,
}))
vi.mock('@/components/cms/SyncErrorState', () => ({
  SyncErrorState: () => null,
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
vi.mock('@/lib/auth/getViewer', () => ({
  getViewer: vi.fn(async () => ({ isAuthenticated: false, userId: null })),
}))
vi.mock('@/lib/cms/articlesRepo', () => ({
  resolveArticleShareTargetIds: () => [],
}))
vi.mock('@/lib/cms/pageMetadata', () => ({
  resolveArticleSocialImage: () => undefined,
}))
const getAncestorPages = vi.fn(async (_path: string) => [
  { path: 'work', title: 'Work' },
])
vi.mock('@/lib/cms/pagesRepo', () => ({
  getAncestorPages: (path: string) => getAncestorPages(path),
}))
vi.mock('@/lib/site', () => ({ getSiteUrl: () => 'https://example.com' }))

import {
  ArticleView,
  articleAncestors,
  buildArticleMetadata,
} from './ArticleView'

const settings = {
  canonicalUrl: 'https://example.com',
  siteName: 'Site',
  copyPageEnabled: false,
  copyPageLabel: 'Copy',
  shareTargets: [],
  generatedOgEnabled: false,
  openGraphImage: undefined,
} as never

const article = (over: Record<string, unknown> = {}) =>
  ({
    slug: 'brytecore',
    title: 'Brytecore',
    description: 'desc',
    date: '2025-01-01',
    author: 'Brandon',
    bodyBlocks: [{}],
    gated: false,
    ...over,
  }) as never

const breadcrumbOf = (container: HTMLElement) => {
  const json = Array.from(
    container.querySelectorAll('script[type="application/ld+json"]'),
  )
    .map((node) => node.innerHTML)
    .find((text) => text.includes('BreadcrumbList'))
  return JSON.parse(json as string) as {
    itemListElement: Array<{ position: number; name: string; item: string }>
  }
}

beforeEach(() => {
  getAncestorPages.mockClear()
})

describe('ArticleView · BreadcrumbList (#153)', () => {
  it('emits Home → Articles → title for an unplaced article', () => {
    const { container } = render(
      ArticleView({ article: article(), settings, ancestors: [] }),
    )
    const crumbs = breadcrumbOf(container).itemListElement
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Articles', 'Brytecore'])
    expect(crumbs[1].item).toBe('https://example.com/articles')
    expect(crumbs[2].item).toBe('https://example.com/articles/brytecore')
  })

  it('emits the real ancestor chain for a placed article', () => {
    const { container } = render(
      ArticleView({
        article: article({ path: 'work/brytecore' }),
        settings,
        ancestors: [{ path: 'work', title: 'Work' }],
      }),
    )
    const crumbs = breadcrumbOf(container).itemListElement
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Work', 'Brytecore'])
    expect(crumbs[1].item).toBe('https://example.com/work')
    // The placed path, exactly once — never both URLs.
    expect(crumbs[2].item).toBe('https://example.com/work/brytecore')
    expect(JSON.stringify(crumbs)).not.toContain('/articles/brytecore')
  })

  it('emits a deeper chain when the article sits two levels down', () => {
    const { container } = render(
      ArticleView({
        article: article({ path: 'work/brytecore/launch', slug: 'launch' }),
        settings,
        ancestors: [
          { path: 'work', title: 'Work' },
          { path: 'work/brytecore', title: 'Brytecore' },
        ],
      }),
    )
    const crumbs = breadcrumbOf(container).itemListElement
    expect(crumbs.map((c) => c.position)).toEqual([1, 2, 3, 4])
    expect(crumbs[3].item).toBe('https://example.com/work/brytecore/launch')
  })
})

describe('articleAncestors', () => {
  it('reads the ancestor chain only for a placed article', async () => {
    await expect(articleAncestors(article())).resolves.toEqual([])
    expect(getAncestorPages).not.toHaveBeenCalled()

    await expect(
      articleAncestors(article({ path: 'work/brytecore' })),
    ).resolves.toEqual([{ path: 'work', title: 'Work' }])
    expect(getAncestorPages).toHaveBeenCalledWith('work/brytecore')
  })
})

describe('buildArticleMetadata', () => {
  it('canonicalises a placed article at its placed path', () => {
    const meta = buildArticleMetadata(
      article({ path: 'work/brytecore' }),
      settings,
    )
    expect(meta.alternates?.canonical).toBe(
      'https://example.com/work/brytecore',
    )
    expect(meta.openGraph?.url).toBe('https://example.com/work/brytecore')
  })

  it('canonicalises an unplaced article at /articles/<slug>', () => {
    const meta = buildArticleMetadata(article(), settings)
    expect(meta.alternates?.canonical).toBe(
      'https://example.com/articles/brytecore',
    )
  })
})
