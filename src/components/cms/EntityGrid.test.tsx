import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EntityGrid } from '@/components/cms/EntityGrid'
import type { CmsEntityItem } from '@/lib/cms/types'

/** Reassign before `render` to mount the grid at a given URL state. */
let searchParamsMock = new URLSearchParams('')
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: pushMock }),
  usePathname: () => '/projects',
  useSearchParams: () => searchParamsMock,
}))

/* eslint-disable @next/next/no-img-element */
vi.mock('next/image', () => ({
  default: (props: any) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img {...props} />
  ),
}))
/* eslint-enable @next/next/no-img-element */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ as: Tag = 'div', children }: any) => (
    <Tag>{children}</Tag>
  ),
}))

/** The `/projects` page size chosen in #88. */
const ENTITY_GRID_PAGE_SIZE = 24

function makeProjects(count: number): CmsEntityItem[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `project-${index + 1}`,
    name: `Project ${index + 1}`,
    description: `Description ${index + 1}`,
  }))
}

beforeEach(() => {
  searchParamsMock = new URLSearchParams('')
  pushMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('EntityGrid pagination (#88)', () => {
  it('is a no-op at a realistic projects count — no control, every card rendered', () => {
    render(<EntityGrid items={makeProjects(9)} label="Projects pagination" />)

    expect(
      screen.queryByRole('navigation', { name: 'Projects pagination' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
  })

  it('renders nothing at exactly the page size', () => {
    render(
      <EntityGrid
        items={makeProjects(ENTITY_GRID_PAGE_SIZE)}
        label="Projects pagination"
      />,
    )

    expect(
      screen.queryByRole('navigation', { name: 'Projects pagination' }),
    ).not.toBeInTheDocument()
  })

  it('windows once the collection exceeds the page size', () => {
    render(
      <EntityGrid
        items={makeProjects(ENTITY_GRID_PAGE_SIZE + 1)}
        label="Projects pagination"
      />,
    )

    expect(
      screen.getByRole('navigation', { name: 'Projects pagination' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Project 1')).toBeInTheDocument()
    expect(
      screen.queryByText(`Project ${ENTITY_GRID_PAGE_SIZE + 1}`),
    ).not.toBeInTheDocument()
  })

  it('renders the page requested by ?page', () => {
    searchParamsMock = new URLSearchParams('page=2')
    render(
      <EntityGrid
        items={makeProjects(ENTITY_GRID_PAGE_SIZE + 1)}
        label="Projects pagination"
      />,
    )

    expect(
      screen.getByText(`Project ${ENTITY_GRID_PAGE_SIZE + 1}`),
    ).toBeInTheDocument()
    expect(screen.queryByText('Project 1')).not.toBeInTheDocument()
  })

  it('clamps an out-of-range ?page to the first page', () => {
    searchParamsMock = new URLSearchParams('page=99')
    render(
      <EntityGrid
        items={makeProjects(ENTITY_GRID_PAGE_SIZE + 1)}
        label="Projects pagination"
      />,
    )

    expect(screen.getByText('Project 1')).toBeInTheDocument()
  })

  it('pushes ?page on page navigation', async () => {
    const user = userEvent.setup()
    render(
      <EntityGrid
        items={makeProjects(ENTITY_GRID_PAGE_SIZE + 1)}
        label="Projects pagination"
      />,
    )

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))

    expect(pushMock).toHaveBeenCalledWith('/projects?page=2', { scroll: false })
  })
})
