/**
 * Return-focus coordination between the consent triggers and the consent
 * dialog (#112).
 *
 * @remarks
 * `CookieDialog` cannot discover its own opener from `document.activeElement`:
 * `CookieBanner` hides itself the moment `activeUI` becomes `'dialog'`, so by
 * the time the dialog's open effect runs the banner's "Customize" / "cookie
 * details" button is already unmounted and `activeElement` has fallen back to
 * `<body>`. Radix's own restoration is `preventDefault`ed (the #110 no-scroll
 * open path), so focus stayed on `<body>` after close — a WCAG 2.4.3 break for
 * keyboard/AT users.
 *
 * The fix is to record the opener **synchronously in the click handler**,
 * before React re-renders and unmounts it, and to record *which* trigger it was
 * as well as the node itself. The node is enough for the footer
 * `ManageCookiesLink` (it stays mounted); the banner triggers come back as
 * *new* nodes when the banner remounts on close, so the id is what lets us find
 * the replacement. See {@link resolveConsentReturnTarget} for the fallback
 * order.
 *
 * Deliberately framework-free (a module singleton plus pure resolvers) so the
 * capture can happen in a plain DOM event handler and the resolution order is
 * unit-testable without a dialog.
 */

/**
 * Data attribute stamped on every control that can open the consent dialog, so
 * a remounted trigger can be found again after the banner re-renders.
 */
export const CONSENT_TRIGGER_ATTR = 'data-consent-trigger'

/** The controls that can open the consent dialog. */
export type ConsentTriggerId =
  'banner-customize' | 'banner-cookie-details' | 'footer-manage'

/** The trigger recorded at click time, before the opener can unmount. */
export interface ConsentTriggerCapture {
  /** Which control opened the dialog. */
  id: ConsentTriggerId
  /** The exact node clicked; may be detached by the time focus returns. */
  element: HTMLElement | null
}

let pendingCapture: ConsentTriggerCapture | null = null

/**
 * Records the control opening the consent dialog. Call this **synchronously**
 * from the trigger's own click handler — after the state update that opens the
 * dialog, the banner triggers are gone.
 */
export function captureConsentTrigger(
  id: ConsentTriggerId,
  element: HTMLElement | null = null,
): void {
  pendingCapture = { id, element }
}

/**
 * Consumes the pending capture (one per open) and clears it, so a later
 * programmatic open cannot inherit a stale trigger.
 */
export function takeConsentTrigger(): ConsentTriggerCapture | null {
  const capture = pendingCapture
  pendingCapture = null
  return capture
}

/** Test seam: drops any capture that was never consumed. */
export function clearConsentTrigger(): void {
  pendingCapture = null
}

/**
 * Resolves where focus should return, in order:
 *
 * 1. the captured node, when it is still in the document (the footer
 *    "Manage cookies" flow — unchanged behavior);
 * 2. the same trigger remounted, matched on {@link CONSENT_TRIGGER_ATTR} (the
 *    banner flows: the banner re-renders on close while consent is still
 *    undecided, so the button is back but is a new node);
 * 3. the persistent footer entry point, as the "sensible fallback" for the case
 *    where the banner is gone for good — an explicit choice made *inside* the
 *    dialog dismisses the banner permanently, so the trigger never returns.
 *
 * Returns `null` when nothing focusable remains, letting the caller keep its own
 * fallback rather than parking focus on `<body>`.
 */
export function resolveConsentReturnTarget(
  capture: ConsentTriggerCapture | null,
  doc: Document = document,
): HTMLElement | null {
  if (!capture) return null
  if (capture.element?.isConnected) return capture.element

  const remounted = doc.querySelector<HTMLElement>(
    `[${CONSENT_TRIGGER_ATTR}="${capture.id}"]`,
  )
  if (remounted) return remounted

  if (capture.id === 'footer-manage') return null
  return doc.querySelector<HTMLElement>(
    `[${CONSENT_TRIGGER_ATTR}="footer-manage"]`,
  )
}

/**
 * Restores focus to the control that opened the dialog.
 *
 * @remarks
 * `preventScroll` throughout: the #110 fix hinges on never letting a consent
 * focus call move the window. The one retry on the next animation frame covers
 * the ordering the banner-originated flows depend on — the banner remounts in
 * the same React commit that closes the dialog, but Radix's focus scope may not
 * have released focus yet when `onCloseAutoFocus` runs, so the first `focus()`
 * can be undone. Re-resolving (rather than re-using the first target) also picks
 * up a banner that mounted a frame late.
 */
export function restoreConsentTriggerFocus(
  capture: ConsentTriggerCapture | null,
  doc: Document = document,
): void {
  const focusReturnTarget = (): boolean => {
    const target = resolveConsentReturnTarget(capture, doc)
    if (!target) return false
    target.focus({ preventScroll: true })
    return doc.activeElement === target
  }

  if (focusReturnTarget()) return

  const view = doc.defaultView
  if (!view?.requestAnimationFrame) return
  view.requestAnimationFrame(() => {
    focusReturnTarget()
  })
}
