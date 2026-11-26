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
 * Each case asserts the behaviour the design signs. The same file run on the
 * code before #375 is the production comparison: the PR records which cases
 * fail there, and the few that pass because production already behaves
 * correctly are named in their titles ("production already").
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

const tagScripts = () =>
  Array.from(document.querySelectorAll('script')).filter((el) =>
    el.src.includes('googletagmanager.com'),
  )

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
      if (
        node instanceof HTMLScriptElement &&
        node.src.includes('googletagmanager.com')
      )
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
async function openPage(region: Region, path = '/start') {
  setRegion(region)
  setMockPathname(path)
  vi.resetModules()
  const { ConsentManager } = await import('./ConsentManager')
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
  tagsEverAppended = 0
  tagObserver.observe(document, { childList: true, subtree: true })
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', GA_ID)
})

afterEach(() => {
  tagObserver.disconnect()
  cleanup()
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
  it('H0: a not-required region grants Analytics in memory only; nothing is stored', async () => {
    const page = await openPage('false')

    expect(page.state().consents.measurement).toBe(true)
    expect(page.state().consentInfo).toBeNull()
    expect(tagScripts()).toHaveLength(1)
    expect(gaDisabled()).toBe(false)
    expect(page.banner()).toBeNull()
    expect(rawLocalRecord()).toBeNull()
    expect(await storedRecord()).toBeNull()
    expect(marker()).toBeNull()
  })

  it('E (production already): an explicit choice in a stable region is kept', async () => {
    await writeRecord(REJECT_SHAPE)
    const page = await openPage('true')
    await page.navigate('true', '/next')

    expect(page.state().consentInfo).not.toBeNull()
    expect(page.state().consents.measurement).toBe(false)
    expect(tagScripts()).toHaveLength(0)
    expect((await storedRecord())?.consents?.measurement).toBe(false)
  })

  it("E′ (production already): an explicit Reject made where asked holds in a region that doesn't ask", async () => {
    await writeRecord(REJECT_SHAPE)
    const page = await openPage('false')

    expect(page.state().consents.measurement).toBe(false)
    expect(tagScripts()).toHaveLength(0)
    expect((await storedRecord())?.consents?.measurement).toBe(false)
  })

  it('H1: a stored automatic grant does not load the tag on a fresh page in a region that asks', async () => {
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    const page = await openPage('true')

    expect(tagScripts()).toHaveLength(0)
    expect(tagsEverAppended).toBe(0)
    expect(page.state().consents.measurement).toBe(false)
    expect(page.state().consentInfo).toBeNull()
    expect(page.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
    // Kept, so a tab still on production's code still revokes (rule 4).
    expect(marker()).toBe('1')
  })

  it('H1u: the same where the region cannot be read', async () => {
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    const page = await openPage(null)

    expect(tagScripts()).toHaveLength(0)
    expect(tagsEverAppended).toBe(0)
    expect(page.state().consents.measurement).toBe(false)
    expect(page.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
  })
})

describe('#375 histories — mid-visit', () => {
  it('H2: moving into a region that asks clears the grant in memory; no denial is stored and the banner returns', async () => {
    const page = await openPage('false')
    expect(tagScripts()).toHaveLength(1)

    await page.navigate('true', '/next')

    expect(page.state().consents.measurement).toBe(false)
    expect(page.state().selectedConsents?.measurement).toBe(false)
    expect(page.state().consentInfo).toBeNull()
    expect(gaDisabled()).toBe(true)
    expect(page.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
  })

  it('H3 (signed deviation): in, then back out without choosing, re-grants automatically', async () => {
    const page = await openPage('false')
    await page.navigate('true', '/asks')
    await page.navigate('false', '/back')

    expect(page.state().consents.measurement).toBe(true)
    expect(page.state().consentInfo).toBeNull()
    expect(gaDisabled()).toBe(false)
    expect(page.banner()).toBeNull()
    expect(await storedRecord()).toBeNull()
  })

  it('rule 6: a navigation after which the region cookie is gone clears an automatic grant', async () => {
    const page = await openPage('false')
    await page.navigate(null, '/next')

    expect(page.state().consents.measurement).toBe(false)
    expect(gaDisabled()).toBe(true)
    expect(page.banner()).not.toBeNull()
  })

  it('rule 6: a page restored from the back-forward cache with no region cookie clears an automatic grant', async () => {
    const page = await openPage('false')
    setRegion(null)
    await act(async () => {
      const event = new Event('pageshow') as Event & { persisted?: boolean }
      Object.defineProperty(event, 'persisted', { value: true })
      window.dispatchEvent(event)
    })
    await settle()

    expect(page.state().consents.measurement).toBe(false)
    expect(gaDisabled()).toBe(true)
  })

  it('rule 6: a tab becoming visible with no region cookie clears an automatic grant', async () => {
    const page = await openPage('false')
    setRegion(null)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await settle()

    expect(page.state().consents.measurement).toBe(false)
    expect(gaDisabled()).toBe(true)
  })

  it('landing route: a history push into a region that asks switches the tag off before the push returns', async () => {
    await openPage('false')
    expect(gaDisabled()).toBe(false)

    // The route's response has already rewritten the cookie by the time the
    // router commits and pushes; nothing else has run yet.
    setRegion('true')
    window.history.pushState({}, '', '/landing')

    expect(gaDisabled()).toBe(true)
  })

  it("landing route (production already): a history push where consent isn't required leaves the tag on", async () => {
    await openPage('false')
    window.history.pushState({}, '', '/elsewhere')

    expect(gaDisabled()).toBe(false)
  })
})

describe('#375 histories — saves in flight', () => {
  it('F7: an automatic grant cannot land after the region asks, whatever order saves finish in', async () => {
    const page = await openPage(null)
    const digests = holdDigests()

    await page.navigate('false', '/grant')
    await page.navigate('true', '/asks')
    // Later save first, then the earlier one (production's F7 ordering).
    for (let i = digests.count() - 1; i >= 0; i--) await digests.release(i)
    await digests.releaseAll()

    expect(page.state().consents.measurement).toBe(false)
    expect(gaDisabled()).toBe(true)
    expect(page.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
  })

  it('F7b: nothing automatic is ever written to storage, so no write can overwrite a denial', async () => {
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

    expect(writes).toEqual([])
    expect(await storedRecord()).toBeNull()
    expect(page.state().consents.measurement).toBe(false)
  })

  it('F4: a grant and a clear in quick succession leave no record and Analytics off', async () => {
    const page = await openPage(null)
    const digests = holdDigests()
    await page.navigate('false', '/grant')
    await page.navigate('true', '/asks')
    await digests.releaseAll()

    expect(await storedRecord()).toBeNull()
    expect(page.state().consents.measurement).toBe(false)
    expect(page.banner()).not.toBeNull()
  })

  it('F5: overlapping automatic grants with a dialog draft in between end on the last region, with nothing stored', async () => {
    const page = await openPage('true')
    const digests = holdDigests()
    await page.navigate('false', '/a')
    act(() => page.state().setSelectedConsent('measurement', false))
    await page.navigate('true', '/b')
    await page.navigate('false', '/c')
    for (let i = digests.count() - 1; i >= 0; i--) await digests.release(i)
    await digests.releaseAll()

    expect(await storedRecord()).toBeNull()
    expect(page.state().consents.measurement).toBe(true)
    expect(page.state().consentInfo).toBeNull()
  })

  it('F6: a clear never wipes an explicit choice made while saves were in flight', async () => {
    const page = await openPage('false')
    const digests = holdDigests()
    await page.navigate('true', '/asks')

    // The visitor accepts from the banner while saves are held.
    const banner = page.banner()
    expect(banner).not.toBeNull()
    fireEvent.click(within(banner!).getByRole('button', { name: 'Accept all' }))
    await settle()
    await page.navigate('false', '/back')
    await digests.releaseAll()

    const record = await storedRecord()
    expect(record?.consents?.measurement).toBe(true)
    expect(page.state().consentInfo).not.toBeNull()
    expect(marker()).toBeNull()
  })
})

describe('#375 histories — the one-time clean-up and re-renders', () => {
  it('F8: a re-render with a new config after the store exists deletes nothing and keeps the in-memory grant ours', async () => {
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    const page = await openPage('false')
    expect(await storedRecord()).toBeNull()

    await page.rerenderWithNewConfig()
    await page.navigate('true', '/asks')

    expect(page.state().consents.measurement).toBe(false)
    expect(page.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
    expect(marker()).toBe('1')
  })

  it('F8 (production already): an explicit choice made after mount survives a re-render with a new config', async () => {
    const page = await openPage('true')
    fireEvent.click(
      within(page.banner()!).getByRole('button', { name: 'Accept all' }),
    )
    await settle()
    await page.rerenderWithNewConfig()

    expect((await storedRecord())?.consents?.measurement).toBe(true)
    expect(page.state().consentInfo).not.toBeNull()
  })

  it('shape (production already): a marked Reject is kept', async () => {
    await writeRecord(REJECT_SHAPE, { marker: true })
    const page = await openPage('false')

    expect((await storedRecord())?.consents?.measurement).toBe(false)
    expect(page.state().consents.measurement).toBe(false)
    expect(tagScripts()).toHaveLength(0)
  })

  it('shape (production already): a marked Accept of more than Analytics is kept', async () => {
    await writeRecord({ ...AUTOMATIC_SHAPE, marketing: true }, { marker: true })
    await openPage('false')

    expect((await storedRecord())?.consents?.marketing).toBe(true)
  })

  it('shape: a marked record of exactly the automatic shape is deleted and re-granted in memory', async () => {
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    const page = await openPage('false')

    expect(await storedRecord()).toBeNull()
    expect(page.state().consents.measurement).toBe(true)
    expect(page.state().consentInfo).toBeNull()
    expect(tagScripts()).toHaveLength(1)
  })
})

describe('#375 histories — two tabs', () => {
  it('two tabs: a fresh tab in a region that asks writes nothing, and the first tab clears its own grant', async () => {
    const tabA = await openPage('false')
    expect(tabA.state().consents.measurement).toBe(true)

    const tabB = await openPage('true')
    expect(tabB.state().consents.measurement).toBe(false)
    expect(tabB.banner()).not.toBeNull()

    await tabA.navigate('true', '/asks')

    expect(tabA.state().consents.measurement).toBe(false)
    expect(tabA.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
    expect(marker()).toBeNull()
  })

  it('two tabs, deploy skew: a new tab deletes an old tab’s automatic record but keeps its marker, so the old tab still revokes', async () => {
    // Tab A, on production's code, auto-granted where consent is not required.
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })

    const tabB = await openPage('true')

    expect(tagScripts()).toHaveLength(0)
    expect(tagsEverAppended).toBe(0)
    expect(tabB.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
    expect(marker()).toBe('1')
  })

  it('R1: a settled automatic record is cleaned before the store exists, so no tab restores it', async () => {
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    const tabA = await openPage('false')

    expect(tabA.state().consentInfo).toBeNull()
    await tabA.navigate('true', '/asks')

    expect(tabA.state().consents.measurement).toBe(false)
    expect(tabA.banner()).not.toBeNull()
  })

  it("R2: an old tab's second write after the clean-up is cleaned again on the next page, marker still kept", async () => {
    // Old tab A, write 1.
    await writeRecord(AUTOMATIC_SHAPE, { marker: true })
    // New tab B loads and cleans.
    await openPage('false')
    expect(await storedRecord()).toBeNull()
    // Old tab A, write 2, recreating the record; the marker was never removed.
    await writeRecord(AUTOMATIC_SHAPE)
    cleanup()

    tagsEverAppended = 0
    const tabC = await openPage('true')

    expect(tagScripts()).toHaveLength(0)
    expect(tagsEverAppended).toBe(0)
    expect(tabC.banner()).not.toBeNull()
    expect(await storedRecord()).toBeNull()
    expect(marker()).toBe('1')
  })

  it("R3: with localStorage unavailable, a tab writes nothing automatic over another tab's Accept, and clears its own grant", async () => {
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

    expect(tabA.state().consents.measurement).toBe(false)
    expect(document.cookie).toContain('c.marketing:1')
  })
})

describe('#375 histories — explicit choices after an automatic grant', () => {
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

  it('the banner and dialog clear the marker before they save (production already does)', async () => {
    const page = await openPage('true')
    // A tab still on production's code sets the marker after this page loaded.
    window.localStorage.setItem(MARKER_KEY, '1')
    fireEvent.click(
      within(page.banner()!).getByRole('button', {
        name: 'Reject non-essential',
      }),
    )
    expect(marker()).toBeNull()
    await settle()
    expect((await storedRecord())?.consents?.measurement).toBe(false)
  })
})
