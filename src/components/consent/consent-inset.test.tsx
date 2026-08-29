import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CONSENT_INSET_PROPERTY,
  applyConsentInset,
  releaseConsentInset,
  useConsentBannerInset,
} from './consent-inset'

/**
 * The #115 "reserve space while shown" inset (Option 1). What matters and is
 * testable in jsdom is the *lifetime*: the reservation must survive the dialog
 * open (when the banner un-renders) and be released only on a consent choice or
 * unmount. The pixel measurement and the resulting no-overlap are browser
 * behaviors — `e2e/consent-banner-inset.spec.ts` and the ConsentManager story.
 */

function insetPx(): string {
  return document.documentElement.style.getPropertyValue(CONSENT_INSET_PROPERTY)
}

/** Harness mirroring CookieBanner: `active` and the measured node are separate. */
function InsetHarness({
  active,
  height,
}: {
  active: boolean
  height: number | null
}) {
  // `height === null` models the banner being un-rendered (the dialog is open).
  const element = height === null ? null : fakeBanner(height)
  useConsentBannerInset(active, element)
  return null
}

const banners = new Map<number, HTMLElement>()
function fakeBanner(height: number): HTMLElement {
  const existing = banners.get(height)
  if (existing) return existing
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetHeight', { value: height })
  document.body.append(el)
  banners.set(height, el)
  return el
}

afterEach(() => {
  cleanup()
  releaseConsentInset()
  banners.clear()
  document.body.innerHTML = ''
})

describe('applyConsentInset / releaseConsentInset', () => {
  it('reserves the measured height on the shell and publishes it', () => {
    applyConsentInset(96.4)
    expect(insetPx()).toBe('96px')
    expect(document.body.style.paddingBottom).toBe(
      `var(${CONSENT_INSET_PROPERTY})`,
    )
  })

  it('clamps a negative measurement instead of shrinking the shell', () => {
    applyConsentInset(-20)
    expect(insetPx()).toBe('0px')
  })

  it('restores the shell exactly on release', () => {
    applyConsentInset(80)
    releaseConsentInset()
    expect(insetPx()).toBe('')
    expect(document.body.style.paddingBottom).toBe('')
  })
})

describe('useConsentBannerInset lifetime', () => {
  it('reserves space while consent is required and undecided', () => {
    render(<InsetHarness active height={120} />)
    expect(insetPx()).toBe('120px')
  })

  it('holds the reservation while the banner is un-rendered for the dialog', () => {
    const view = render(<InsetHarness active height={120} />)
    expect(insetPx()).toBe('120px')

    // Dialog opens: CookieBanner returns null, so the measured node goes away
    // — but consent is still undecided. Releasing here would shrink the
    // document mid-open and re-introduce the #110 scroll jump.
    view.rerender(<InsetHarness active height={null} />)
    expect(insetPx()).toBe('120px')

    // Dialog closed with Escape (still undecided): the banner is back.
    view.rerender(<InsetHarness active height={120} />)
    expect(insetPx()).toBe('120px')
  })

  it('releases on an explicit consent choice', () => {
    const view = render(<InsetHarness active height={120} />)
    view.rerender(<InsetHarness active={false} height={null} />)
    expect(insetPx()).toBe('')
    expect(document.body.style.paddingBottom).toBe('')
  })

  it('re-measures when the banner reflows to a different height', () => {
    const view = render(<InsetHarness active height={120} />)
    view.rerender(<InsetHarness active height={168} />)
    expect(insetPx()).toBe('168px')
  })

  it('releases when the consent surface unmounts', () => {
    const view = render(<InsetHarness active height={120} />)
    view.unmount()
    expect(insetPx()).toBe('')
  })

  it('reserves nothing where consent is not required', () => {
    render(<InsetHarness active={false} height={120} />)
    expect(insetPx()).toBe('')
  })
})
