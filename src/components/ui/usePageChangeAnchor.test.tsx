import { useRef } from 'react'

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePageChangeAnchor } from '@/components/ui/usePageChangeAnchor'

/**
 * Unit coverage for the #183 re-anchor hook, exercised through a harness
 * rather than `renderHook` because the behavior under test is what the hook
 * does to a real DOM node.
 *
 * @remarks jsdom implements no layout and no `Element.scrollIntoView`, so the
 * anchor's own method is stubbed per test — that stub *is* the assertion
 * surface for "did we scroll, and how".
 */

/** Stubs `matchMedia` so {@link getPrefersReducedMotion} has something to read. */
function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

/** The stub standing in for the anchor's missing jsdom `scrollIntoView`. */
let scrollIntoView: ReturnType<typeof vi.fn>

function Harness({
  page,
  withContainer = true,
}: {
  page: number
  withContainer?: boolean
}) {
  const resultsRef = useRef<HTMLDivElement>(null)
  const anchor = usePageChangeAnchor({
    page,
    resultsRef: withContainer ? resultsRef : undefined,
  })
  return (
    <div>
      {/* Arming is a click in the real control, so it is a click here too —
          and it keeps the handle out of a module-level variable a render
          would have to reassign. */}
      <button type="button" data-testid="arm" onClick={anchor.armAnchor}>
        arm
      </button>
      <div ref={resultsRef} tabIndex={-1} data-testid="results">
        results
      </div>
    </div>
  )
}

/**
 * Render the harness at a page and return a `goToPage` that mimics the real
 * flow: arm from the click, then let the router-driven `page` prop change.
 */
function renderHarness(options?: {
  withContainer?: boolean
  scrollable?: boolean
}) {
  const harnessProps = { withContainer: options?.withContainer }
  const view = render(<Harness page={1} {...harnessProps} />)
  const results = view.getByTestId('results') as HTMLElement
  if (options?.scrollable === false) {
    // Model the jsdom-shaped element: no `scrollIntoView` at all.
    Object.defineProperty(results, 'scrollIntoView', {
      configurable: true,
      value: undefined,
    })
  } else {
    scrollIntoView = vi.fn()
    Object.defineProperty(results, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
  }
  return {
    results,
    /** A page change that came from a pagination click. */
    navigate: (page: number) => {
      fireEvent.click(view.getByTestId('arm'))
      view.rerender(<Harness page={page} {...harnessProps} />)
    },
    /** A page change that came from somewhere else (a filter reset). */
    driftTo: (page: number) => {
      view.rerender(<Harness page={page} {...harnessProps} />)
    },
  }
}

beforeEach(() => {
  setReducedMotion(false)
  scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('usePageChangeAnchor (#183)', () => {
  it('does nothing on the first render', () => {
    const { results } = renderHarness()

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(results)
  })

  it('scrolls the results container into view and focuses it on an armed page change', () => {
    const { results, navigate } = renderHarness()

    navigate(2)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    })
    expect(document.activeElement).toBe(results)
  })

  it('scrolls instantly under prefers-reduced-motion', () => {
    setReducedMotion(true)
    const { navigate } = renderHarness()

    navigate(2)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    })
  })

  it('leaves focus alone for a page change nobody armed', () => {
    // The filter reset of #88: `?page` is dropped while the reader is typing.
    const { results, driftTo } = renderHarness()

    driftTo(1)
    driftTo(3)

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(results)
  })

  it('spends the arming on one page change only', () => {
    const { navigate, driftTo } = renderHarness()

    navigate(2)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    driftTo(3)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('is inert when no results container was supplied', () => {
    const { results, navigate } = renderHarness({ withContainer: false })

    expect(() => navigate(2)).not.toThrow()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(results)
  })

  it('still moves focus when the element has no scrollIntoView', () => {
    const { results, navigate } = renderHarness({ scrollable: false })

    expect(() => navigate(2)).not.toThrow()
    expect(document.activeElement).toBe(results)
  })
})
