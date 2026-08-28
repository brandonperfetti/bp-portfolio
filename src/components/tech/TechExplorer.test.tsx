import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TechExplorer } from '@/components/tech/TechExplorer'
import type { CmsEntityItem } from '@/lib/cms/types'

/** Reassign before `render` to mount the explorer at a given URL state. */
let searchParamsMock = new URLSearchParams('')
const replaceMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  usePathname: () => '/tech',
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

/**
 * The `/tech` page size chosen in #88. Kept local so the assertions below pin
 * the contract rather than importing the component's own constant.
 */
const TECH_PAGE_SIZE = 48

/**
 * Rough size of the live tech-stack corpus (#88 records "uses = 16 items
 * measured, tech similar"; the in-tree `CATEGORY_BY_NAME` map names 44). The
 * point of the assertion is that a realistic corpus stays under the threshold.
 */
const CURRENT_TECH_CORPUS = 44

function makeTech(count: number): CmsEntityItem[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: `tech-${index + 1}`,
    name: `Tech ${index + 1}`,
    description: `Description ${index + 1}`,
    category: 'Tooling',
  }))
}

beforeEach(() => {
  searchParamsMock = new URLSearchParams('')
  replaceMock.mockClear()
  pushMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('TechExplorer pagination (#88)', () => {
  it('is a no-op at the current corpus size — no control, every card rendered', () => {
    render(<TechExplorer items={makeTech(CURRENT_TECH_CORPUS)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Tech pagination' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Tech 1')).toBeInTheDocument()
    expect(screen.getByText(`Tech ${CURRENT_TECH_CORPUS}`)).toBeInTheDocument()
  })

  it('renders nothing at exactly the page size', () => {
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Tech pagination' }),
    ).not.toBeInTheDocument()
  })

  it('windows once the collection exceeds the page size', () => {
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)

    expect(
      screen.getByRole('navigation', { name: 'Tech pagination' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(`Tech ${TECH_PAGE_SIZE + 1}`),
    ).not.toBeInTheDocument()
  })

  it('renders the page requested by ?page and clamps invalid values', () => {
    searchParamsMock = new URLSearchParams('page=2')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)
    expect(screen.getByText(`Tech ${TECH_PAGE_SIZE + 1}`)).toBeInTheDocument()

    cleanup()

    searchParamsMock = new URLSearchParams('page=nope')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)
    expect(screen.getByText('Tech 1')).toBeInTheDocument()
    expect(
      screen.queryByText(`Tech ${TECH_PAGE_SIZE + 1}`),
    ).not.toBeInTheDocument()
  })

  it('pushes ?page on page navigation, preserving filter params', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('category=Tooling')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))

    expect(pushMock).toHaveBeenCalledWith('/tech?category=Tooling&page=2', {
      scroll: false,
    })
  })

  it('drops ?page when a category filter changes', async () => {
    const user = userEvent.setup()
    searchParamsMock = new URLSearchParams('page=2')
    render(<TechExplorer items={makeTech(TECH_PAGE_SIZE + 1)} />)

    expect(replaceMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Tooling' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/tech?category=Tooling', {
        scroll: false,
      })
    })
  })
})
