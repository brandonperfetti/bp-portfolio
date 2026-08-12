import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_HEADING_LEVEL,
  DEFAULT_HEADING_VARIANT,
  HEADING_LEVEL_CLASSES,
} from '@/blocks/Heading/levels'
import type { HeadingBlock } from '@/payload-types'

const headlineProps = vi.fn()

// The animation itself is a browser fact (GSAP + matchMedia), asserted in
// the stories. What the block decides is which props reach it.
vi.mock('@/components/motion/AnimatedHeadline', () => ({
  AnimatedHeadline: (props: any) => {
    headlineProps(props)
    const Tag = props.as ?? 'h1'
    return (
      <Tag className={props.className} data-variant={props.variant}>
        {props.text}
      </Tag>
    )
  },
}))

const { HeadingBlockComponent } = await import('@/blocks/Heading/Component')

const block = (overrides: Partial<HeadingBlock> = {}): HeadingBlock =>
  ({
    blockType: 'heading',
    text: 'Working together',
    ...overrides,
  }) as HeadingBlock

describe('HeadingBlockComponent', () => {
  beforeEach(() => headlineProps.mockReset())

  it.each(['h1', 'h2', 'h3'] as const)(
    'renders %s as that tag, in the site style for it',
    (level) => {
      render(HeadingBlockComponent(block({ level })))

      const heading = screen.getByRole('heading', { name: 'Working together' })
      expect(heading.tagName).toBe(level.toUpperCase())
      for (const cls of HEADING_LEVEL_CLASSES[level].split(' ')) {
        expect(heading).toHaveClass(cls)
      }
    },
  )

  it.each(['line', 'typewriter'] as const)(
    'hands the %s variant straight to AnimatedHeadline',
    (variant) => {
      render(HeadingBlockComponent(block({ variant })))
      expect(headlineProps).toHaveBeenCalledWith(
        expect.objectContaining({ variant, text: 'Working together' }),
      )
    },
  )

  it('falls back to a section heading with the quiet animation', () => {
    // Both selects are `required`, so the generated type says they are always
    // there — but a Postgres row predating a field, or an import that skipped
    // it, arrives as null. The component must not render `undefined` as a tag.
    render(
      HeadingBlockComponent({
        ...block(),
        level: null as unknown as 'h2',
        variant: null as unknown as 'line',
      }),
    )

    expect(headlineProps).toHaveBeenCalledWith(
      expect.objectContaining({
        as: DEFAULT_HEADING_LEVEL,
        variant: DEFAULT_HEADING_VARIANT,
      }),
    )
  })

  it('renders nothing for text that is missing or only whitespace', () => {
    for (const text of [undefined, '', '   ']) {
      const { container } = render(
        HeadingBlockComponent(block({ text: text as string })),
      )
      expect(container).toBeEmptyDOMElement()
    }
    expect(headlineProps).not.toHaveBeenCalled()
  })

  it('trims stored text — a trailing space would animate as a word', () => {
    render(HeadingBlockComponent(block({ text: '  Working together  ' })))
    expect(headlineProps).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Working together' }),
    )
  })

  it('keeps its rhythm at root and hands it to the column when hosted', () => {
    const root = render(HeadingBlockComponent(block()))
    expect(root.getByRole('heading')).toHaveClass('my-12')

    const column = render(
      HeadingBlockComponent({ ...block(), hosted: 'column' }),
    )
    expect(
      column.container.querySelector('h2, h1, h3') as HTMLElement,
    ).not.toHaveClass('my-12')
  })
})
