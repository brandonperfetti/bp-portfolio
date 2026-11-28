import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

/**
 * #375 — every history in `docs/designs/375-automatic-grant-region.md` § 4,
 * run against the real c15t 2.2.1 runtime in jsdom.
 *
 * ## How the harness stands for a browser
 *
 * - **A page load** is a fresh module graph: `vi.resetModules()` and a
 *   dynamic import of `ConsentManager`. c15t keeps its store in a
 *   module-level cache, and `vitest.config.ts` inlines c15t so the reset
 *   reaches it. Without that, a "fresh load" would reuse the last page's
 *   store and prove nothing.
 * - **Two tabs** are two such trees mounted in one document. jsdom has one
 *   `localStorage` and one cookie jar, which is exactly what two tabs of one
 *   browser share; each tree has its own c15t store, which is each tab's
 *   memory.
 * - **A tab still running production's code** (deploy skew) is modelled by
 *   the storage writes production makes, through c15t's own
 *   `saveConsentToStorage`, so the record has c15t's real shape in both
 *   `localStorage` and the cookie.
 * - **A region change** rewrites the geo cookie the proxy owns and changes
 *   the mocked pathname, which is what a client navigation does.
 * - **A save in flight** is held at c15t's `crypto.subtle.digest`, the one
 *   await between a save's start and its first storage write. The runtime is
 *   initialised first, so a held digest belongs to a save, not to start-up.
 *
 * ## The comparison with production is part of each test
 *
 * Each history is one sequence, written once, that asserts the behaviour the
 * design signs. {@link history} runs it twice: against the change, where it
 * must pass, and against `__production__/` (production's consent code before
 * #375, frozen), where it must either pass too ("production already behaves
 * this way") or fail. A production failure is pinned by its message in
 * `__snapshots__/`, so the reason production fails is reviewed, and a
 * failure for some other reason shows up as a snapshot change.
 */

const { getMockPathname, setMockPathname } = vi.hoisted(() => {
  let pathname = '/'
  return {
    getMockPathname: () => pathname,
    setMockPathname: (next: string) => {
      pathname = next
    },
  }
})
vi.mock('next/navigation', () => ({ usePathname: () => getMockPathname() }))

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

const GA_ID = 'G-HIST375'
const RECORD_KEY = 'bp-consent'
const MARKER_KEY = 'bp-consent-autogrant'
const win = window as unknown as Record<string, unknown>

/** What production's `setConsent('measurement', true)` stores. */
const AUTOMATIC_SHAPE = {
  necessary: true,
  functionality: false,
  measurement: true,
  experience: false,
  marketing: false,
}
const REJECT_SHAPE = { ...AUTOMATIC_SHAPE, measurement: false }

type Region = 'true' | 'false' | null

/** Which consent code a page runs: the change, or production's before #375. */
type Impl = 'change' | 'production'
let impl: Impl = 'change'

/** `window.history`'s own methods, restored after each test. */
const originalPushState = window.history.pushState
const originalReplaceState = window.history.replaceState

/**
 * `popstate` listeners added during a test, removed after it, so one page's
 * landing-route guard cannot answer for another page's.
 */
const originalAddEventListener = window.addEventListener
let popstateListeners: Array<EventListenerOrEventListenerObject> = []

function setRegion(region: Region): void {
  document.cookie =
    region === null
      ? `${CONSENT_REQUIRED_COOKIE}=; max-age=0; path=/`
      : `${CONSENT_REQUIRED_COOKIE}=${region}; path=/`
}

function clearConsentCookies(): void {
  for (const pair of document.cookie.split('; ')) {
    const name = pair.split('=')[0]
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  }
}

const isGoogleTagScript = (script: HTMLScriptElement) =>
  URL.parse(script.src)?.hostname === 'www.googletagmanager.com'

const tagScripts = () =>
  Array.from(document.querySelectorAll('script')).filter(isGoogleTagScript)

const gaDisabled = () => win[`ga-disable-${GA_ID}`]

/**
 * Every Google tag script appended to the document since the test began,
 * removed or not: "the tag loaded at some point on this page" is what a
 * history fails on, and the final DOM alone would miss a tag that loaded and
 * was then dropped.
 */
let tagsEverAppended = 0
const tagObserver = new MutationObserver((records) => {
  for (const record of records)
    for (const node of Array.from(record.addedNodes))
      if (node instanceof HTMLScriptElement && isGoogleTagScript(node))
        tagsEverAppended++
})

/** The stored record, as c15t itself reads it (cookie first). */
async function storedRecord(): Promise<{
  consents?: Record<string, boolean>
  consentInfo?: Record<string, unknown>
} | null> {
  const { getConsentFromStorage } = await import('c15t')
  return getConsentFromStorage({ storageKey: RECORD_KEY })
}

const rawLocalRecord = () => window.localStorage.getItem(RECORD_KEY)
const marker = () => window.localStorage.getItem(MARKER_KEY)

/** A record written the way production's code writes it. */
async function writeRecord(
  consents: Record<string, boolean>,
  options: { marker?: boolean } = {},
): Promise<void> {
  const { saveConsentToStorage } = await import('c15t')
  saveConsentToStorage(
    {
      consents,
      consentInfo: { time: Date.now(), subjectId: 'sub_history' } as never,
    },
    undefined,
    { storageKey: RECORD_KEY },
  )
  if (options.marker) window.localStorage.setItem(MARKER_KEY, '1')
}

/** Lets effects, microtasks and c15t's `setTimeout(0)` steps run. */
async function settle(ms = 30): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)))
}

type StoreState = {
  consents: Record<string, boolean>
  selectedConsents?: Record<string, boolean>
  consentInfo: unknown
  hasFetchedBanner?: boolean
  setActiveUI: (ui: 'none' | 'banner' | 'dialog', o?: object) => void
  saveConsents: (type: 'all' | 'custom' | 'necessary') => Promise<void>
  setSelectedConsent: (name: string, value: boolean) => void
}

/**
 * Opens one page: a fresh module graph, so a fresh c15t store, mounted with
 * the region and pathname given. Resolves once c15t has initialised.
 */
async function openPage(
  region: Region,
  path = '/start',
  options: { impl?: Impl } = {},
) {
  setRegion(region)
  setMockPathname(path)
  vi.resetModules()
  const { ConsentManager } =
    (options.impl ?? impl) === 'change'
      ? await import('./ConsentManager')
      : await import('./__production__/ConsentManager')
  const { DEFAULT_CONSENT_CONFIG } = await import('./consent-content')

  let config = DEFAULT_CONSENT_CONFIG
  const tree = () => (
    <ConsentManager consentConfig={config}>
      <span />
    </ConsentManager>
  )
  const view = render(tree())

  // The store this page created: the last one c15t published on window,
  // read straight after mount, before any other page is opened.
  const store = (win.c15tStore as { getState: () => StoreState }) ?? null
  await waitFor(() => expect(store.getState().hasFetchedBanner).toBe(true))
  await settle()

  return {
    store,
    state: () => store.getState(),
    banner: () =>
      within(view.container).queryByRole('region', {
        name: /cookie consent/i,
      }),
    /** A client navigation: the proxy rewrote the cookie, the path changed. */
    async navigate(next: Region, nextPath: string) {
      setRegion(next)
      setMockPathname(nextPath)
      await act(async () => {
        view.rerender(tree())
      })
      await settle()
    },
    /** The root layout re-rendering with a new config object (#F8). */
    async rerenderWithNewConfig() {
      config = { ...DEFAULT_CONSENT_CONFIG }
      await act(async () => {
        view.rerender(tree())
      })
      await settle()
    },
    unmount: () => view.unmount(),
  }
}

/**
 * Holds every `crypto.subtle.digest` call until released by index, in the
 * order the calls were made.
 */
function holdDigests() {
  const subtle = globalThis.crypto.subtle
  const original = subtle.digest.bind(subtle)
  const held: Array<() => void> = []
  const spy = vi.spyOn(subtle, 'digest').mockImplementation(
    (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      new Promise<ArrayBuffer>((resolve) => {
        held.push(() => resolve(original(algorithm, data)))
      }),
  )
  return {
    count: () => held.length,
    async release(index: number) {
      await act(async () => {
        held[index]!()
      })
      await settle()
    },
    async releaseAll() {
      spy.mockRestore()
      await act(async () => {
        for (const resolve of held) resolve()
      })
      await settle()
    },
  }
}

beforeEach(() => {
  popstateListeners = []
  window.addEventListener = function (
    this: Window,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === 'popstate') popstateListeners.push(listener)
    return originalAddEventListener.call(this, type, listener, options)
  } as typeof window.addEventListener
  tagsEverAppended = 0
  tagObserver.observe(document, { childList: true, subtree: true })
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', GA_ID)
})

/**
 * Ends the current page as a navigation away would: React unmounts, and the
 * document's tag element and gtag globals go with it. Storage and cookies
 * stay, as they do between pages.
 */
function leavePage() {
  cleanup()
  for (const el of tagScripts()) el.remove()
  delete win[`ga-disable-${GA_ID}`]
  delete win.dataLayer
  delete win.gtag
}

/**
 * Runs one history against the change and against production's code.
 *
 * @param production - `'same'` when production already behaves as the change
 * does, so the sequence passes on both; `'differs'` when production fails it,
 * in which case its failure message is pinned by snapshot; `{ premise }` when
 * production fails it too, but on an earlier history's defect before this
 * history's own property is reached, so the pin shows that premise and the
 * title names it.
 */
function history(
  title: string,
  production: 'same' | 'differs' | { premise: string },
  run: () => Promise<void>,
): void {
  it(title, async () => {
    impl = 'change'
    await run()
  })
  const verdict =
    production === 'same'
      ? 'already does'
      : production === 'differs'
        ? 'fails it'
        : `fails earlier, on ${production.premise}`
  it(`${title} — production ${verdict}`, async () => {
    impl = 'production'
    if (production === 'same') await run()
    else {
      const failure = await run().then(
        () => null,
        (error: unknown) => error,
      )
      expect(failure, 'production fails this history').toBeInstanceOf(Error)
      // Timestamps in a failed value change on every run.
      expect(
        (failure as Error).message.replace(/\b\d{13}\b/g, '<time>'),
      ).toMatchSnapshot()
    }
  })
}

afterEach(() => {
  impl = 'change'
  tagObserver.disconnect()
  cleanup()
  window.history.pushState = originalPushState
  window.history.replaceState = originalReplaceState
  window.addEventListener = originalAddEventListener
  for (const listener of popstateListeners)
    window.removeEventListener('popstate', listener)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  clearConsentCookies()
  setMockPathname('/')
  for (const el of tagScripts()) el.remove()
  delete win[`ga-disable-${GA_ID}`]
  delete win.dataLayer
  delete win.gtag
})

describe('#375 histories — fresh loads', () => {
  history(
    'H0: a not-required region grants Analytics in memory only; nothing is stored',
    'differs',
    async () => {
      const page = await openPage('false')

      expect(page.state().consents.measurement).toBe(true)
      expect(
        page.state().consentInfo,
        'nothing automatic is recorded',
      ).toBeNull()
      expect(tagScripts()).toHaveLength(1)
      expect(gaDisabled()).toBe(false)
      expect(page.banner()).toBeNull()
      expect(rawLocalRecord()).toBeNull()
      expect(await storedRecord()).toBeNull()
      expect(marker()).toBeNull()
    },
  )

  history(
    'E: an explicit choice in a stable region is kept',
    'same',
    async () => {
      await writeRecord(REJECT_SHAPE)
      const page = await openPage('true')
      await page.navigate('true', '/next')

      expect(page.state().consentInfo).not.toBeNull()
      expect(page.state().consents.measurement).toBe(false)
      expect(tagScripts()).toHaveLength(0)
      expect((await storedRecord())?.consents?.measurement).toBe(false)
    },
  )

  history(
    "E′: an explicit Reject made where asked holds in a region that doesn't ask",
    'same',
    async () => {
      await writeRecord(REJECT_SHAPE)
      const page = await openPage('false')

      expect(page.state().consents.measurement).toBe(false)
      expect(tagScripts()).toHaveLength(0)
      expect((await storedRecord())?.consents?.measurement).toBe(false)
    },
  )

  history(
    'H1: a stored automatic grant does not load the tag on a fresh page in a region that asks',
    'differs',
    async () => {
      // In a browser production loads the tag on this first page (e2e
      // criterion (a), which fails on production's code). jsdom shows only
      // what follows: production restores the grant and saves a denial over
      // it before the first script pass, so it fails here on the record.
      await writeRecord(AUTOMATIC_SHAPE, { marker: true })
      const page = await openPage('true')

      expect(tagScripts()).toHaveLength(0)
      expect(tagsEverAppended).toBe(0)
      expect(page.state().consents.measurement).toBe(false)
      expect(
        page.state().consentInfo,
        'no record is restored or saved for the visitor',
      ).toBeNull()
      expect(page.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
      // Kept, so a tab still on production's code still revokes (rule 4).
      expect(marker()).toBe('1')
    },
  )

  history(
    'H1u: the same where the region cannot be read',
    'differs',
    async () => {
      await writeRecord(AUTOMATIC_SHAPE, { marker: true })
      const page = await openPage(null)

      expect(tagScripts(), 'no tag loads').toHaveLength(0)
      expect(tagsEverAppended).toBe(0)
      expect(page.state().consents.measurement).toBe(false)
      expect(page.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
    },
  )
})

describe('#375 histories — mid-visit', () => {
  history(
    'H2: moving into a region that asks clears the grant in memory; no denial is stored and the banner returns',
    'differs',
    async () => {
      const page = await openPage('false')
      expect(tagScripts()).toHaveLength(1)

      await page.navigate('true', '/next')

      expect(page.state().consents.measurement).toBe(false)
      expect(page.state().selectedConsents?.measurement).toBe(false)
      expect(
        page.state().consentInfo,
        'no denial is recorded on the visitor’s behalf',
      ).toBeNull()
      expect(gaDisabled()).toBe(true)
      expect(page.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
    },
  )

  history(
    'H3 (signed deviation): in, then back out without choosing, re-grants automatically',
    'differs',
    async () => {
      const page = await openPage('false')
      await page.navigate('true', '/asks')
      await page.navigate('false', '/back')

      expect(
        page.state().consents.measurement,
        'going back out re-grants automatically',
      ).toBe(true)
      expect(page.state().consentInfo).toBeNull()
      expect(gaDisabled()).toBe(false)
      expect(page.banner()).toBeNull()
      expect(await storedRecord()).toBeNull()
    },
  )

  history(
    'rule 6: a navigation after which the region cookie is gone clears an automatic grant',
    'differs',
    async () => {
      const page = await openPage('false')
      await page.navigate(null, '/next')

      expect(
        page.state().consents.measurement,
        'the automatic grant is cleared',
      ).toBe(false)
      expect(gaDisabled()).toBe(true)
      expect(page.banner()).not.toBeNull()
    },
  )

  history(
    'rule 6: a page restored from the back-forward cache with no region cookie clears an automatic grant',
    'differs',
    async () => {
      const page = await openPage('false')
      setRegion(null)
      await act(async () => {
        const event = new Event('pageshow') as Event & { persisted?: boolean }
        Object.defineProperty(event, 'persisted', { value: true })
        window.dispatchEvent(event)
      })
      await settle()

      expect(
        page.state().consents.measurement,
        'the automatic grant is cleared',
      ).toBe(false)
      expect(gaDisabled()).toBe(true)
    },
  )

  history(
    'rule 6: a tab becoming visible with no region cookie clears an automatic grant',
    'differs',
    async () => {
      const page = await openPage('false')
      setRegion(null)
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await settle()

      expect(
        page.state().consents.measurement,
        'the automatic grant is cleared',
      ).toBe(false)
      expect(gaDisabled()).toBe(true)
    },
  )

  history(
    'landing route: a history push into a region that asks switches the tag off before the push returns',
    'differs',
    async () => {
      await openPage('false')
      expect(gaDisabled()).toBe(false)

      // The route's response has already rewritten the cookie by the time the
      // router commits and pushes; nothing else has run yet.
      setRegion('true')
      window.history.pushState({}, '', '/landing')

      expect(gaDisabled(), 'the tag is off before the push returns').toBe(true)
    },
  )

  history(
    'landing route: Back or Forward into a region that asks switches the tag off before gtag hears it',
    'differs',
    async () => {
      await openPage('false')
      expect(gaDisabled(), 'the tag is on before the traversal').toBe(false)
      // A listener gtag would add once loaded, after the guard.
      let disabledWhenGtagHeard: unknown = 'not heard'
      const gtagListener = () => {
        disabledWhenGtagHeard = gaDisabled()
      }
      window.addEventListener('popstate', gtagListener)
      try {
        setRegion('true')
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
      } finally {
        window.removeEventListener('popstate', gtagListener)
      }

      expect(
        disabledWhenGtagHeard,
        'the tag is off before gtag handles the traversal',
      ).toBe(true)
    },
  )

  history(
    "landing route: a history push where consent isn't required leaves the tag on",
    'same',
    async () => {
      await openPage('false')
      window.history.pushState({}, '', '/elsewhere')

      expect(gaDisabled()).toBe(false)
    },
  )
})

describe('#375 histories — saves in flight', () => {
  history(
    'F7: an automatic grant cannot land after the region asks, whatever order saves finish in',
    'differs',
    async () => {
      const page = await openPage(null)
      const digests = holdDigests()

      await page.navigate('false', '/grant')
      await page.navigate('true', '/asks')
      // Later save first, then the earlier one (production's F7 ordering).
      for (let i = digests.count() - 1; i >= 0; i--) await digests.release(i)
      await digests.releaseAll()

      expect(
        page.state().consents.measurement,
        'the automatic grant did not land last',
      ).toBe(false)
      expect(gaDisabled()).toBe(true)
      expect(page.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
    },
  )

  history(
    'F7b: nothing automatic is ever written to storage, so no write can overwrite a denial',
    'differs',
    async () => {
      const writes: string[] = []
      const setItem = Storage.prototype.setItem
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (key === RECORD_KEY) writes.push(value)
        return setItem.call(this, key, value)
      })

      const page = await openPage(null)
      const digests = holdDigests()
      await page.navigate('false', '/grant')
      await page.navigate('true', '/asks')
      // The earlier save first this time, with a turn of the loop between.
      for (let i = 0; i < digests.count(); i++) await digests.release(i)
      await digests.releaseAll()

      expect(writes, 'nothing automatic is written to storage').toEqual([])
      expect(await storedRecord()).toBeNull()
      expect(page.state().consents.measurement).toBe(false)
    },
  )

  history(
    'F4: a grant and a clear in quick succession leave no record and Analytics off',
    { premise: 'H0 (the automatic grant is stored)' },
    async () => {
      const page = await openPage(null)
      const digests = holdDigests()
      await page.navigate('false', '/grant')
      await page.navigate('true', '/asks')
      await digests.releaseAll()

      expect(await storedRecord(), 'nothing is stored').toBeNull()
      expect(page.state().consents.measurement).toBe(false)
      expect(page.banner()).not.toBeNull()
    },
  )

  history(
    'F5: overlapping automatic grants with a dialog draft in between end on the last region, with nothing stored',
    { premise: 'H0 (the automatic grant is stored)' },
    async () => {
      const page = await openPage('true')
      const digests = holdDigests()
      await page.navigate('false', '/a')
      act(() => page.state().setSelectedConsent('measurement', false))
      await page.navigate('true', '/b')
      await page.navigate('false', '/c')
      for (let i = digests.count() - 1; i >= 0; i--) await digests.release(i)
      await digests.releaseAll()

      expect(await storedRecord(), 'nothing is stored').toBeNull()
      expect(page.state().consents.measurement).toBe(true)
      expect(page.state().consentInfo).toBeNull()
    },
  )

  history(
    'F6: a clear never wipes an explicit choice made while saves were in flight',
    { premise: 'H2 (the banner never comes back)' },
    async () => {
      const page = await openPage('false')
      const digests = holdDigests()
      await page.navigate('true', '/asks')

      // The visitor accepts from the banner while saves are held.
      const banner = page.banner()
      expect(
        banner,
        'the banner is back after moving into a region that asks',
      ).not.toBeNull()
      fireEvent.click(
        within(banner!).getByRole('button', { name: 'Accept all' }),
      )
      await settle()
      await page.navigate('false', '/back')
      await digests.releaseAll()

      const record = await storedRecord()
      expect(record?.consents?.measurement).toBe(true)
      expect(page.state().consentInfo).not.toBeNull()
      expect(marker()).toBeNull()
    },
  )

  history(
    'F6b: an explicit Accept still saving is never taken for an automatic grant afterwards',
    { premise: 'H2 (the banner never comes back)' },
    async () => {
      const page = await openPage('false')
      await page.navigate('true', '/asks')
      const digests = holdDigests()

      // The visitor accepts; before the save lands they move back to a region
      // that does not ask, where an automatic grant would otherwise be made.
      expect(
        page.banner(),
        'the banner is back after moving into a region that asks',
      ).not.toBeNull()
      fireEvent.click(
        within(page.banner()!).getByRole('button', { name: 'Accept all' }),
      )
      await page.navigate('false', '/back')
      await digests.releaseAll()
      expect(page.state().consentInfo).not.toBeNull()

      // A push into a region that asks must leave the explicit Accept's tag on.
      setRegion('true')
      window.history.pushState({}, '', '/landing')
      expect(gaDisabled()).toBe(false)
      await page.navigate('true', '/landing')
      expect(page.state().consents.measurement).toBe(true)
      expect(gaDisabled()).toBe(false)
    },
  )
})

describe('#375 histories — the one-time clean-up and re-renders', () => {
  history(
    'F8: a re-render with a new config after the store exists deletes nothing and keeps the in-memory grant ours',
    { premise: 'H0 (the automatic grant is stored)' },
    async () => {
      await writeRecord(AUTOMATIC_SHAPE, { marker: true })
      const page = await openPage('false')
      expect(await storedRecord(), 'nothing is stored or restored').toBeNull()

      await page.rerenderWithNewConfig()
      await page.navigate('true', '/asks')

      expect(page.state().consents.measurement).toBe(false)
      expect(page.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
      expect(marker()).toBe('1')
    },
  )

  history(
    'F8: an explicit choice made after mount survives a re-render with a new config',
    'same',
    async () => {
      const page = await openPage('true')
      fireEvent.click(
        within(page.banner()!).getByRole('button', { name: 'Accept all' }),
      )
      await settle()
      await page.rerenderWithNewConfig()

      expect((await storedRecord())?.consents?.measurement).toBe(true)
      expect(page.state().consentInfo).not.toBeNull()
    },
  )

  history('shape: a marked Reject is kept', 'same', async () => {
    await writeRecord(REJECT_SHAPE, { marker: true })
    const page = await openPage('false')

    expect((await storedRecord())?.consents?.measurement).toBe(false)
    expect(page.state().consents.measurement).toBe(false)
    expect(tagScripts()).toHaveLength(0)
  })

  history(
    'shape: a marked Accept of more than Analytics is kept',
    'same',
    async () => {
      await writeRecord(
        { ...AUTOMATIC_SHAPE, marketing: true },
        { marker: true },
      )
      await openPage('false')

      expect((await storedRecord())?.consents?.marketing).toBe(true)
    },
  )

  history(
    'shape: a marked record of exactly the automatic shape is deleted and re-granted in memory',
    'differs',
    async () => {
      await writeRecord(AUTOMATIC_SHAPE, { marker: true })
      const page = await openPage('false')

      expect(await storedRecord(), 'the automatic record is deleted').toBeNull()
      expect(page.state().consents.measurement).toBe(true)
      expect(page.state().consentInfo).toBeNull()
      expect(tagScripts()).toHaveLength(1)
    },
  )
})

describe('#375 rollback', () => {
  it('reverting to production after the clean-up: production re-creates the automatic grant where consent is not required', async () => {
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    await openPage('true', '/start', { impl: 'change' })
    expect(await storedRecord(), 'the change deleted it').toBeNull()
    leavePage()

    // The revert is deployed; the visitor's next page is in AU.
    await openPage('false', '/start', { impl: 'production' })
    await waitFor(async () =>
      expect((await storedRecord())?.consents?.measurement).toBe(true),
    )
    expect(marker()).toBe('1')
  })
})

describe('#375 histories — two tabs', () => {
  history(
    'two tabs: a fresh tab in a region that asks writes nothing, and the first tab clears its own grant',
    'differs',
    async () => {
      const tabA = await openPage('false')
      expect(tabA.state().consents.measurement).toBe(true)

      const tabB = await openPage('true')
      expect(tabB.state().consents.measurement).toBe(false)
      expect(tabB.banner(), 'tab B asks the visitor').not.toBeNull()

      await tabA.navigate('true', '/asks')

      expect(tabA.state().consents.measurement).toBe(false)
      expect(tabA.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
      expect(marker()).toBeNull()
    },
  )

  history(
    'two tabs, deploy skew: a new tab deletes an old tab’s automatic record but keeps its marker, so the old tab still revokes',
    'differs',
    async () => {
      // Tab A runs production's code: it saves its automatic grant and marks it.
      const tabA = await openPage('false', '/a', { impl: 'production' })
      await waitFor(async () => expect(await storedRecord()).not.toBeNull())
      expect(marker()).toBe('1')

      // Tab B loads in a region that asks.
      const tabB = await openPage('true', '/b')
      expect(tabB.state().consents.measurement).toBe(false)
      expect(tabB.state().consentInfo, 'tab B records nothing').toBeNull()
      expect(tabB.banner()).not.toBeNull()
      expect(marker()).toBe('1')

      // Tab A moves into a region that asks and revokes as production does.
      await tabA.navigate('true', '/asks')
      expect(tabA.state().consents.measurement).toBe(false)
    },
  )

  history(
    'R1: a settled automatic record is cleaned before the store exists, so no tab restores it',
    'differs',
    async () => {
      await writeRecord(AUTOMATIC_SHAPE, { marker: true })
      const tabA = await openPage('false')

      expect(
        tabA.state().consentInfo,
        'the automatic record was not restored',
      ).toBeNull()
      await tabA.navigate('true', '/asks')

      expect(tabA.state().consents.measurement).toBe(false)
      expect(tabA.banner()).not.toBeNull()
    },
  )

  history(
    "R2: an old tab's second write after the clean-up is cleaned again on the next page, marker still kept",
    'differs',
    async () => {
      // Old tab A, write 1.
      await writeRecord(AUTOMATIC_SHAPE, { marker: true })
      // New tab B loads and cleans.
      await openPage('false')
      expect(
        await storedRecord(),
        'the old tab’s record is deleted again',
      ).toBeNull()
      // Old tab A, write 2, recreating the record; the marker was never removed.
      await writeRecord(AUTOMATIC_SHAPE)
      leavePage()

      tagsEverAppended = 0
      const tabC = await openPage('true')

      expect(tagScripts()).toHaveLength(0)
      expect(tagsEverAppended).toBe(0)
      expect(tabC.banner()).not.toBeNull()
      expect(await storedRecord()).toBeNull()
      expect(marker()).toBe('1')
    },
  )

  history(
    "R3: with localStorage unavailable, a tab writes nothing automatic over another tab's Accept, and clears its own grant",
    'differs',
    async () => {
      const tabA = await openPage('false')
      expect(tabA.state().consents.measurement).toBe(true)

      // Tab B accepts; with localStorage gone, only the cookie holds it.
      await writeRecord({ ...AUTOMATIC_SHAPE, marketing: true })
      window.localStorage.removeItem(RECORD_KEY)
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage unavailable')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage unavailable')
      })

      await tabA.navigate('true', '/asks')

      expect(
        tabA.state().consents.measurement,
        'tab A clears its own grant',
      ).toBe(false)
      expect(document.cookie).toContain('c.marketing:1')
    },
  )
})

describe('#375 histories — explicit choices after an automatic grant', () => {
  it('keeps an automatic grant revocable when an explicit save fails before writing', async () => {
    const page = await openPage('false')
    const { saveExplicitChoice } = await import('./automatic-grant')
    expect(page.state().consents.measurement).toBe(true)
    await expect(
      saveExplicitChoice(async () => {
        throw new Error('explicit save failed')
      }, null),
    ).rejects.toThrow('explicit save failed')
    await page.navigate('true', '/asks')
    expect(page.state().consents.measurement).toBe(false)
    expect(await storedRecord()).toBeNull()
  })

  it('a Reject after an automatic grant is stored first, then the page reloads (production reloads too)', async () => {
    const page = await openPage('false')
    // The module instance this page uses: imported after its fresh graph.
    const modulePath = './automatic-grant'
    const { pageReload } = (await import(/* @vite-ignore */ modulePath)) as {
      pageReload: { reload: () => void }
    }
    const order: string[] = []
    vi.spyOn(pageReload, 'reload').mockImplementation(() => {
      order.push(rawLocalRecord() === null ? 'reload-before-save' : 'reload')
    })

    act(() => page.state().setActiveUI('dialog', { force: true }))
    const dialog = await within(document.body).findByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Reject non-essential' }),
    )
    await settle(60)

    expect((await storedRecord())?.consents?.measurement).toBe(false)
    expect(order).toEqual(['reload'])
    expect(marker()).toBeNull()
  })

  for (const [surface, button] of [
    ['banner', 'Accept all'],
    ['banner', 'Reject non-essential'],
    ['dialog', 'Reject non-essential'],
    ['dialog', 'Save choices'],
    ['dialog', 'Accept all'],
  ] as const) {
    history(
      `the ${surface}'s “${button}” clears the marker before it saves`,
      'same',
      async () => {
        const page = await openPage('true')
        // A tab still on production's code sets the marker after this page
        // loaded; the one-time clean-up has already run.
        window.localStorage.setItem(MARKER_KEY, '1')
        const digests = holdDigests()
        let scope = page.banner()!
        if (surface === 'dialog') {
          act(() => page.state().setActiveUI('dialog', { force: true }))
          scope = await within(document.body).findByRole('dialog')
        }
        fireEvent.click(within(scope).getByRole('button', { name: button }))

        // Cleared while the save is still held, before anything is stored.
        expect(digests.count()).toBeGreaterThan(0)
        expect(rawLocalRecord()).toBeNull()
        expect(marker()).toBeNull()
        await digests.releaseAll()
        expect(await storedRecord()).not.toBeNull()
      },
    )
  }

  history(
    'callback throws: an explicit Reject is still stored when stopping the tag throws',
    'same',
    async () => {
      await writeRecord({ ...AUTOMATIC_SHAPE })
      const page = await openPage('true')
      expect(page.state().consents.measurement).toBe(true)
      // The callback c15t runs just before its reload stops the tag, which
      // calls gtag; make that first call throw, as a broken tag would. c15t
      // does not catch it, so the save rejects: catch that here, where the
      // banner's `void` would leave it unhandled.
      let thrown = false
      win.gtag = () => {
        if (thrown) return
        thrown = true
        throw new Error('gtag is broken')
      }
      let rejection: unknown = null
      const store = page.store as unknown as {
        getState: () => StoreState
        setState: (partial: Partial<StoreState>) => void
      }
      const save = store.getState().saveConsents
      act(() =>
        store.setState({
          saveConsents: (type) =>
            save(type).catch((error: unknown) => {
              rejection = error
            }),
        }),
      )

      act(() => page.state().setActiveUI('dialog', { force: true }))
      const dialog = await within(document.body).findByRole('dialog')
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Reject non-essential' }),
      )
      await settle(60)

      expect(rejection).toBeInstanceOf(Error)
      expect((await storedRecord())?.consents?.measurement).toBe(false)
    },
  )
})
