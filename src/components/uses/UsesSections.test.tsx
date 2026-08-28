import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UsesSections } from '@/components/uses/UsesSections'
import type { CmsUseSection } from '@/lib/cms/types'

/** Reassign before `render` to mount the list at a given URL state. */
let searchParamsMock = new URLSearchParams('')
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: pushMock }),
  usePathname: () => '/uses',
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

/** The `/uses` page size chosen in #88. */
const USES_PAGE_SIZE = 48

/** Corpus size measured when #88 was filed. */
const CURRENT_USES_CORPUS = 16

/**
 * Build `sectionCount` sections holding `total` entries between them, in the
 * flattened order the component paginates over.
 */
function makeSections(total: number, sectionCount = 3): CmsUseSection[] {
  const sections: CmsUseSection[] = Array.from(
    { length: sectionCount },
    (_, index) => ({ title: `Section ${index + 1}`, items: [] }),
  )
  for (let index = 0; index < total; index += 1) {
    sections[Math.floor((index * sectionCount) / total)]?.items.push({
      slug: `use-${index + 1}`,
      name: `Use ${index + 1}`,
      description: `Description ${index + 1}`,
    })
  }
  return sections
}

beforeEach(() => {
  searchParamsMock = new URLSearchParams('')
  pushMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('UsesSections pagination (#88)', () => {
  it('is a no-op at the measured corpus — no control, every entry rendered', () => {
    render(<UsesSections sections={makeSections(CURRENT_USES_CORPUS)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Uses pagination' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Use 1')).toBeInTheDocument()
    expect(screen.getByText(`Use ${CURRENT_USES_CORPUS}`)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(
      3 + CURRENT_USES_CORPUS,
    )
  })

  it('renders nothing at exactly the page size', () => {
    render(<UsesSections sections={makeSections(USES_PAGE_SIZE)} />)

    expect(
      screen.queryByRole('navigation', { name: 'Uses pagination' }),
    ).not.toBeInTheDocument()
  })

  it('windows the flattened entries once the collection exceeds the page size', () => {
    render(<UsesSections sections={makeSections(USES_PAGE_SIZE + 1)} />)

    expect(
      screen.getByRole('navigation', { name: 'Uses pagination' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Use 1')).toBeInTheDocument()
    expect(
      screen.queryByText(`Use ${USES_PAGE_SIZE + 1}`),
    ).not.toBeInTheDocument()
  })

  it('renders only the sections the current window touches, in order', () => {
    searchParamsMock = new URLSearchParams('page=2')
    render(<UsesSections sections={makeSections(USES_PAGE_SIZE + 1)} />)

    // The one overflow entry lives in the last section, so page 2 shows that
    // section alone rather than three empty headings.
    expect(screen.getByText(`Use ${USES_PAGE_SIZE + 1}`)).toBeInTheDocument()
    expect(screen.queryByText('Use 1')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Section 3' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Section 1' }),
    ).not.toBeInTheDocument()
  })

  it('clamps an invalid ?page to the first page', () => {
    searchParamsMock = new URLSearchParams('page=not-a-number')
    render(<UsesSections sections={makeSections(USES_PAGE_SIZE + 1)} />)

    expect(screen.getByText('Use 1')).toBeInTheDocument()
  })

  it('pushes ?page on page navigation', async () => {
    const user = userEvent.setup()
    render(<UsesSections sections={makeSections(USES_PAGE_SIZE + 1)} />)

    await user.click(screen.getByRole('link', { name: 'Go to page 2' }))

    expect(pushMock).toHaveBeenCalledWith('/uses?page=2', { scroll: false })
  })
})
