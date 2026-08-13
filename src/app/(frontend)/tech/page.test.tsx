import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Tech route `/tech` after the #27 fallback removal: a populated
 * `tech-stack` collection renders the {@link TechExplorer}; an empty collection
 * (repo returns `null`) renders the deliberate empty state rather than the old
 * hard-coded v3 dataset.
 */

const getCmsTech = vi.fn()
const getCmsPageByPath = vi.fn(async (_path?: string) => null)

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
  })),
}))
vi.mock('@/lib/tech/githubSignals', () => ({
  getTechSignalsIndex: vi.fn(async () => null),
  buildSignalsBySlug: vi.fn(() => ({})),
}))

// Probes — the explorer, page-builder blocks, and layout own their pixels
// elsewhere; here we only care which branch the route renders.
vi.mock('@/components/tech/TechExplorer', () => ({
  TechExplorer: ({ items }: { items: unknown[] }) => (
    <div data-testid="tech-explorer" data-count={items.length} />
  ),
}))
vi.mock('@/components/cms/CmsPageBlocks', () => ({
  CmsPageBlocks: () => <div data-testid="cms-page-blocks" />,
}))
vi.mock('@/components/SimpleLayout', () => ({
  SimpleLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import TechStack from '@/app/(frontend)/tech/page'

beforeEach(() => {
  vi.clearAllMocks()
  getCmsPageByPath.mockResolvedValue(null)
})

describe('tech route — collection-honest rendering (#27)', () => {
  it('renders the explorer when the CMS tech collection is populated', async () => {
    getCmsTech.mockResolvedValue([
      { slug: 'alpha', name: 'Alpha', description: 'An entry.' },
    ])
    render(await TechStack())

    const explorer = screen.getByTestId('tech-explorer')
    expect(explorer).toHaveAttribute('data-count', '1')
    expect(screen.queryByText('Tech stack coming soon')).toBeNull()
  })

  it('renders the deliberate empty state when the collection is empty (repo null)', async () => {
    getCmsTech.mockResolvedValue(null)
    render(await TechStack())

    expect(screen.getByText('Tech stack coming soon')).toBeInTheDocument()
    expect(screen.queryByTestId('tech-explorer')).toBeNull()
    // The page-builder region still renders below the empty state.
    expect(screen.getByTestId('cms-page-blocks')).toBeInTheDocument()
  })
})
