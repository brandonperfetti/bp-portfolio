import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { Page } from '@/payload-types'

type LayoutBlock = NonNullable<Page['layout']>[number]

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

describe('RenderBlocks', () => {
  it('dispatches registered block types and skips unknown ones', () => {
    const blocks = [
      {
        blockType: 'content',
        columns: [{ id: 'c', size: 'full', richText: text('column copy') }],
      },
      {
        blockType: 'cta',
        richText: text('cta copy'),
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
      { blockType: 'spacer', size: 'sm' },
      {
        blockType: 'photoStrip',
        images: [{ id: 1, url: 'https://example.com/strip.jpg', alt: '' }],
      },
      { blockType: 'mystery' } as unknown,
    ] as LayoutBlock[]

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(<RenderBlocks blocks={blocks} />)
      expect(screen.getByText('column copy')).toBeInTheDocument()
      expect(screen.getByText('cta copy')).toBeInTheDocument()
      expect(
        container.querySelector('img[src="https://example.com/strip.jpg"]'),
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute(
        'href',
        'https://example.com',
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('recurses through container → column → block content', () => {
    const blocks = [
      {
        blockType: 'container',
        columns: [
          {
            blockType: 'column',
            id: 'main',
            size: 'twoThirds',
            content: [
              { blockType: 'cta', id: 'cta', richText: text('nested copy') },
            ],
          },
          {
            blockType: 'column',
            id: 'rail',
            size: 'oneThird',
            content: [{ blockType: 'spacer', id: 'gap', size: 'sm' }],
          },
        ],
      },
    ] as unknown as LayoutBlock[]

    const { container } = render(<RenderBlocks blocks={blocks} />)
    expect(screen.getByText('nested copy')).toBeInTheDocument()
    expect(container.querySelector('.lg\\:col-span-8')).toBeInTheDocument()
    expect(container.querySelector('.lg\\:col-span-4')).toBeInTheDocument()
  })

  it('warns about unknown blockTypes outside production, naming the type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(
        <RenderBlocks
          blocks={[{ blockType: 'mystery' } as unknown as LayoutBlock]}
        />,
      )
      expect(container).toBeEmptyDOMElement()
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown blockType "mystery"'),
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('stays silent about unknown blockTypes in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(
        <RenderBlocks
          blocks={[{ blockType: 'mystery' } as unknown as LayoutBlock]}
        />,
      )
      expect(container).toBeEmptyDOMElement()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('renders nothing for empty layouts', () => {
    const { container } = render(<RenderBlocks blocks={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

/**
 * Host context (#40, visual-QA F1–F3). A leaf block used to lay itself out as
 * if it owned the page: its own `my-12` on top of the column's row gap, a
 * `max-w-xl` card stranding half a background band, and grids counting
 * columns off the viewport. `hosted` is the one fact that fixes all three —
 * and it has to default to `root`, because every call site that predates it
 * passes nothing.
 */
describe('RenderBlocks host context', () => {
  const HOSTED_LEAVES = [
    { blockType: 'newsletterSignup', id: 'signup' },
    {
      blockType: 'stats',
      id: 'metrics',
      items: [{ id: 'm1', value: '12+', label: 'Years' }],
    },
    {
      blockType: 'testimonials',
      id: 'quotes',
      items: [
        { id: 'q1', quote: 'One', name: 'A' },
        { id: 'q2', quote: 'Two', name: 'B' },
        { id: 'q3', quote: 'Three', name: 'C' },
      ],
    },
  ] as unknown as LayoutBlock[]

  const sections = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('section'))

  it('defaults to root: blocks keep their own rhythm and reading measure', () => {
    const { container } = render(<RenderBlocks blocks={HOSTED_LEAVES} />)

    for (const section of sections(container)) {
      expect(section).toHaveClass('my-12')
    }
    expect(sections(container)[0]).toHaveClass('max-w-xl')
  })

  it('hands rhythm and width to the column when hosted in one', () => {
    const { container } = render(
      <RenderBlocks
        blocks={
          [
            {
              blockType: 'container',
              columns: [
                {
                  blockType: 'column',
                  id: 'panel',
                  size: 'full',
                  content: HOSTED_LEAVES,
                },
              ],
            },
          ] as unknown as LayoutBlock[]
        }
      />,
    )

    // The container block's own section still carries the rhythm — it is the
    // root-level block here; only its leaves are column-hosted.
    for (const section of sections(container).slice(1)) {
      expect(section).not.toHaveClass('my-12')
    }
    expect(sections(container)[1]).toHaveClass('max-w-none')
    expect(sections(container)[1]).not.toHaveClass('max-w-xl')

    const column = container.querySelector('div.lg\\:col-span-12')
    expect(column).toHaveClass('space-y-10')
  })

  it('counts grid columns off the block container, not the viewport', () => {
    const { container } = render(<RenderBlocks blocks={HOSTED_LEAVES} />)
    const grid = container.querySelector('ul[role="list"]')

    expect(grid?.className).toContain('@md:grid-cols-2')
    expect(grid?.className).toContain('@3xl:grid-cols-3')
    expect(grid?.className).not.toMatch(/(?<![@\w-])(sm|lg):grid-cols-/)
    // The query container is the wrapper that already carries the margin, so
    // the grid's `mt-8` still collapses into the section's rhythm.
    expect(grid?.parentElement).toHaveClass('@container', 'mt-8')
  })
})
