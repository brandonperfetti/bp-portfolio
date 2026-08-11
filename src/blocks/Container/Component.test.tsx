import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ContainerBlockComponent } from '@/blocks/Container/Component'
import type { ContainerBlock } from '@/payload-types'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: any) => <img {...props} />,
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
// GSAP wrappers need matchMedia (absent in jsdom); render children directly.
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: any) => <>{children}</>,
}))
vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ children, as: As = 'div' }: any) => <As>{children}</As>,
}))
vi.mock('@/components/motion/ParallaxGroup', () => ({
  ParallaxGroup: ({ children }: any) => <>{children}</>,
}))
// Server blocks reach the Payload config (unresolvable in jsdom); stub them.
vi.mock('@/blocks/ArticlesArchive/Component', () => ({
  ArticlesArchiveComponent: () => null,
}))
vi.mock('@/blocks/WorkHistoryCard/Component', () => ({
  WorkHistoryCardComponent: () => null,
}))

const text = (value: string) => ({
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', text: value, version: 1 }],
      },
    ],
  },
})

/** The acceptance-criteria layout: a 2/3 main column beside a 1/3 rail. */
const twoThirdsPlusOneThird = {
  blockType: 'container',
  columns: [
    {
      blockType: 'column',
      id: 'main',
      size: 'twoThirds',
      content: [
        {
          blockType: 'cta',
          id: 'cta',
          richText: text('main column copy'),
          links: [
            {
              id: 'l',
              link: {
                type: 'custom',
                url: 'https://example.com',
                label: 'Go',
                appearance: 'default',
              },
            },
          ],
        },
        { blockType: 'spacer', id: 'gap', size: 'sm' },
      ],
    },
    {
      blockType: 'column',
      id: 'rail',
      size: 'oneThird',
      content: [
        {
          blockType: 'photoStrip',
          id: 'strip',
          images: [{ id: 1, url: 'https://example.com/strip.jpg', alt: '' }],
        },
      ],
    },
  ],
} as unknown as ContainerBlock

const columnFor = (container: HTMLElement, testText: string) =>
  within(container).getByText(testText).closest('div.col-span-12')

describe('ContainerBlockComponent', () => {
  it('renders a 2/3 + 1/3 layout with different block types per column', () => {
    const { container } = render(
      <ContainerBlockComponent {...twoThirdsPlusOneThird} />,
    )

    const main = columnFor(container, 'main column copy')
    expect(main).toHaveClass('col-span-12', 'lg:col-span-8')
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute(
      'href',
      'https://example.com',
    )

    const image = container.querySelector(
      'img[src="https://example.com/strip.jpg"]',
    )
    expect(image).toBeInTheDocument()
    expect(image?.closest('div.col-span-12')).toHaveClass('lg:col-span-4')
  })

  it('lays the columns out on a 12-column grid', () => {
    const { container } = render(
      <ContainerBlockComponent {...twoThirdsPlusOneThird} />,
    )
    const grid = container.querySelector('div.grid')
    expect(grid).toHaveClass('grid', 'grid-cols-12', 'gap-8')
    expect(grid?.children).toHaveLength(2)
  })

  it('renders the pre-#29/#30 defaults when nothing is stored', () => {
    // Containers built before these controls existed must render unchanged:
    // medium gap, stretched, route-container width, no padding, no anchor.
    const { container } = render(
      <ContainerBlockComponent {...twoThirdsPlusOneThird} />,
    )
    const section = container.querySelector('section')
    const grid = container.querySelector('div.grid')

    expect(section).toHaveClass('my-12')
    expect(section).not.toHaveAttribute('id')
    expect(section?.className).not.toMatch(/w-screen|max-w-2xl|py-/)
    expect(grid).toHaveClass('gap-8', 'items-stretch')
  })

  it('gives every column the full row below lg, whatever its size', () => {
    const { container } = render(
      <ContainerBlockComponent {...twoThirdsPlusOneThird} />,
    )
    const grid = container.querySelector('div.grid')
    for (const column of Array.from(grid?.children ?? [])) {
      expect(column).toHaveClass('col-span-12')
    }
  })

  it('falls back to full width for an unrecognised stored size', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...({
          blockType: 'container',
          columns: [
            {
              blockType: 'column',
              id: 'stale',
              // The reference implementation's drift value.
              size: 'oneHalf',
              content: [
                { blockType: 'cta', id: 'c', richText: text('stale column') },
              ],
            },
          ],
        } as unknown as ContainerBlock)}
      />,
    )
    expect(columnFor(container, 'stale column')).toHaveClass(
      'col-span-12',
      'lg:col-span-12',
    )
  })

  it('renders an empty column without content, rather than throwing', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...({
          blockType: 'container',
          columns: [{ blockType: 'column', id: 'empty', size: 'half' }],
        } as unknown as ContainerBlock)}
      />,
    )
    expect(container.querySelector('div.lg\\:col-span-6')).toBeEmptyDOMElement()
  })

  it('renders nothing for a container with no columns', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...({
          blockType: 'container',
          columns: [],
        } as unknown as ContainerBlock)}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

/** A container carrying whatever section/grid settings a test needs. */
const containerWith = (overrides: Record<string, unknown>) =>
  ({
    blockType: 'container',
    columns: [
      {
        blockType: 'column',
        id: 'main',
        size: 'half',
        content: [{ blockType: 'cta', id: 'c', richText: text('body copy') }],
      },
      {
        blockType: 'column',
        id: 'rail',
        size: 'half',
        sticky: true,
        content: [{ blockType: 'cta', id: 'r', richText: text('rail copy') }],
      },
    ],
    ...overrides,
  }) as unknown as ContainerBlock

/** #29: sticky rail, column alignment, and the gap vocabulary. */
describe('ContainerBlockComponent grid controls (#29)', () => {
  it('sticks a column from lg up and pins it to the top of the row', () => {
    const { container } = render(
      <ContainerBlockComponent {...containerWith({})} />,
    )

    const rail = columnFor(container, 'rail copy')
    expect(rail).toHaveClass('self-start', 'lg:sticky', 'lg:top-10')
    // Desktop-only: nothing sticks below lg, where columns are stacked.
    expect(rail).not.toHaveClass('sticky')

    expect(columnFor(container, 'body copy')).not.toHaveClass('lg:sticky')
  })

  it('applies the stored gap, including the homepage gutter at lg', () => {
    const { container } = render(
      <ContainerBlockComponent {...containerWith({ gap: 'lg' })} />,
    )
    expect(container.querySelector('div.grid')).toHaveClass(
      'gap-8',
      'lg:gap-16',
      'xl:gap-24',
    )
  })

  it('applies the tight gap', () => {
    const { container } = render(
      <ContainerBlockComponent {...containerWith({ gap: 'sm' })} />,
    )
    const grid = container.querySelector('div.grid')
    expect(grid).toHaveClass('gap-4')
    expect(grid).not.toHaveClass('gap-8')
  })

  it('applies the stored vertical alignment', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ verticalAlign: 'center' })}
      />,
    )
    expect(container.querySelector('div.grid')).toHaveClass('items-center')
  })

  it('falls back to the defaults for stale stored values', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ gap: 'xl', verticalAlign: 'middle' })}
      />,
    )
    expect(container.querySelector('div.grid')).toHaveClass(
      'gap-8',
      'items-stretch',
    )
  })
})

/** #30: width, padding, anchor and visibility on the section shell. */
describe('ContainerBlockComponent section shell (#30)', () => {
  it('breaks a full-bleed section out of the route container', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { width: 'fullBleed' } })}
      />,
    )
    expect(container.querySelector('section')).toHaveClass(
      'relative',
      'left-1/2',
      'w-screen',
      '-translate-x-1/2',
    )
  })

  it('centers a narrow section at a reading measure', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { width: 'narrow' } })}
      />,
    )
    const section = container.querySelector('section')
    expect(section).toHaveClass('mx-auto', 'max-w-2xl')
    expect(section).not.toHaveClass('w-screen')
  })

  it('leaves the container width untouched, as before', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { width: 'container' } })}
      />,
    )
    expect(container.querySelector('section')?.className).toBe('my-12')
  })

  it('adds the stored vertical padding', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { paddingY: 'lg' } })}
      />,
    )
    expect(container.querySelector('section')).toHaveClass('py-24')
  })

  it('makes an anchored section linkable, with room to scroll to', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { anchorId: 'work-history' } })}
      />,
    )
    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'work-history')
    expect(section).toHaveClass('scroll-mt-16')
  })

  it('drops an anchor the field validation would have rejected', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { anchorId: 'Work History' } })}
      />,
    )
    expect(container.querySelector('section')).not.toHaveAttribute('id')
  })

  it('omits a hidden section from the output entirely, not with CSS', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { hidden: true } })}
      />,
    )
    // The content must not reach the browser at all — no hidden markup.
    expect(container).toBeEmptyDOMElement()
    expect(container.textContent).not.toContain('body copy')
  })
})
