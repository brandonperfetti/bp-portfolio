import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Uses route `/uses` after the #27 fallback removal: a populated `uses`
 * collection renders its category sections; an empty collection (repo returns
 * `null`) renders the deliberate empty state rather than the old hard-coded v3
 * workstation/tools list.
 */

const getCmsUses = vi.fn()
const getCmsPageByPath = vi.fn(async (_path?: string) => null)

vi.mock('@/lib/cms/usesRepo', () => ({
  getCmsUses: () => getCmsUses(),
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

// Probes for the CMS-driven card, page-builder blocks, motion, and layout.
vi.mock('@/components/tech/TechCard', () => ({
  TechCard: ({ item }: { item: { name: string } }) => (
    <li data-testid="tech-card">{item.name}</li>
  ),
}))
vi.mock('@/components/cms/CmsPageBlocks', () => ({
  CmsPageBlocks: () => <div data-testid="cms-page-blocks" />,
}))
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/components/SimpleLayout', () => ({
  SimpleLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import Uses from '@/app/(frontend)/uses/page'

beforeEach(() => {
  vi.clearAllMocks()
  getCmsPageByPath.mockResolvedValue(null)
})

describe('uses route — collection-honest rendering (#27)', () => {
  it('renders category sections and cards when the collection is populated', async () => {
    getCmsUses.mockResolvedValue([
      {
        title: 'Workstation',
        items: [{ slug: 'x', name: 'Laptop', description: 'A laptop.' }],
      },
    ])
    render(await Uses())

    expect(screen.getByText('Workstation')).toBeInTheDocument()
    expect(screen.getByTestId('tech-card')).toHaveTextContent('Laptop')
    expect(screen.queryByText('Uses list coming soon')).toBeNull()
  })

  it('renders the deliberate empty state when the collection is empty (repo null)', async () => {
    getCmsUses.mockResolvedValue(null)
    render(await Uses())

    expect(screen.getByText('Uses list coming soon')).toBeInTheDocument()
    expect(screen.queryByTestId('tech-card')).toBeNull()
    expect(screen.getByTestId('cms-page-blocks')).toBeInTheDocument()
  })
})
