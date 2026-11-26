import { deleteConsentFromStorage, getConsentFromStorage } from 'c15t'

import { readConsentRequiredCookie } from '@/lib/consent/cookie'

import {
  CONSENT_STORAGE_KEY,
  markExplicitConsentChoice,
  readAutoGrantMarker,
  readGaEnv,
  stopGoogleAnalytics,
} from './consent-config'

/**
 * The automatic Analytics grant, held in memory only (#375, option C).
 *
 * @remarks
 * Where consent is not required, Analytics is granted without asking. Before
 * #375 that grant was a full c15t save: a stored record, plus a
 * `bp-consent-autogrant` marker to tell it from a choice. Every history that
 * left a visitor worse off came from that stored grant: a save that landed
 * after the region had changed, a second storage write that overwrote a
 * denial, a record restored on a fresh page in a region that asks, a marker
 * shared by tabs. The signed design (`docs/designs/375-automatic-grant-region.md`)
 * removes the stored grant instead of ordering around it:
 *
 * - **Granting** writes `measurement: true` into c15t's live state with the
 *   store's own `setState` and runs `updateScripts()`. There is no save, no
 *   digest and no storage write, so nothing can land late and nothing reaches
 *   another tab. `hasConsented()` stays false.
 * - **Clearing** does the reverse, again without a save, so no denial is
 *   recorded on the visitor's behalf and the banner comes back.
 * - The origin of the grant is {@link automaticGrantLive}, beside it in this
 *   document's memory. A record new code stores is therefore always an
 *   explicit choice.
 *
 * `setState` and `updateScripts` are c15t internals, not its public API. The
 * c15t packages are pinned exactly in `package.json` for that reason, and
 * `ConsentManager.histories.test.tsx` fails if either stops gating the tag.
 *
 * @packageDocumentation
 */

/** The c15t store surface this module touches. */
export interface ConsentStoreLike {
  getState: () => {
    consents: Record<string, boolean>
    selectedConsents?: Record<string, boolean> | null
    consentInfo: unknown
    updateScripts: () => void
  }
  setState: (partial: {
    consents?: Record<string, boolean>
    selectedConsents?: Record<string, boolean>
  }) => void
}

/** Whether this document's live `measurement` grant is the automatic one. */
let automaticGrantLive = false

/**
 * The store the automatic grant was written to, so the landing-route guard
 * can check that no explicit choice has landed since.
 */
let grantedStore: ConsentStoreLike | null = null

/**
 * Explicit saves started and not yet finished. While one is pending, c15t
 * still reports no choice, so without this an automatic grant could be made
 * over the choice the visitor has just clicked, and its flag would outlive
 * the save.
 */
let explicitSavesPending = 0

/** Whether this document holds an automatic grant right now. */
export function isAutomaticGrantLive(): boolean {
  return automaticGrantLive
}

function writeMeasurement(store: ConsentStoreLike, value: boolean): void {
  const { consents, selectedConsents } = store.getState()
  store.setState({
    consents: { ...consents, measurement: value },
    // The dialog's toggles show the draft, and `saveConsents('custom')`
    // builds from it, so the draft must follow the live value.
    selectedConsents: { ...(selectedConsents ?? consents), measurement: value },
  })
  store.getState().updateScripts()
}

/**
 * Grants `measurement` in memory, where consent is confidently not required
 * and the visitor has made no choice.
 *
 * @remarks Synchronous on purpose: the check against `consentInfo` and the
 * write happen in one step, so an explicit save that commits later always
 * wins, and no automatic write can land after the region has changed.
 */
export function grantAutomatically(store: ConsentStoreLike): void {
  if (explicitSavesPending > 0) return
  if (store.getState().consentInfo != null) return
  writeMeasurement(store, true)
  automaticGrantLive = true
  grantedStore = store
}

/**
 * Clears an automatic grant in memory, where the region asks or cannot be
 * read. A no-op for an explicit choice, or when no automatic grant is live.
 *
 * @remarks The tag element stays (`persistAfterConsentRevoked`); the switch
 * {@link stopGoogleAnalytics} sets is what stops it sending, and an explicit
 * Accept later lifts it through `buildConsentScripts`' wrappers.
 */
export function clearAutomaticGrant(store: ConsentStoreLike): void {
  if (!automaticGrantLive) return
  automaticGrantLive = false
  if (store.getState().consentInfo != null) return
  stopGoogleAnalytics(readGaEnv())
  writeMeasurement(store, false)
}

/**
 * The page reload an explicit Reject needs after an automatic grant, as an
 * object so tests can observe it.
 */
export const pageReload = {
  reload: (): void => {
    window.location.reload()
  },
}

/**
 * Saves an explicit choice from the banner or dialog.
 *
 * @remarks
 * - The marker is cleared before the save, as production does, so the
 *   one-time clean-up below never takes this record for an automatic one.
 * - No automatic grant is made while the save is pending, and the flag is
 *   cleared again once it lands, so a choice is never later taken for an
 *   automatic grant.
 * - c15t reloads on a revoking save only when a record existed before it, so
 *   a Reject that replaces an in-memory grant would not reload. Production
 *   reloads there, so this does too. It **awaits** the save first: c15t
 *   commits only after an awaited digest, and a reload before that would
 *   lose the Reject.
 */
export async function saveExplicitChoice(
  save: () => Promise<unknown>,
  store: ConsentStoreLike | null,
): Promise<void> {
  const replacesAutomaticGrant = automaticGrantLive
  automaticGrantLive = false
  explicitSavesPending++
  try {
    markExplicitConsentChoice()
    await save()
  } finally {
    explicitSavesPending--
    automaticGrantLive = false
  }
  if (
    replacesAutomaticGrant &&
    store &&
    store.getState().consents.measurement !== true
  ) {
    pageReload.reload()
  }
}

/**
 * Whether a stored record has exactly the shape production's automatic grant
 * stored: `necessary` and `measurement` on, every other category off.
 */
export function isAutomaticShape(
  consents: Record<string, boolean> | null | undefined,
): boolean {
  if (!consents) return false
  if (consents.necessary !== true || consents.measurement !== true) return false
  return Object.entries(consents).every(
    ([name, value]) =>
      name === 'necessary' || name === 'measurement' || value !== true,
  )
}

/**
 * Deletes a stored automatic grant left by production's code. Returns
 * whether it deleted one.
 *
 * @remarks
 * - Only a record next to the marker, and only one of exactly the automatic
 *   shape. A Reject or a wider Accept is kept even beside a marker, which a
 *   race between tabs can leave.
 * - The record is read the way c15t restores it, cookie first.
 * - **The marker is kept.** A tab still running production's code reads it to
 *   know its grant is automatic; without it that tab would never revoke.
 */
export function discardStoredAutomaticGrant(): boolean {
  if (!readAutoGrantMarker()) return false
  const storageConfig = { storageKey: CONSENT_STORAGE_KEY }
  const record = getConsentFromStorage<{
    consents?: Record<string, boolean>
  }>(storageConfig)
  if (!record || !isAutomaticShape(record.consents)) return false
  deleteConsentFromStorage(undefined, storageConfig)
  return true
}

let cleanedThisDocument = false

/**
 * Runs {@link discardStoredAutomaticGrant} once per document, before c15t's
 * store is created.
 *
 * @remarks Once per module instance, which is the lifetime of c15t's own store
 * cache: a later render (the root layout re-rendering with a new config, as
 * Clerk's router refresh does) must not delete anything under a live store.
 */
export function discardStoredAutomaticGrantOnce(): void {
  if (typeof window === 'undefined' || cleanedThisDocument) return
  cleanedThisDocument = true
  discardStoredAutomaticGrant()
}

let landingGuardInstalled = false

/** Switches the tag off when an automatic grant meets a region that asks. */
function stopIfRegionAsks(): void {
  if (
    automaticGrantLive &&
    grantedStore?.getState().consentInfo == null &&
    readConsentRequiredCookie(document.cookie) !== false
  ) {
    stopGoogleAnalytics(readGaEnv())
  }
}

/**
 * Switches the tag off before the router pushes a route into a region that
 * asks, or the visitor goes Back or Forward to one, so the landing route is
 * not reported (#375, acceptance criterion b).
 *
 * @remarks
 * - **Push and replace.** On a client navigation the route's response
 *   rewrites the region cookie before the router commits, and the commit is a
 *   `history.pushState`. gtag reports a history change from its own
 *   `pushState` wrapper, after calling through. This wrapper is installed
 *   before the tag ever loads, so it sits inside gtag's and runs first.
 * - **Back and Forward.** gtag also reports a `popstate`. A `popstate`
 *   listener added here, before the tag loads, runs before gtag's, since
 *   listeners on one target run in the order they were added.
 *
 * Either way, while an automatic grant is live, it reads the cookie and,
 * unless the region is confidently not required, sets the tag's opt-out
 * switch first. The region effect then clears the grant as usual. Where
 * consent is not required it does nothing, and the route is reported as
 * before. A region change no request has carried to the proxy yet is not
 * seen (`docs/ANALYTICS.md`).
 */
export function installLandingRouteGuard(): void {
  if (typeof window === 'undefined' || landingGuardInstalled) return
  landingGuardInstalled = true
  window.addEventListener('popstate', stopIfRegionAsks)
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method]
    window.history[method] = function guarded(
      this: History,
      ...args: Parameters<History['pushState']>
    ) {
      stopIfRegionAsks()
      return original.apply(this, args)
    }
  }
}
