import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageBlockComponent } from '@/blocks/Image/Component'
import type { ImageBlock, Media } from '@/payload-types'

/**
 * `next/image` reduced to the props it was handed, so the assertions below
 * are about what the block asks for (`priority`) rather than about how Next
 * chooses to spell it in the DOM this week.
 */
vi.mock('next/image', () => ({
  default: ({ priority, ...rest }: any) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...rest} data-priority={priority ? 'true' : 'false'} />
  ),
}))
vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ children }: any) => (
    <div data-hover-motion-card>{children}</div>
  ),
}))

const media: Media = {
  id: 1,
  url: 'https://example.com/portrait.jpg',
  alt: 'Brandon Perfetti',
  width: 800,
  height: 800,
} as Media

const block = (overrides: Partial<ImageBlock> = {}): ImageBlock =>
  ({
    blockType: 'image',
    media,
    aspect: 'auto',
    rounded: '2xl',
    tilt: 'none',
    ...overrides,
  }) as ImageBlock

describe('ImageBlockComponent', () => {
  it('reproduces the about-page portrait from stored field values', () => {
    const { container } = render(
      <ImageBlockComponent
        {...block({
          aspect: 'square',
          rounded: '2xl',
          tilt: 'right',
          hoverScale: true,
        })}
      />,
    )

    const frame = container.querySelector('[data-hover-motion-card] > div')
    expect(frame).toHaveClass('overflow-hidden', 'rounded-2xl', 'rotate-3')
    expect(screen.getByAltText('Brandon Perfetti')).toHaveClass(
      'aspect-square',
      'object-cover',
    )
  })

  it('leaves out the motion wrapper unless hover scale is on', () => {
    const { container } = render(<ImageBlockComponent {...block()} />)
    expect(container.querySelector('[data-hover-motion-card]')).toBeNull()
  })

  it('passes the LCP hint through to next/image', () => {
    const { rerender } = render(
      <ImageBlockComponent {...block({ priority: true })} />,
    )
    expect(screen.getByAltText('Brandon Perfetti')).toHaveAttribute(
      'data-priority',
      'true',
    )

    rerender(<ImageBlockComponent {...block({ priority: false })} />)
    expect(screen.getByAltText('Brandon Perfetti')).toHaveAttribute(
      'data-priority',
      'false',
    )
  })

  it('renders the caption as a figcaption inside the figure', () => {
    render(<ImageBlockComponent {...block({ caption: 'On the pier' })} />)
    const caption = screen.getByText('On the pier')

    expect(caption.tagName).toBe('FIGCAPTION')
    expect(caption.closest('figure')).not.toBeNull()
  })

  it('renders nothing for an unpopulated or urlless upload', () => {
    const asId = render(<ImageBlockComponent {...block({ media: 7 })} />)
    expect(asId.container).toBeEmptyDOMElement()

    const noUrl = render(
      <ImageBlockComponent {...block({ media: { id: 1 } as Media })} />,
    )
    expect(noUrl.container).toBeEmptyDOMElement()
  })

  it('takes its outer rhythm from the host context', () => {
    const root = render(<ImageBlockComponent {...block()} />)
    expect(root.container.querySelector('figure')).toHaveClass('my-12')

    const hosted = render(<ImageBlockComponent {...block()} hosted="column" />)
    expect(hosted.container.querySelector('figure')).not.toHaveClass('my-12')
  })

  it('pads the figure only when the rail inset is asked for', () => {
    const none = render(<ImageBlockComponent {...block({ inset: 'none' })} />)
    expect(none.container.querySelector('figure')).not.toHaveClass('px-2.5')

    const xs = render(<ImageBlockComponent {...block({ inset: 'xs' })} />)
    expect(xs.container.querySelector('figure')).toHaveClass('px-2.5')
  })
})
