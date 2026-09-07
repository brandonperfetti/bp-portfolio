'use client'

import * as React from 'react'

import { getPrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'

/** Options for {@link usePageChangeAnchor}. */
export interface PageChangeAnchorOptions {
  /** The current page, already clamped. The effect keys on this. */
  page: number
  /**
   * The results container to re-anchor to — the list/grid element the paged
   * items render into, NOT the surface root and never the search input.
   * Optional so a router-free render (Storybook, the primitive's own unit
   * tests) can leave it out and get the pre-#183 behavior unchanged.
   */
  resultsRef?: React.RefObject<HTMLElement | null>
}

/** What {@link usePageChangeAnchor} hands back to the control. */
export interface PageChangeAnchor {
  /**
   * Arm the re-anchor for the page change this click is about to perform.
   * Called from the click handler, so only a *user-driven* page change
   * anchors — see the hook's remarks.
   */
  armAnchor: () => void
}

/**
 * Re-anchor scroll and focus to the results after a page change (#183).
 *
 * @param options - See {@link PageChangeAnchorOptions}.
 * @returns The arming handle; see {@link PageChangeAnchor}.
 *
 * @remarks
 * - **Why anything is needed.** Every list surface pages with
 *   `router.push(…, { scroll: false })`. That flag is deliberate and stays:
 *   #88's acceptance criteria hang on it (the history entry is what lets the
 *   back button restore the reader's position, and Next's default scroll-to-top
 *   would jump the reader past the hero on every page step). The cost it left
 *   behind is that nothing moves at all — the viewport and the focus ring stay
 *   wherever they were while the entire result set is replaced under them.
 *   This hook pays that cost back without touching the push.
 * - **Armed, not inferred.** The effect fires only for a page change a
 *   pagination control actually performed. A `page` change can also come from
 *   a filter reset (#88 drops `?page` when the query or topic changes) — and
 *   that one arrives *while the reader is typing in the search box*. Inferring
 *   "page changed, therefore anchor" would rip focus out of the input
 *   mid-word. Arming from the click is the only signal that separates the two,
 *   and it makes the initial mount a no-op for free.
 * - **Motion.** `block: 'start'` with `behavior: 'smooth'`, downgraded to
 *   `'auto'` under `prefers-reduced-motion` via the shared
 *   {@link getPrefersReducedMotion} read (no component may re-check
 *   `matchMedia` inline). The sticky-header offset is carried by the anchor
 *   element's own `scroll-mt-16`, the same utility `ContainerGrid` uses for
 *   id-linked sections — the offset belongs to the target, not to the caller
 *   of `scrollIntoView`.
 * - **Focus without a ring flash.** The anchor is focused with
 *   `preventScroll: true` so the browser's own focus scroll cannot fight the
 *   smooth scroll already in flight. It carries `tabIndex={-1}`, and the base
 *   layer's focus outline is scoped to
 *   `[tabindex]:not([tabindex='-1'])` (`src/styles/tailwind.css`) — so a
 *   programmatic focus here draws no teal outline, by construction rather than
 *   by luck.
 * - **Guards.** A missing ref, or a jsdom element with no `scrollIntoView`,
 *   degrades to doing nothing rather than throwing.
 */
export function usePageChangeAnchor({
  page,
  resultsRef,
}: PageChangeAnchorOptions): PageChangeAnchor {
  const armedRef = React.useRef(false)

  React.useEffect(() => {
    if (!armedRef.current) {
      return
    }
    armedRef.current = false

    const anchor = resultsRef?.current
    if (!anchor) {
      return
    }

    // jsdom implements no layout and, depending on the version, no
    // `scrollIntoView` at all.
    if (typeof anchor.scrollIntoView === 'function') {
      anchor.scrollIntoView({
        behavior: getPrefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      })
    }
    anchor.focus({ preventScroll: true })
  }, [page, resultsRef])

  return React.useMemo(
    () => ({
      armAnchor: () => {
        armedRef.current = true
      },
    }),
    [],
  )
}
