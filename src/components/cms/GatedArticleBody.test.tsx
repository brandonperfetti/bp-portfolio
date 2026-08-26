import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArticleDetailWithSlug } from '@/lib/articles'

// Body + error state are probes; the gating decision is what's under test.
vi.mock('@/components/cms/ArticleBody', () => ({
  ArticleBody: ({ blocks }: { blocks: unknown[] }) => (
    <div data-testid="article-body" data-count={blocks.length} />
  ),
}))
vi.mock('@/components/cms/SyncErrorState', () => ({
  SyncErrorState: () => <div data-testid="sync-error" />,
}))

const getViewer = vi.fn()
const getArticleBySlug = vi.fn()
vi.mock('@/lib/auth/getViewer', () => ({
  getViewer: () => getViewer(),
}))
vi.mock('@/lib/articles', () => ({
  getArticleBySlug: (...args: unknown[]) => getArticleBySlug(...args),
}))

import {
  ArticleBodyRegion,
  AuthGatedArticleBody,
} from '@/components/cms/GatedArticleBody'

const article = (
  over: Partial<ArticleDetailWithSlug> = {},
): ArticleDetailWithSlug =>
  ({
    slug: 'a-post',
    title: 'A Post',
    bodyBlocks: [],
    gated: false,
    ...over,
  }) as unknown as ArticleDetailWithSlug

beforeEach(() => {
  getViewer.mockReset()
  getArticleBySlug.mockReset()
})

describe('ArticleBodyRegion', () => {
  it('renders the members teaser (with a sign-in link) when gated', () => {
    render(<ArticleBodyRegion article={article({ gated: true })} />)
    expect(screen.getByText('This article is for members.')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /sign in to continue/i }),
    ).toHaveAttribute('href', '/sign-in?redirect_url=/articles/a-post')
    expect(screen.queryByTestId('article-body')).toBeNull()
  })

  it('renders the body when not gated and blocks are present', () => {
    render(
      <ArticleBodyRegion
        article={article({ gated: false, bodyBlocks: [{}, {}] as never })}
      />,
    )
    expect(screen.getByTestId('article-body')).toHaveAttribute(
      'data-count',
      '2',
    )
    expect(screen.queryByText('This article is for members.')).toBeNull()
  })

  it('renders the sync-error state when not gated but the body is empty', () => {
    render(
      <ArticleBodyRegion article={article({ gated: false, bodyBlocks: [] })} />,
    )
    expect(screen.getByTestId('sync-error')).toBeInTheDocument()
  })
})

describe('AuthGatedArticleBody (auth isolation)', () => {
  const gatedFallback = article({ gated: true })

  it('shows the fallback teaser for an anonymous viewer without refetching', async () => {
    getViewer.mockResolvedValue({ isAuthenticated: false, userId: null })
    render(
      await AuthGatedArticleBody({ slug: 'a-post', fallback: gatedFallback }),
    )
    expect(screen.getByText('This article is for members.')).toBeInTheDocument()
    expect(getArticleBySlug).not.toHaveBeenCalled()
  })

  it('refetches with the viewer and streams the unlocked body when authenticated', async () => {
    getViewer.mockResolvedValue({ isAuthenticated: true, userId: 'u_1' })
    getArticleBySlug.mockResolvedValue(
      article({ gated: false, bodyBlocks: [{}, {}, {}] as never }),
    )
    render(
      await AuthGatedArticleBody({ slug: 'a-post', fallback: gatedFallback }),
    )
    expect(getArticleBySlug).toHaveBeenCalledWith('a-post', {
      isAuthenticated: true,
      userId: 'u_1',
    })
    expect(screen.getByTestId('article-body')).toHaveAttribute(
      'data-count',
      '3',
    )
  })

  it('falls back to the teaser when the authenticated refetch returns null', async () => {
    getViewer.mockResolvedValue({ isAuthenticated: true, userId: 'u_1' })
    getArticleBySlug.mockResolvedValue(null)
    render(
      await AuthGatedArticleBody({ slug: 'a-post', fallback: gatedFallback }),
    )
    expect(screen.getByText('This article is for members.')).toBeInTheDocument()
  })
})
