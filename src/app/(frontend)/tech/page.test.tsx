import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Tech route `/tech` after the #27 fallback removal: a populated
 * `tech-stack` collection renders the {@link TechExplorer}; an empty collection
 * (repo returns `null`) renders the deliberate empty state rather than the old
 * hard-coded v3 dataset.
 */

const getCmsTech = vi.fn()
const getCmsPageByPath = vi.fn(
  async (_path?: string): Promise<Record<string, unknown> | null> => null,
)

vi.mock('@/lib/cms/techRepo', () => ({
  getCmsTech: () => getCmsTech(),
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
vi.mock('@/lib/tech/githubSignals', () => ({
  getTechSignalsIndex: vi.fn(async () => null),
  buildSignalsBySlug: vi.fn(() => ({})),
}))

// Probes — the explorer, page-builder blocks, layout, and share control own
// their pixels elsewhere; here we only care which branch the route renders.
// The layout probe surfaces the `actions` slot so share assertions can see it.
vi.mock('@/components/tech/TechExplorer', () => ({
  TechExplorer: ({ items }: { items: unknown[] }) => (
    <div data-testid="tech-explorer" data-count={items.length} />
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

import TechStack from '@/app/(frontend)/tech/page'

beforeEach(() => {
  vi.clearAllMocks()
  getCmsPageByPath.mockResolvedValue(null)
})

/** Concatenated JSON-LD script contents, for schema-presence assertions. */
const scriptText = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => s.textContent)
    .join(' ')

describe('tech route — collection-honest rendering (#27)', () => {
  it('renders the explorer and the ItemList schema when populated', async () => {
    getCmsTech.mockResolvedValue([
      { slug: 'alpha', name: 'Alpha', description: 'An entry.' },
    ])
    const { container } = render(await TechStack())

    const explorer = screen.getByTestId('tech-explorer')
    expect(explorer).toHaveAttribute('data-count', '1')
    expect(screen.queryByText('Tech stack coming soon')).toBeNull()
    const combined = scriptText(container)
    expect(combined).toContain('CollectionPage')
    expect(combined).toContain('BreadcrumbList')
    expect(combined).toContain('ItemList')
    expect(combined).toContain('Alpha')
  })

  it('renders the deliberate empty state and omits the ItemList schema when empty (repo null)', async () => {
    getCmsTech.mockResolvedValue(null)
    const { container } = render(await TechStack())

    expect(screen.getByText('Tech stack coming soon')).toBeInTheDocument()
    expect(screen.queryByTestId('tech-explorer')).toBeNull()
    // The page-builder region still renders below the empty state.
    expect(screen.getByTestId('cms-page-blocks')).toBeInTheDocument()
    const combined = scriptText(container)
    expect(combined).toContain('CollectionPage')
    expect(combined).toContain('BreadcrumbList')
    expect(combined).not.toContain('ItemList"')
  })
})

describe('tech route — reader Share control', () => {
  it('renders the Share control by default (global targets, no page override)', async () => {
    getCmsTech.mockResolvedValue(null)
    render(await TechStack())

    const share = screen.getByTestId('share-button')
    expect(share).toHaveAttribute('data-url', 'https://example.com/tech')
    expect(share).toHaveAttribute('data-count', '2')
  })

  it('hides the Share control when the page sets disableSharing', async () => {
    getCmsTech.mockResolvedValue(null)
    getCmsPageByPath.mockResolvedValue({ disableSharing: true })
    render(await TechStack())

    expect(screen.queryByTestId('share-button')).toBeNull()
  })
})
