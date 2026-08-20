import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TestimonialsComponent } from '@/blocks/Testimonials/Component'
import type { Media, TestimonialsBlock } from '@/payload-types'

/**
 * `next/image` reduced to a plain `<img>` so the grid markup under test is the
 * block's own output, not Next's DOM spelling of the week — and so the same
 * stub applies to every render, keeping the byte-identical comparison honest.
 */
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority: _priority, ...rest }: any) => <img {...rest} />,
}))

/**
 * The Swiper leaf is a browser component (covered by its own stories); here it
 * is stubbed to a marker that echoes the resolved slides, so this jsdom test
 * asserts what the server Component hands the carousel without mounting Swiper.
 */
vi.mock('@/blocks/Testimonials/TestimonialsCarouselClient', () => ({
  TestimonialsCarouselClient: ({ items }: { items: unknown[] }) => (
    <div data-testid="carousel-stub">{JSON.stringify(items)}</div>
  ),
}))

const avatar: Media = {
  id: 1,
  url: 'https://example.com/a.jpg',
  alt: 'ignored — decorative',
  width: 40,
  height: 40,
} as Media

const block = (overrides: Partial<TestimonialsBlock> = {}): TestimonialsBlock =>
  ({
    blockType: 'testimonials',
    heading: 'What people say',
    items: [
      { id: 'a', quote: 'First quote', name: 'Ada', role: 'CTO', avatar },
      { id: 'b', quote: 'Second quote', name: 'Grace', role: null },
    ],
    layout: 'grid',
    ...overrides,
  }) as TestimonialsBlock

describe('TestimonialsComponent', () => {
  it('renders nothing without items', () => {
    const { container } = render(
      <TestimonialsComponent {...block({ items: [] })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the grid byte-identically whether layout is grid or unset (the default path)', () => {
    const gridHtml = render(
      <TestimonialsComponent {...block({ layout: 'grid' })} />,
    ).container.innerHTML

    cleanupBetween()

    const unsetHtml = render(
      // A block stored before the migration has no layout → must render grid.
      <TestimonialsComponent {...block({ layout: undefined })} />,
    ).container.innerHTML

    expect(gridHtml).toBe(unsetHtml)
    // And it is the today's-markup grid, not the carousel.
    expect(gridHtml).toContain('role="list"')
    expect(gridHtml).toContain('@md:grid-cols-2')
    expect(gridHtml).toContain('rounded-2xl border border-zinc-100')
    expect(gridHtml).not.toContain('carousel-stub')
  })

  it('keeps the grid container query and column ramp', () => {
    const { container } = render(<TestimonialsComponent {...block()} />)
    const wrapper = container.querySelector('.\\@container')
    expect(wrapper).not.toBeNull()
    const list = screen.getByRole('list')
    expect(list.className).toContain('grid-cols-1')
    expect(list.className).toContain('@md:grid-cols-2')
  })

  it('hands the carousel leaf the resolved, serializable slides', () => {
    render(<TestimonialsComponent {...block({ layout: 'carousel' })} />)
    const stub = screen.getByTestId('carousel-stub')
    const slides = JSON.parse(stub.textContent || '[]')
    expect(slides).toEqual([
      {
        id: 'a',
        quote: 'First quote',
        name: 'Ada',
        role: 'CTO',
        avatarUrl: 'https://example.com/a.jpg',
      },
      {
        id: 'b',
        quote: 'Second quote',
        name: 'Grace',
        role: null,
        avatarUrl: null,
      },
    ])
    // The grid list is not rendered in the carousel layout.
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('still renders the heading above the carousel', () => {
    render(<TestimonialsComponent {...block({ layout: 'carousel' })} />)
    expect(
      screen.getByRole('heading', { name: 'What people say' }),
    ).toBeTruthy()
    expect(screen.getByTestId('carousel-stub')).toBeTruthy()
  })

  it('drops the section rhythm margin when hosted in a column', () => {
    const standalone = render(<TestimonialsComponent {...block()} />)
    expect(standalone.container.querySelector('section')?.className).toContain(
      'my-',
    )

    cleanupBetween()

    const hosted = render(
      <TestimonialsComponent {...block()} hosted="column" />,
    )
    expect(hosted.container.querySelector('section')?.className).not.toContain(
      'my-',
    )
  })
})

/** RTL cleanup between in-test renders that both read the shared document. */
function cleanupBetween() {
  document.body.innerHTML = ''
}
