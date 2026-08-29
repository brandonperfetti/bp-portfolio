'use client'

import { useEffect } from 'react'

/**
 * The consent banner's "reserve space while shown" bottom inset (#115,
 * **Option 1** — the pattern Brandon recorded on the ticket 2026-08-28).
 *
 * @remarks
 * The banner is `fixed inset-x-0 bottom-0` and reserves no layout space, so
 * while it is shown it sits *on top of* whatever is at the bottom of the
 * document — most visibly the Corvus composer ("Ask Corvus…" + Send) for a
 * visitor who lands directly on `/corvus` before choosing. Option 1 reserves
 * that space on the app shell instead of offsetting individual controls, so any
 * bottom-of-page control is covered without per-control work.
 *
 * The inset lives here, owned by the consent components, rather than in
 * `src/app/(frontend)/layout.tsx`: the layout's `body.flex min-h-full` is the
 * #110 scroll guard and must not be re-shaped. `padding-bottom` is additive to
 * that shell — it changes neither `display` nor the height model — and, being
 * an inline style, it is untouched by (and does not touch) the `padding-right`
 * that Radix's `react-remove-scroll` writes while the dialog is open.
 *
 * The applied value is also published as a custom property so the reservation
 * is inspectable from a spec or the devtools rather than being an anonymous
 * pixel value.
 *
 * **Lifetime — "released on choice", per the recorded decision.** The inset
 * tracks *consent required + undecided*, NOT banner visibility: the banner
 * un-renders while the dialog is open, and releasing the inset there would
 * shrink the document mid-interaction and re-introduce exactly the #110
 * scroll jump the guard suite pins. It is released when the visitor accepts,
 * rejects, or saves — and on unmount.
 */

/** Custom property carrying the reserved bottom inset, for specs/devtools. */
export const CONSENT_INSET_PROPERTY = '--bp-consent-banner-inset'

/**
 * Reserves `height` px at the bottom of the app shell.
 *
 * @param height - Measured banner height in CSS pixels; clamped at 0.
 * @param doc - Injectable for tests.
 */
export function applyConsentInset(
  height: number,
  doc: Document = document,
): void {
  const px = `${Math.max(0, Math.round(height))}px`
  doc.documentElement.style.setProperty(CONSENT_INSET_PROPERTY, px)
  doc.body.style.setProperty('padding-bottom', `var(${CONSENT_INSET_PROPERTY})`)
}

/** Releases the reservation, restoring the shell's own bottom edge. */
export function releaseConsentInset(doc: Document = document): void {
  doc.documentElement.style.removeProperty(CONSENT_INSET_PROPERTY)
  doc.body.style.removeProperty('padding-bottom')
}

/**
 * Measures the banner and keeps the shell inset in sync with it.
 *
 * @param active - Whether consent is required and still undecided. Stays true
 *   while the dialog is open (when `element` is `null` because the banner
 *   un-rendered), which is what keeps the reservation stable across the open.
 * @param element - The banner's fixed wrapper, or `null` while it is not
 *   rendered. Pass a *state-backed* ref callback, not a `useRef`, so remounts
 *   re-run the effect.
 *
 * @remarks
 * `offsetHeight` (not `getBoundingClientRect()`) on purpose: the banner enters
 * with `slide-in-from-bottom-4`, a transform, which would deflate a rect-based
 * measurement for the duration of the animation. `offsetHeight` is
 * transform-immune, and because a fixed-position box establishes a block
 * formatting context it includes the card's `mb-3` gutter — i.e. the full
 * height the banner actually occupies. A `ResizeObserver` re-measures on the
 * responsive reflow (the card stacks below `sm`, so its height changes with the
 * viewport) and on CMS copy changes.
 */
export function useConsentBannerInset(
  active: boolean,
  element: HTMLElement | null,
): void {
  useEffect(() => {
    if (!active) {
      releaseConsentInset()
      return
    }
    // Banner temporarily un-rendered (the dialog is open): hold the inset that
    // is already applied rather than releasing and re-reserving it.
    if (!element) return

    applyConsentInset(element.offsetHeight)

    const ResizeObserverCtor = window.ResizeObserver
    if (!ResizeObserverCtor) return
    const observer = new ResizeObserverCtor(() => {
      applyConsentInset(element.offsetHeight)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [active, element])

  // Release when the consent surface itself goes away, so a story/test teardown
  // (or a route that unmounts the provider) never leaves the shell padded.
  useEffect(() => () => releaseConsentInset(), [])
}
