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
      { blockType: 'mystery' } as unknown,
    ] as LayoutBlock[]

    render(<RenderBlocks blocks={blocks} />)
    expect(screen.getByText('column copy')).toBeInTheDocument()
    expect(screen.getByText('cta copy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('renders nothing for empty layouts', () => {
    const { container } = render(<RenderBlocks blocks={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
