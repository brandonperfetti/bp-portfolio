import { useRef } from 'react'

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePageChangeAnchor } from '@/lib/usePageChangeAnchor'

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
  armTarget,
  withContainer = true,
}: {
  page: number
  /** The page the harness's "arm" click claims it is navigating to. */
  armTarget: number
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
      <button
        type="button"
        data-testid="arm"
        onClick={() => anchor.armAnchor(armTarget)}
      >
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
  focusable?: boolean
}) {
  const harnessProps = { withContainer: options?.withContainer }
  // The rendered `page`, tracked so an arming re-render (which has to carry the
  // click's target) never accidentally moves the page itself.
  let currentPage = 1
  const view = render(<Harness page={1} armTarget={1} {...harnessProps} />)
  const show = (page: number, armTarget: number) => {
    currentPage = page
    view.rerender(
      <Harness page={page} armTarget={armTarget} {...harnessProps} />,
    )
  }
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
  if (options?.focusable === false) {
    // The same environment gap on the other half of the anchor: an element
    // the DOM implementation handed back without a `focus` method.
    Object.defineProperty(results, 'focus', {
      configurable: true,
      value: undefined,
    })
  }
  return {
    results,
    /** A page change that came from a pagination click. */
    navigate: (page: number) => {
      show(currentPage, page)
      fireEvent.click(view.getByTestId('arm'))
      show(page, page)
    },
    /**
     * A click on a page control whose navigation never lands — the debounced
     * filter `replace` supersedes the push, so `page` never moves.
     */
    armOnly: (target: number) => {
      show(currentPage, target)
      fireEvent.click(view.getByTestId('arm'))
    },
    /** A page change that came from somewhere else (a filter reset). */
    driftTo: (page: number) => {
      show(page, page)
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

  it('does not anchor a later page change when the armed push was superseded', () => {
    // The leak a bare boolean had: the reader clicks "page 3" inside the
    // debounced filter window, the surface's `router.replace` drops `?page`
    // and supersedes the push, so `page` lands on 1 instead of 3 — and the
    // arming must not survive to spend itself on that reset (which arrives
    // mid-keystroke) or on anything after it.
    const { results, navigate, armOnly, driftTo } = renderHarness()

    // On page 2, click "page 3" — then the filter reset lands on page 1
    // instead, because the `replace` superseded the push.
    driftTo(2)
    armOnly(3)
    driftTo(1)

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(results)

    // A later, unrelated page change is still not the discarded arming's —
    // including one that happens to land on the page it was armed for.
    driftTo(3)
    expect(scrollIntoView).not.toHaveBeenCalled()

    // …and the next real click anchors normally.
    navigate(2)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(results)
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

  it('still scrolls when the element has no focus method', () => {
    const { results, navigate } = renderHarness({ focusable: false })

    expect(() => navigate(2)).not.toThrow()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    // The guard is what keeps the scroll: an unguarded `focus` call would
    // have thrown out of the effect before this assertion could hold, and
    // focus itself never moved.
    expect(document.activeElement).not.toBe(results)
  })

  it('does not carry an arming across unmount into a fresh instance', () => {
    // S-2A-3: the mount-scoped cleanup (`armedRef.current = null`) is inert —
    // `armedRef` is a `useRef` scoped to one component instance, so it is
    // deallocated with that instance whether or not the cleanup runs. This
    // asserts exactly that fact: arm, unmount, then mount a brand-new
    // instance already sitting on the armed page — a leaked arming would
    // fire here, but a fresh `useRef` starts at `null` regardless of the
    // predecessor's fate, so nothing scrolls or focuses.
    const { results, armOnly } = renderHarness()
    armOnly(2)
    cleanup()

    // React flushes mount effects synchronously inside `render()`'s own
    // `act()` call, so a leaked arm would fire *before* `render()` returns.
    // The stub has to already be in place for that effect to find — on the
    // prototype, since the node it will land on does not exist yet — or a
    // leaked call goes unobserved and the scroll assertion below is vacuous.
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    try {
      const view = render(<Harness page={2} armTarget={2} />)
      const freshResults = view.getByTestId('results') as HTMLElement

      expect(scrollIntoView).not.toHaveBeenCalled()
      expect(document.activeElement).not.toBe(results)
      expect(document.activeElement).not.toBe(freshResults)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    }
  })
})
