import { afterEach, describe, expect, it } from 'vitest'

import {
  CONSENT_TRIGGER_ATTR,
  captureConsentTrigger,
  clearConsentTrigger,
  resolveConsentReturnTarget,
  restoreConsentTriggerFocus,
  takeConsentTrigger,
} from './consent-focus'

/**
 * The *resolution order* for #112's return focus. The focus timing itself (does
 * focus actually land after Radix releases its scope) is a real-browser
 * behavior, covered by `e2e/consent-focus-return.spec.ts` — jsdom cannot
 * observe it, the #110 lesson. What is testable here, and what the bug actually
 * was, is which element we aim at once the banner has unmounted its trigger.
 */

function trigger(id: string, label = id): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.setAttribute(CONSENT_TRIGGER_ATTR, id)
  el.textContent = label
  document.body.append(el)
  return el
}

afterEach(() => {
  clearConsentTrigger()
  document.body.innerHTML = ''
})

describe('consent trigger capture', () => {
  it('hands the capture to exactly one consumer', () => {
    const el = trigger('footer-manage')
    captureConsentTrigger('footer-manage', el)

    expect(takeConsentTrigger()).toEqual({ id: 'footer-manage', element: el })
    // A later programmatic open must not inherit a stale trigger.
    expect(takeConsentTrigger()).toBeNull()
  })
})

describe('resolveConsentReturnTarget', () => {
  it('returns the captured node while it is still mounted (footer flow)', () => {
    const el = trigger('footer-manage')
    expect(
      resolveConsentReturnTarget({ id: 'footer-manage', element: el }),
    ).toBe(el)
  })

  it('re-finds a banner trigger that remounted as a new node', () => {
    // The exact #112 shape: the banner unmounts its "Customize" button as the
    // dialog opens, then remounts a *different* node when the dialog closes.
    const original = trigger('banner-customize', 'Customize')
    const capture = { id: 'banner-customize' as const, element: original }
    original.remove()

    const remounted = trigger('banner-customize', 'Customize')
    expect(resolveConsentReturnTarget(capture)).toBe(remounted)
    expect(resolveConsentReturnTarget(capture)).not.toBe(original)
  })

  it('falls back to the persistent footer entry point when the banner is gone for good', () => {
    // An explicit choice made inside the dialog dismisses the banner
    // permanently, so the originating trigger never comes back.
    const original = trigger('banner-cookie-details', 'cookie details')
    const capture = { id: 'banner-cookie-details' as const, element: original }
    original.remove()
    const footer = trigger('footer-manage', 'Manage cookies')

    expect(resolveConsentReturnTarget(capture)).toBe(footer)
  })

  it('returns null rather than parking focus somewhere arbitrary', () => {
    const orphan = document.createElement('button')
    orphan.setAttribute(CONSENT_TRIGGER_ATTR, 'banner-customize')

    expect(
      resolveConsentReturnTarget({
        id: 'banner-customize',
        element: orphan,
      }),
    ).toBeNull()
    expect(resolveConsentReturnTarget(null)).toBeNull()
  })

  it('does not loop back to itself when the footer trigger is the one that vanished', () => {
    const footer = trigger('footer-manage')
    const capture = { id: 'footer-manage' as const, element: footer }
    footer.remove()

    expect(resolveConsentReturnTarget(capture)).toBeNull()
  })
})

describe('restoreConsentTriggerFocus', () => {
  it('focuses the remounted banner trigger, not <body>', () => {
    const original = trigger('banner-customize', 'Customize')
    const capture = { id: 'banner-customize' as const, element: original }
    original.remove()
    const remounted = trigger('banner-customize', 'Customize')

    restoreConsentTriggerFocus(capture)
    expect(document.activeElement).toBe(remounted)
    expect(document.activeElement).not.toBe(document.body)
  })

  it('leaves focus alone when nothing focusable remains', () => {
    const orphan = document.createElement('button')
    orphan.setAttribute(CONSENT_TRIGGER_ATTR, 'banner-customize')
    const elsewhere = trigger('unrelated')
    elsewhere.focus()

    restoreConsentTriggerFocus({ id: 'banner-customize', element: orphan })
    expect(document.activeElement).toBe(elsewhere)
  })
})
