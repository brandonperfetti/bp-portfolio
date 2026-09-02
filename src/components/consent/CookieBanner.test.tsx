import { useEffect } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import {
  CONSENT_TRIGGER_ATTR,
  clearConsentTrigger,
  takeConsentTrigger,
} from './consent-focus'
import { CONSENT_INSET_PROPERTY, releaseConsentInset } from './consent-inset'
import { CookieBanner } from './CookieBanner'

// jsdom has no matchMedia; c15t's color-scheme hook needs it (mirrors the
// repo's ShareModal.test pattern).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

afterEach(() => {
  cleanup()
  clearConsentTrigger()
  releaseConsentInset()
})

/**
 * Resets c15t's module-level singleton on mount. Without this, a test that
 * opens the dialog (or records consent) leaves `activeUI`/`hasConsented` set
 * for every later test in the file — the same singleton-leak lesson the
 * Storybook harness learned in #111, where `localStorage.clear()` alone was not
 * enough.
 */
function ResetConsentOnMount() {
  const { resetConsents, setActiveUI } = useConsentManager()
  useEffect(() => {
    resetConsents()
    setActiveUI('none')
    // Run once per mount; both are stable store methods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderBanner(consentRequired: boolean | null) {
  return render(
    <ConsentManagerProvider
      options={buildConsentManagerOptions({ scripts: [] })}
    >
      <ResetConsentOnMount />
      <CookieBanner consentRequired={consentRequired} />
    </ConsentManagerProvider>,
  )
}

describe('CookieBanner layout (Fix 1 — centered, not left-pinned)', () => {
  it('shows the banner where consent is required and centers its card', () => {
    renderBanner(true)
    const region = screen.getByRole('region', { name: /cookie consent/i })
    // Gutters live on the fixed wrapper as padding (not margins on the card).
    expect(region.className).toContain('px-3')
    expect(region.className).toContain('sm:px-4')

    const card = region.firstElementChild as HTMLElement
    // The card stays mx-auto-centered at max-w-3xl; the `sm:mx-4` that used to
    // override mx-auto (and clip the left edge) is gone.
    expect(card.className).toContain('mx-auto')
    expect(card.className).toContain('max-w-3xl')
    expect(card.className).not.toContain('sm:mx-4')
  })

  it('does not render the banner where consent is confidently not required', () => {
    renderBanner(false)
    expect(
      screen.queryByRole('region', { name: /cookie consent/i }),
    ).not.toBeInTheDocument()
  })
})

describe('CookieBanner default (empty-CMS) copy + toggles', () => {
  // Rendered without a ConsentConfigProvider → the context default
  // (DEFAULT_CONSENT_CONFIG) drives it, i.e. today's copy verbatim.
  it('renders the default message + buttons, including Customize (showManageButton on)', () => {
    renderBanner(true)
    expect(
      screen.getByText(/cookieless analytics baseline/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /cookie details/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^accept all$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /reject non-essential/i }),
    ).toBeInTheDocument()
    // showManageButton defaults on → the Customize control is present.
    expect(
      screen.getByRole('button', { name: /customize/i }),
    ).toBeInTheDocument()
  })
})

describe('CookieBanner dialog triggers (#112 — return-focus capture)', () => {
  it('labels both banner triggers so a remounted one can be re-found', () => {
    renderBanner(true)
    expect(screen.getByRole('button', { name: /customize/i })).toHaveAttribute(
      CONSENT_TRIGGER_ATTR,
      'banner-customize',
    )
    expect(
      screen.getByRole('button', { name: /cookie details/i }),
    ).toHaveAttribute(CONSENT_TRIGGER_ATTR, 'banner-cookie-details')
  })

  it.each([
    ['customize', /customize/i, 'banner-customize'],
    ['cookie details', /cookie details/i, 'banner-cookie-details'],
  ] as const)(
    'records the "%s" trigger synchronously, before the banner unmounts',
    async (_label, name, id) => {
      const user = userEvent.setup()
      renderBanner(true)
      const trigger = screen.getByRole('button', { name })

      await user.click(trigger)

      // The capture is what CookieDialog consumes on open. Without it the
      // dialog would read `document.activeElement` — already `<body>`, because
      // this banner un-renders itself the moment activeUI becomes 'dialog'.
      expect(takeConsentTrigger()).toEqual({ id, element: trigger })
      expect(
        screen.queryByRole('region', { name: /cookie consent/i }),
      ).not.toBeInTheDocument()
    },
  )
})

describe('CookieBanner shell inset (#115 — reserve space while shown)', () => {
  it('reserves bottom space while consent is required and undecided', () => {
    renderBanner(true)
    // jsdom has no layout, so the measured height is 0 — the *reservation*
    // (and its release below) is what is observable here; the real measurement
    // and the resulting no-overlap are covered by the story + e2e spec.
    expect(
      document.documentElement.style.getPropertyValue(CONSENT_INSET_PROPERTY),
    ).toBe('0px')
    expect(document.body.style.paddingBottom).toBe(
      `var(${CONSENT_INSET_PROPERTY})`,
    )
  })

  it('reserves nothing where consent is confidently not required', () => {
    renderBanner(false)
    expect(
      document.documentElement.style.getPropertyValue(CONSENT_INSET_PROPERTY),
    ).toBe('')
    expect(document.body.style.paddingBottom).toBe('')
  })
})

/**
 * #140 — the hydration mismatch, reproduced end to end.
 *
 * Cause chain, read off the installed c15t 2.2.1 rather than assumed:
 * `createConsentManagerStore` calls `getStoredConsent(storageConfig)`
 * **synchronously at store creation** and seeds `consentInfo` from it, and
 * `ConsentManagerProvider` creates that store *during render*
 * (`useMemo(() => getOrCreateConsentRuntime(...))`) and publishes it with a
 * plain `useState(() => store.getState())` — not `useSyncExternalStore`, and
 * with no `getServerSnapshot` seam anywhere. So a returning visitor's
 * persisted `bp-consent` choice is already in the store on the client's FIRST
 * (hydration) render, while the server — no localStorage, no cookie — rendered
 * with `hasConsented()` false. `visible` was computed straight from that, so
 * the two trees disagreed and React threw the SSR output away.
 *
 * Each phase below uses its own `storageKey`: c15t's runtime cache is keyed on
 * it (`generateRuntimeCacheKey`), so a distinct key is a fresh store — the
 * isolation this file otherwise gets from `ResetConsentOnMount`, which cannot
 * be used here because these tests need the persisted state left in place.
 */
describe('CookieBanner hydration (#140)', () => {
  function optionsFor(storageKey: string) {
    return {
      ...buildConsentManagerOptions({ scripts: [] }),
      storageConfig: { storageKey },
    }
  }

  function Tree({
    storageKey,
    consentRequired,
  }: {
    storageKey: string
    consentRequired: boolean | null
  }) {
    return (
      // Wrapped in a shell element on purpose: React tolerates unmatched
      // *top-level* children of the hydration container, so a banner rendered
      // as the root's own child would hide the very mismatch under test. In
      // the app the banner is likewise nested inside the layout shell.
      <div data-testid="app-shell">
        <ConsentManagerProvider options={optionsFor(storageKey)}>
          <CookieBanner consentRequired={consentRequired} />
        </ConsentManagerProvider>
      </div>
    )
  }

  /** An authentic persisted payload, produced by a real accept-all. */
  async function persistedConsentChoice() {
    const user = userEvent.setup()
    render(
      <ConsentManagerProvider options={optionsFor('bp-consent-seed')}>
        <ResetConsentOnMount />
        <CookieBanner consentRequired={true} />
      </ConsentManagerProvider>,
    )
    await user.click(screen.getByRole('button', { name: /^accept all$/i }))
    const stored = localStorage.getItem('bp-consent-seed')
    cleanup()
    return stored
  }

  /**
   * Renders server markup, hydrates it against the given persisted state, and
   * reports every recoverable error React surfaced plus the hydrated DOM.
   */
  async function hydrateAgainstServerMarkup({
    consentRequired,
    persisted,
    keyPrefix,
  }: {
    consentRequired: boolean | null
    persisted: string | null
    keyPrefix: string
  }) {
    // Server: no browser storage at all, which is what makes `hasConsented()`
    // false there.
    localStorage.removeItem(`${keyPrefix}-server`)
    const html = renderToString(
      <Tree
        storageKey={`${keyPrefix}-server`}
        consentRequired={consentRequired}
      />,
    )

    // Client: the returning visitor's storage, read synchronously by the store.
    const clientKey = `${keyPrefix}-client`
    if (persisted) localStorage.setItem(clientKey, persisted)
    else localStorage.removeItem(clientKey)

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const recoverable: string[] = []
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        recoverable.push(args.map(String).join(' '))
      })

    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(
        container,
        <Tree storageKey={clientKey} consentRequired={consentRequired} />,
        { onRecoverableError: (error) => recoverable.push(String(error)) },
      )
    })
    consoleError.mockRestore()

    const mismatches = recoverable.filter((message) =>
      /hydrat|did not match|server (?:rendered|html)/i.test(message),
    )
    const banner = container.querySelector('[aria-label="Cookie consent"]')

    await act(async () => {
      root?.unmount()
    })
    container.remove()
    localStorage.removeItem(clientKey)

    return { mismatches, banner, serverHtml: html }
  }

  it('hydrates a returning visitor (persisted choice) with no mismatch, and shows no banner', async () => {
    const persisted = await persistedConsentChoice()
    expect(persisted).toBeTruthy()

    const { mismatches, banner } = await hydrateAgainstServerMarkup({
      consentRequired: null,
      persisted,
      keyPrefix: 'bp-consent-returning',
    })

    // The #140 defect: server said "banner", client said "no banner".
    expect(mismatches).toEqual([])
    // Behaviour unchanged for this state — a visitor who already chose sees
    // nothing after mount either.
    expect(banner).toBeNull()
  })

  it('hydrates a first-time visitor with no mismatch, and still shows the banner once mounted', async () => {
    const { mismatches, banner } = await hydrateAgainstServerMarkup({
      consentRequired: true,
      persisted: null,
      keyPrefix: 'bp-consent-firsttime',
    })

    expect(mismatches).toEqual([])
    // The gate delays the banner by one commit; it does not remove it.
    expect(banner).not.toBeNull()
  })
})
