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
