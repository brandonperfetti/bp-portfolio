import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ROUTE_RHYTHM_PROFILES } from '@/heros/routeRhythm'
import type { Page } from '@/payload-types'

/**
 * The shared page-builder seam (#42): both `/` and the `[slug]` catch-all
 * render through {@link RenderRhythmPage}, so this suite pins the DOM it emits
 * for each rhythm — the single guarantee that the two routes cannot drift.
 */

// The hero and blocks own their pixels elsewhere; here they are probes that
// report where the seam placed them.
vi.mock('@/heros/RenderHero', () => ({
  RenderHero: ({ page }: { page: Page }) => (
    <div data-testid="render-hero" data-title={page.title} />
  ),
}))
vi.mock('@/blocks/RenderBlocks', () => ({
  RenderBlocks: () => <div data-testid="render-blocks" />,
}))

import { RenderRhythmPage } from '@/heros/RenderRhythmPage'

const page = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 1,
    title: 'Consulting',
    subtitle: 'How I can help',
    slug: 'consulting',
    hero: { type: 'shader', presentation: 'fullBleed', ...hero },
    layout: [],
  }) as unknown as Page

/** The seam's outer container — the element that owns the stacking context. */
const outerContainer = (container: HTMLElement) =>
  container.querySelector('.isolate') as HTMLElement

describe('RenderRhythmPage — standard rhythm (byte-identical to legacy [slug])', () => {
  it('wraps hero and blocks in the historical isolate container', () => {
    const { container } = render(<RenderRhythmPage page={page()} />)
    const outer = outerContainer(container)

    expect(ROUTE_RHYTHM_PROFILES.standard.containerClass).toBe(
      'isolate mt-16 sm:mt-32',
    )
    expect(outer).toHaveClass('isolate', 'mt-16', 'sm:mt-32')
    expect(screen.getByTestId('render-hero')).toBeInTheDocument()
    expect(screen.getByTestId('render-blocks')).toBeInTheDocument()
  })

  it('renders the hero bare and the blocks under mt-8 — no extra wrappers', () => {
    render(<RenderRhythmPage page={page()} />)

    // No home-parity padding wrapper around the hero.
    expect(screen.getByTestId('render-hero').closest('.pt-9')).toBeNull()
    const blocksWrapper = screen.getByTestId('render-blocks').parentElement
    expect(blocksWrapper).toHaveAttribute('class', 'mt-8')
  })

  it('takes the default branch for an unknown stored rhythm', () => {
    const { container } = render(
      <RenderRhythmPage
        page={page({ rhythm: 'flush' } as unknown as Partial<
          NonNullable<Page['hero']>
        >)}
      />,
    )

    expect(outerContainer(container)).toHaveClass('mt-16', 'sm:mt-32')
    expect(screen.getByTestId('render-hero').closest('.pt-9')).toBeNull()
  })
})

describe('RenderRhythmPage — optional actions slot', () => {
  it('renders the actions node in a right-aligned row below the hero', () => {
    render(
      <RenderRhythmPage
        page={page()}
        actions={<button data-testid="page-actions">Share</button>}
      />,
    )

    const actions = screen.getByTestId('page-actions')
    const row = actions.parentElement as HTMLElement
    // The row reads as a deliberate page-header action: right-aligned, spaced
    // from the hero above it.
    expect(row).toHaveClass('mt-8', 'flex', 'justify-end')

    // The row shares the seam's inner content wrapper with the hero, sits
    // *after* the hero (Share reads as below the hero's title/subtitle), and
    // *before* the blocks that follow.
    const hero = screen.getByTestId('render-hero')
    const contentWrapper = hero.parentElement as HTMLElement
    expect(row.parentElement).toBe(contentWrapper)
    expect(
      hero.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const blocksWrapper = screen.getByTestId('render-blocks')
      .parentElement as HTMLElement
    expect(
      row.compareDocumentPosition(blocksWrapper) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('emits no extra wrapper when actions is absent (byte-identical seam)', () => {
    render(<RenderRhythmPage page={page()} />)

    const hero = screen.getByTestId('render-hero')
    const contentWrapper = hero.parentElement as HTMLElement
    // No actions row node anywhere, and the wrapper holds only the bare hero
    // probe plus the blocks wrapper — unchanged from before the slot existed.
    expect(contentWrapper.querySelector('.justify-end')).toBeNull()
    expect(contentWrapper.children).toHaveLength(2)
    expect(contentWrapper.firstElementChild).toBe(hero)
  })
})

describe('RenderRhythmPage — home parity rhythm', () => {
  it('drops the container top margin and keeps the isolation', () => {
    const { container } = render(
      <RenderRhythmPage page={page({ rhythm: 'homeParity' })} />,
    )
    const outer = outerContainer(container)

    expect(outer).toHaveClass('isolate')
    expect(outer.className).not.toContain('mt-16')
    expect(outer.className).not.toContain('mt-32')
  })

  it('pads the hero with the homepage’s pt-9 pb-16 sm:pb-20', () => {
    render(<RenderRhythmPage page={page({ rhythm: 'homeParity' })} />)

    const heroWrapper = screen.getByTestId('render-hero').parentElement
    expect(heroWrapper).toHaveAttribute('class', 'pt-9 pb-16 sm:pb-20')
    expect(heroWrapper?.className).toBe(
      ROUTE_RHYTHM_PROFILES.homeParity.heroWrapperClass,
    )
  })

  it('still wraps both hero and blocks inside the one isolate container', () => {
    const { container } = render(
      <RenderRhythmPage page={page({ rhythm: 'homeParity' })} />,
    )
    const outer = outerContainer(container)

    expect(outer.querySelector('[data-testid="render-hero"]')).not.toBeNull()
    expect(outer.querySelector('[data-testid="render-blocks"]')).not.toBeNull()
  })
})
