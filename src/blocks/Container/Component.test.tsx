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

/** #37: backgrounds arrive as CSS custom properties, never as class names. */
describe('ContainerBlockComponent section background (#37)', () => {
  const sectionOf = (container: HTMLElement) =>
    container.querySelector('section') as HTMLElement

  it('writes no style attribute at all when there is no background', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { background: { style: 'none' } } })}
      />,
    )
    expect(sectionOf(container)).not.toHaveAttribute('style')
    expect(sectionOf(container).className).toBe('my-12')
  })

  it('paints a tint through the colour custom properties', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({
          section: { background: { style: 'tint', tint: 'muted' } },
        })}
      />,
    )
    const section = sectionOf(container)

    // Static classes — the same two strings whatever the editor picked.
    expect(section).toHaveClass(
      'bg-[var(--section-bg-color)]',
      'dark:bg-[var(--section-bg-color-dark)]',
    )
    // Both themes get a value, and they differ.
    const light = section.style.getPropertyValue('--section-bg-color')
    const dark = section.style.getPropertyValue('--section-bg-color-dark')
    expect(light).toContain('--color-zinc-200')
    expect(dark).toContain('--color-zinc-800')
    expect(light).not.toBe(dark)
    expect(section.style.getPropertyValue('--section-bg-image')).toBe('')
  })

  it('paints a gradient through the image custom properties', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({
          section: {
            background: {
              style: 'gradient',
              gradient: 'depth',
              direction: 'toRight',
            },
          },
        })}
      />,
    )
    const section = sectionOf(container)

    expect(section).toHaveClass(
      'bg-[image:var(--section-bg-image)]',
      'dark:bg-[image:var(--section-bg-image-dark)]',
    )
    expect(section.style.getPropertyValue('--section-bg-image')).toMatch(
      /^linear-gradient\(to right, /,
    )
    expect(section.style.getPropertyValue('--section-bg-image-dark')).toMatch(
      /^linear-gradient\(to right, /,
    )
    // A gradient must not leave a stale flat colour behind it.
    expect(section.style.getPropertyValue('--section-bg-color')).toBe('')
  })

  it('never emits a class name built from the stored value', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({
          section: {
            background: {
              style: 'gradient',
              gradient: 'panel',
              direction: 'toTop',
            },
          },
        })}
      />,
    )
    // The stored option names appear nowhere in the class list; they only
    // ever reach the DOM as values behind the custom properties.
    const classes = sectionOf(container).className
    expect(classes).not.toMatch(/panel|toTop|gradient-/)
  })

  it('paints nothing for an unrecognised stored style', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { background: { style: 'photo' } } })}
      />,
    )
    expect(sectionOf(container)).not.toHaveAttribute('style')
  })

  it('combines a background with the full-bleed breakout', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({
          section: {
            width: 'fullBleed',
            paddingY: 'lg',
            background: { style: 'tint', tint: 'panel' },
          },
        })}
      />,
    )
    const section = sectionOf(container)
    expect(section).toHaveClass(
      'w-screen',
      'py-24',
      'bg-[var(--section-bg-color)]',
    )
    expect(section.style.getPropertyValue('--section-bg-color')).not.toBe('')
  })
})

/**
 * #42: the opt-in vertical-rhythm dial that closes the flipped Home's grid
 * gap. Default off must be byte-identical to the pre-existing `my-12`; on must
 * reproduce Home's `my-24 md:my-28`.
 */
describe('ContainerBlockComponent section rhythm (#42)', () => {
  it('renders the compact my-12 when nothing is stored — the byte-identical default', () => {
    // A container built before this control existed carries no `rhythm`. It
    // must render exactly as it always has: a bare `my-12`, nothing added.
    const { container } = render(
      <ContainerBlockComponent {...containerWith({})} />,
    )
    expect(container.querySelector('section')?.className).toBe('my-12')
  })

  it('keeps the compact my-12 when the rhythm is explicitly the default', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { rhythm: 'default' } })}
      />,
    )
    const section = container.querySelector('section')
    expect(section?.className).toBe('my-12')
    expect(section).not.toHaveClass('my-24', 'md:my-28')
  })

  it('reproduces the homepage two-column rhythm when opted in', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { rhythm: 'home' } })}
      />,
    )
    const section = container.querySelector('section')
    expect(section).toHaveClass('my-24', 'md:my-28')
    // ...in place of the compact default, not alongside it.
    expect(section).not.toHaveClass('my-12')
  })

  it('falls back to the compact default for a stale stored rhythm', () => {
    const { container } = render(
      <ContainerBlockComponent
        {...containerWith({ section: { rhythm: 'homeParity' } })}
      />,
    )
    const section = container.querySelector('section')
    expect(section?.className).toBe('my-12')
  })
})
