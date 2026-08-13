import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Projects route `/projects` after the #27 fallback removal: a populated
 * `projects` collection renders the {@link EntityGrid}; an empty collection
 * (repo returns `null`) renders the deliberate empty state rather than the old
 * hard-coded v3 project list. The JSON-LD CollectionPage/Breadcrumb scripts
 * are preserved; the ItemList script is only emitted when items exist.
 */

const getCmsProjects = vi.fn()
const getCmsPageByPath = vi.fn(async (_path?: string) => null)

vi.mock('@/lib/cms/projectsRepo', () => ({
  getCmsProjects: () => getCmsProjects(),
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
vi.mock('@/lib/site', () => ({
  getSiteUrl: () => 'https://example.com',
}))

// Probes for the grid, page-builder blocks, and layout.
vi.mock('@/components/cms/EntityGrid', () => ({
  EntityGrid: ({ items }: { items: unknown[] }) => (
    <div data-testid="entity-grid" data-count={items.length} />
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

import Projects from '@/app/(frontend)/projects/page'

const scriptText = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => s.textContent)
    .join(' ')

beforeEach(() => {
  vi.clearAllMocks()
  getCmsPageByPath.mockResolvedValue(null)
})

describe('projects route — collection-honest rendering (#27)', () => {
  it('renders the grid and the ItemList schema when populated', async () => {
    getCmsProjects.mockResolvedValue([
      {
        slug: 'proj',
        name: 'Proj',
        description: 'A project.',
        link: { href: 'https://proj.example', label: 'proj.example' },
      },
    ])
    const { container } = render(await Projects())

    expect(screen.getByTestId('entity-grid')).toHaveAttribute('data-count', '1')
    expect(screen.queryByText('Projects coming soon')).toBeNull()
    const combined = scriptText(container)
    expect(combined).toContain('CollectionPage')
    expect(combined).toContain('BreadcrumbList')
    expect(combined).toContain('ItemList')
  })

  it('renders the empty state and omits the ItemList schema when empty (repo null)', async () => {
    getCmsProjects.mockResolvedValue(null)
    const { container } = render(await Projects())

    expect(screen.getByText('Projects coming soon')).toBeInTheDocument()
    expect(screen.queryByTestId('entity-grid')).toBeNull()
    const combined = scriptText(container)
    // Collection + breadcrumb schemas stay; the ItemList is suppressed.
    expect(combined).toContain('CollectionPage')
    expect(combined).toContain('BreadcrumbList')
    expect(combined).not.toContain('ItemList')
  })
})
