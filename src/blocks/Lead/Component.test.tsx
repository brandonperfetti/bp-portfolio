import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LeadBlockComponent } from '@/blocks/Lead/Component'
import { LEAD_CLASS } from '@/blocks/Lead/lead'
import type { LeadBlock } from '@/payload-types'

// GSAP wrapper (registers ScrollTrigger at import, which needs matchMedia):
// mark the wrapper so "on wraps, off is bare" is observable here — the story
// asserts the reveal is real in a browser.
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => (
    <div data-scroll-reveal>{children}</div>
  ),
}))

const lead = (props: Partial<LeadBlock> = {}) =>
  ({ blockType: 'lead', text: 'How I can help', ...props }) as LeadBlock

const paragraph = (container: HTMLElement) => container.querySelector('p')

describe('LeadBlockComponent', () => {
  it('renders the about page lead paragraph with its exact classes', () => {
    const { container } = render(<LeadBlockComponent {...lead()} />)

    const para = paragraph(container) as HTMLElement
    expect(para).toHaveTextContent('How I can help')
    // The classes ride the wrapping div, verbatim from the about page.
    expect(para.parentElement).toHaveAttribute('class', LEAD_CLASS)
  })

  it('renders bare — no ScrollReveal — when the reveal toggle is off (the default)', () => {
    const { container } = render(<LeadBlockComponent {...lead()} />)

    expect(container.querySelector('[data-scroll-reveal]')).toBeNull()
    // The lead div sits at the top of the block, not inside a reveal wrapper.
    expect(paragraph(container)?.parentElement).toBe(
      container.firstElementChild,
    )
  })

  it('wraps in a ScrollReveal when the reveal toggle is on', () => {
    const { container } = render(
      <LeadBlockComponent {...lead({ reveal: true })} />,
    )

    const wrapper = container.querySelector('[data-scroll-reveal]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector('p')).toHaveTextContent('How I can help')
  })

  it('renders nothing for empty or whitespace-only text', () => {
    for (const text of ['', '   ', null]) {
      const { container } = render(
        <LeadBlockComponent {...lead({ text: text as string })} />,
      )
      expect(container).toBeEmptyDOMElement()
    }
  })

  it('lays out identically whether hosted at root or in a column', () => {
    // The lead carries its own `mt-6`, not the host-dependent rhythm the
    // width-owning blocks switch on `hosted`, so both render the same node.
    const root = render(<LeadBlockComponent {...lead()} />).container.innerHTML
    const column = render(<LeadBlockComponent {...lead()} hosted="column" />)
      .container.innerHTML

    expect(root).toBe(column)
    expect(root).not.toContain('my-12')
  })
})
