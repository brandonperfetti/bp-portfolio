# Design: an automatic Analytics grant meeting a region that asks (#375)

**Status: proposed, awaiting Brandon's signature. No code follows until it is
signed** (Brandon, 2026-11-25, on #375).

**The decision.** How should the site hold the Analytics grant it gives
automatically where consent is not required? The goal is that a visitor who
moves into a region that asks, on a fresh load or in the middle of a visit, is
asked again. No Google request and no stored grant may happen on their behalf.

**Recommendation in one line.** Option C. Never store an automatic grant: keep
it only in the running page, in c15t's live state, and clear it there without
saving. Read the region as today. Before c15t's store is created, delete, once,
the automatic records that production has already stored. The server-side
region read of the starting shape (option B) is optional: once nothing
automatic is stored, it closes no history that C leaves open.

Evidence labels follow the working agreements: **[measured]** observed,
**[source]** read from code (what it says, not what it does), **[inference]**
with what would verify it. Line numbers in c15t refer to the installed
`c15t@2.2.1` `dist/index.js`.

## 1. What is settled

- **Production is the baseline.** #373 (`0fe9603`) shipped in
  `v2026.11.24.1`, so "production" in #375 and production today are the same
  code. Its consent-state logic is unchanged from before #373 [source:
  `git merge-base --is-ancestor 0fe9603 origin/master`].
- **The bar** (#375, requirement 3): for the same sequence of events, no
  visitor is worse off than production. Worse off means one of three things:
  - more reaches Google;
  - a grant exists or is stored where production would have none;
  - an explicit choice is lost or overridden where production keeps it.
- **What not to repeat.** Both removed fixes changed state that c15t also
  writes, from outside c15t, with no ordering. Fix A reset the consent; fix B
  dropped the stored record before c15t read it. Section 4 shows they failed
  F4–F6, F8, two tabs, R1, R2 and R3.
- **The starting shape** (Brandon, 2026-11-25): decide the region on the
  server, from the headers the proxy reads, before c15t restores or commits
  anything, so that nothing automatic is ever stored. Section 3 compares it
  with the other shapes.

## 2. How the pieces work today

- **Region.** `src/proxy.ts` runs `requiresConsent()`
  (`src/lib/consent/jurisdiction.ts`) on `x-vercel-ip-country` and
  `x-vercel-ip-country-region`. On every matched request it writes the
  answer to the `cookieConsentRequired` cookie, with a one-hour lifetime.
  Missing headers count as "required". [source]
- **Reading the region.** `ConsentGeoCookieSignal` in `ConsentManager.tsx`
  re-reads that cookie in an effect, keyed on the pathname. The read comes
  after c15t's store already exists, and after each navigation has committed.
  [source]
- **The automatic grant.** When the region is confidently not required and
  nothing is consented, the effect calls `setConsent('measurement', true)`
  and sets the `localStorage` marker `bp-consent-autogrant`. `setConsent`
  is a full save. [source]
- **What a c15t save does.** It awaits a policy fingerprint
  (`crypto.subtle.digest`), then commits. It writes `localStorage` and the
  `bp-consent` cookie once (write 1). A task later, it writes both again from
  the offline manager (write 2). Saves are not sequenced; two saves are
  de-duplicated only when their payload is identical. When a save revokes a
  category and a record already existed, c15t calls
  `onBeforeConsentRevocationReload` and reloads the page. None of those
  callbacks is inside a try/catch. [source: `:2738-2868`, `:1486-1502`,
  `:3673-3690`]
- **Restore.** The store is created during the provider's first client
  render and cached at module level. It reads `bp-consent` synchronously
  (cookie first, then `localStorage`). Its first script pass runs on what it
  restored. [source: `:3603`, `:694-772`, `:3987-4008`]
- **Banner.** `hasConsented()` is `consentInfo != null` [source: `:3785`].
  Our own banner shows when consent is required or unknown and
  `hasConsented()` is false (`shouldShowBanner`).
- **The tag.** It is gated on the live value of `consents.measurement` only
  [source: `:2578-2592`, `:2380`]. The switch
  `window['ga-disable-<id>']` follows it (`buildConsentScripts`), and
  `stopGoogleAnalytics` sets the switch on.
- **Nothing outside `src/components/consent` reads `bp-consent` or the
  marker.** No server code reads them, and Sentry's session id does not
  either [source: grep of `src/`]. Three e2e specs seed `bp-consent`
  (`consent-banner-inset`, `consent-focus-return`, `consent-scroll-lock`).

### What c15t offers that bears on this

Read from the installed source for this design. None of it has been run.

1. **c15t has its own opt-out path.** In offline mode, pass
   `overrides: { country, region }` and an `offlinePolicy` whose policy for
   that location is `model: 'none'` or `'opt-out'`. c15t then grants the
   categories in memory only: no record is written, `consentInfo` stays
   `null`, and `hasConsented()` stays false. [source: `computeAutoGrantInfo`
   `:2901-2911`, `buildStoreUpdate` `:2949-2954`]
   - Without an `offlinePolicy`, offline mode always uses an opt-in banner
     policy, whatever country is passed. [source: `:1416-1419`]
2. **The policy fingerprint resets records.** Every saved record carries the
   fingerprint of the policy it was saved under. At start-up, if that
   fingerprint differs from the current policy's, c15t deletes the record and
   resets consent. It does this for explicit choices too, and in any model.
   [source: `updateStore` `:3018-3029`]
3. **c15t's own Global Privacy Control rule.** Under an opt-out or `none`
   policy, c15t does not auto-grant `measurement` when the browser sends GPC,
   unless the policy turns that check off. [source: `:2903-2904`]
   Production auto-grants regardless of GPC.
4. **No public way to grant without saving.** `setConsent` and
   `saveConsents` always persist. `setSelectedConsent` changes only the draft,
   and the draft gates nothing. The store's own
   `setState({ consents, selectedConsents })` followed by
   `getState().updateScripts()` changes live state without writing storage.
   That route is internal API, also exposed as `window.c15tStore`.
   [source: `:3661-3672`, `:3976`]
5. **Options identity.** A new `options` object returns the same cached
   store unless a field in the cache key changes. The key includes the storage
   key and `offlinePolicy`; it does not include `scripts`, `callbacks` or
   `overrides`. Only `overrides` and the callbacks are re-applied to a cached
   store. [source: `:3993-4008`]
6. **A rejection after an in-memory grant does not reload.** c15t reloads on
   a revoking save only when a record existed before it. [source:
   `:2717-2723`]

## 3. The options

| | Mechanism | Effort | Undo |
| --- | --- | --- | --- |
| **P** | Production: automatic grant saved via `setConsent`, marker in `localStorage` | — | — |
| **A** | Starting shape, using c15t's own opt-out model: region from the request handed to c15t as `overrides` plus an `offlinePolicy`, so c15t grants in memory | Medium | One-way for some explicit choices (fingerprint reset) |
| **B** | Starting shape, held by the app: the server reads the region from the headers, passes it to the provider as a prop, and the app holds the automatic grant in live state only (C's mechanism) | Medium–Hard | Two-way |
| **C** | **Recommended.** C's mechanism with the region read as today: automatic grant in live state only, cleared there without a save, one-time clean-up of stored automatic records | Medium | Two-way |
| **D** | Keep storing automatic grants, with the origin written into the record (`consentInfo.origin`), plus an app-side queue that orders every save | Hard | Two-way |

### A. c15t's own opt-out model, region from the request

- **Mechanism.** The provider gets `overrides` built from the request's
  country and region, and an `offlinePolicy` with `policyPacks` built from
  `jurisdiction.ts`:
  - opt-in for the EU, EEA and UK countries and the listed US-state and
    Québec subdivisions;
  - `fallback` opt-in when no country is known;
  - `none` as the default for every other region.
  c15t then grants `measurement` in memory where consent is not required,
  and stores nothing. Our marker, the region effect's grant and its
  reprompt are removed.
- **Why it fails the bar.** c15t ties every record to the fingerprint of
  the policy it was saved under, and deletes the record when the visitor's
  policy differs (§2, item 2). The opt-in and `none` policies have to differ
  in `model`, so their fingerprints differ.
  - A visitor who chose **Reject** in France and later loads from
    Australia has that record deleted. They are then auto-granted, and the
    tag loads: more reaches Google, and an explicit choice is lost.
  - On the first deploy, every explicit Reject already stored is lost
    wherever the `none` policy applies, because those records carry the
    fingerprint of the old opt-in banner policy.
  - A visitor who chose in a not-required region is asked again in a
    required one. That is mild, but it is still "an explicit choice lost".
- **Other costs.**
  - c15t's GPC rule changes what happens in not-required regions, unless it
    is switched off in the policy.
  - The region must exist before the store is created: either the layout
    reads `headers()`, which makes it dynamic (see B), or the client reads the
    region synchronously from a cookie the proxy writes.
  - Mid-visit, `overrides` re-run c15t's start-up, but an opt-in policy
    does not take back a grant already made in memory
    (`buildStoreUpdate` sets `consents` only when it grants). So the app still
    needs C's clearing step.
- **Blast radius.** Every stored record in production, explicit ones
  included. It cannot be undone for the records it deletes. That makes it a
  one-way door, and the reason it is not recommended. A spike could look for a
  policy shape with one fingerprint for both models. Nothing in the source
  suggests one exists, because `model` is part of what the fingerprint covers
  [inference: run `createMaterialPolicyFingerprint` on both policies].

### B. The starting shape, with the grant held by the app

- **Mechanism.** C's mechanism (below), plus the region decided on the
  server.
  - The root layout or a server component reads the same two headers
    through `headers()` and runs `requiresConsent()`.
  - It passes the result to `ConsentManager`, so the region is known before
    c15t's store is created.
- **What it costs.** The root layout prerenders static under
  `cacheComponents`.
  - Reading `headers()` there makes the whole tree dynamic.
  - Reading it in a Suspense hole would deliver the region after the
    provider had already created its store, unless the provider moved inside
    the hole. In that case every page, and `ManageCookiesLink` in the footer,
    would stream behind it.
  - Either way it is a change to caching and rendering
    (`docs/ARCHITECTURE.md` § Caching), not to consent.
- **A cheaper way to the same thing.** The proxy already writes the
  decision onto the document's own response, so the client can read it
  synchronously during the first render, before the provider's `useMemo`.
  That needs no change to rendering [inference: verify that `document.cookie`
  holds the response's `Set-Cookie` at hydration on a CDN-served page, with
  criterion (a)].
- **What it adds over C.** Little. Once nothing automatic is stored, a
  fresh load has nothing automatic to restore, so reading the region before
  restore no longer protects anything (§4, H1). An early read changes only
  when, in a not-required region, the tag is granted: during the first render
  instead of in the first effect. Production also grants in an effect.
- **Blast radius.** C's, plus the rendering change if `headers()` is used.

### C. Nothing automatic is stored (recommended)

Five changes, all in `src/components/consent/`:

1. **Grant in memory only.** Where the region is confidently not required
   and `hasConsented()` is false, the region effect sets
   `consents.measurement` and `selectedConsents.measurement` to `true` with
   the store's `setState`, then calls `updateScripts()`. It does not call
   `setConsent`, so no save, digest, storage write or record happens. A flag
   in the document's memory, `automaticGrantInThisDocument`, records that the
   live grant is ours. The `localStorage` marker is no longer written.
2. **Clear in memory only.** When the region becomes "asks", or the cookie
   is unreadable (see 5), and the live grant is ours:
   - call `stopGoogleAnalytics()`;
   - set `measurement` back to `false` with `setState`, then call
     `updateScripts()`;
   - clear the flag.

   Nothing is saved, so no denial is recorded, `hasConsented()` stays false
   and the banner returns. There is no reload, because no record existed. The
   tag element stays (`persistAfterConsentRevoked`), with the switch on.
   An explicit **Accept** later lifts the switch through the existing
   `onConsentChange` wrapper.
3. **Explicit choices unchanged.** The banner and dialog still call
   `saveConsents`, and they still persist, as today. A **Reject** after an
   in-memory grant does not reload (§2, item 6). For parity with production,
   which reloads there, the handler reloads the page itself when the grant it
   replaces was automatic. Otherwise the existing effect stops the tag, as
   for any revoke that does not reload.
4. **One-time clean-up of what production stored.** Once per module
   instance, which is the lifetime of c15t's store cache, and before
   `ConsentManagerProvider` first renders: if `bp-consent-autogrant` is `'1'`,
   remove the `bp-consent` `localStorage` entry, the `bp-consent` cookie and
   the marker.
   - This runs in every region, with no region test. A not-required region
     re-grants in memory on the same page, so the clean-up loses nothing
     there.
   - It is fix B's mechanism, but what made fix B unsafe is gone: fix B ran
     while automatic grants were still being saved and marked live. Under C
     no new code ever writes the marker, so after the first page every run
     finds nothing to do (§4, F8, R1, R2).
5. **Unreadable region mid-visit** (requirement 8). Treat it as "asks": clear
   an automatic grant as in step 2. That matches the banner, which already
   shows for an unknown region. Today the state is left as it was. A one-hour
   cookie refreshed on every request is missing only when cookies are blocked
   or cleared. The cost is that such a visitor in a not-required region loses
   Analytics for the rest of that page. This is the second question in §6.

- **Why it holds.** Every history in #375 needs an automatic write that can
  land late, or an automatic record that outlives the page that made it.
  Under C an automatic write is a synchronous store update with no `await`,
  checked against `hasConsented()` at the moment it runs. There is no
  automatic save to race, and nothing automatic is shared with another tab.
  The origin of a grant is the flag beside it in memory, and a stored record
  is explicit by construction (requirements 6 and 7).
- **Effort: Medium.**
  - Code: `ConsentManager.tsx` (region effect, clean-up, the flag);
    `consent-config.ts` (the predicates, the marker becoming read-and-delete
    only); one reload call in the banner and dialog handlers.
  - Tests: one per history in §4, run against production's code and against
    C, using the held-digest harness in `ConsentManager.ga.test.tsx`.
  - E2e: criteria (a) and (b) in `e2e/consent-google-analytics.spec.ts`.
  - Docs: `docs/ANALYTICS.md`.
- **Undo: two-way.**
  - Reverting the code brings production's behaviour back. The only data
    effect is the deleted automatic records, and production re-creates
    those on the visitor's next page in a not-required region.
  - Explicit records are never touched.
- **Blast radius.**
  - Inside `src/components/consent`: the tag's gating, the dialog's toggle
    state, the banner inset (`consentUndecided` is unchanged), the reload
    path.
  - It relies on c15t's internal `setState`/`updateScripts`. `package.json`
    allows `^2.2.1`, so a minor c15t upgrade could change them.
    Implementation should pin c15t exactly (`docs/DEPENDENCIES.md`) and add a
    test that fails if `setState` or `updateScripts` stops gating the tag.
  - The three e2e specs that seed `bp-consent` without the marker are
    unaffected.
  - If Sentry ever moves inside consent (#213, `isSessionIdAllowed()`), it
    must read live `consents.measurement`, not the stored record, because
    automatic grants will no longer be stored.
- **Verifiability.** Direct. Every history becomes a jsdom test against the
  real c15t, and (a) and (b) become browser tests on a production build. A
  wrong result shows up as a stored record, a `consents.measurement` value,
  the `ga-disable` switch or an appended `googletagmanager` script.

### D. Origin in the record, saves ordered by the app

- **Mechanism.** Keep saving automatic grants, but write
  `consentInfo.origin: 'automatic'` into the record. c15t's storage merge
  keeps unknown keys, in the cookie and in `localStorage` [source:
  `:651-658`, `:604-618`]. Put every save behind an app-side queue with a
  generation token, so that a stale automatic save is dropped.
- **Why not.**
  - c15t rebuilds `consentInfo` from scratch on each save, so the origin
    disappears from live state until the next load.
  - Because of the merge, the origin also survives an explicit choice
    unless the app clears it. That clearing is a write outside c15t's save,
    which is the unordered-write class that sank fixes A and B.
  - A queue cannot order c15t's second write (write 2) or the pending-denial
    replay, because both happen inside c15t.
  - A fresh load in a region that asks still restores the automatic grant,
    unless the record is dropped before c15t reads it: fix B again, two tabs
    included.
- **Effort: Hard. Undo: two-way. Blast radius: every save path.**

## 4. Every history, against production and each option

"✓" means the visitor is no worse off than production and the requirement in
#375 is met. "✗" means it fails. "=P" means it behaves as production does.
A follows c15t's policy model. B behaves as C wherever no cell says
otherwise.

| History (from #375) | P (production) | A | C (and B) | D |
| --- | --- | --- | --- | --- |
| **H0** Not-required region, nothing chosen | Saved automatic grant; tag loads on page 1 | In-memory grant; tag loads ✓, but not under GPC unless c15t's GPC check is turned off | In-memory grant; tag loads after the first effect, as today ✓ | =P ✓ |
| **E** Explicit choice in a stable region | Kept | Kept ✓ | Kept ✓ | Kept ✓ |
| **E′** Explicit Reject in FR, later load from AU | Kept; tag off | **✗** Fingerprint reset deletes it; auto-grant; tag loads | Kept; tag off ✓ | Kept ✓ |
| **H1** Auto-granted in AU, fresh load in FR | Restored; **tag loads on page 1**; effect saves a denial, reloads; banner never returns | Fingerprint reset; banner shown; no tag ✓ | Nothing stored, nothing restored; banner shown; no tag ✓ (legacy record: cleaned before the store, ✓) | Needs drop-before-restore (= fix B) ✗ |
| **H1u** The same, region unreadable | Restored; tag loads; banner hidden | `fallback` opt-in ✓ | Nothing restored; null region shows the banner ✓ | as H1 ✗ |
| **H2** Auto-granted, client navigation into FR | Denial saved; reload; **banner never returns**; landing route can be reported | No in-memory revoke without C's step ✗ | Cleared in memory; nothing saved; banner returns ✓ (landing route: see §5) | Denial or reset must be saved and ordered; Hard |
| **F7** Automatic save in flight, region changes, denial lands first | Older grant lands last; granted and stored in FR, no marker | No automatic save ✓ | No automatic save: a synchronous `setState` cannot land late ✓ | Queue drops the stale save ✓, if write 2 is ordered too |
| **F7b** Denial lands between an automatic save's two writes | Stored record granted, no marker; restored next load | ✓ | No automatic writes ✓ | ✗ write 2 is inside c15t |
| **F4** Reset while an automatic save is in flight (fix A) | n/a (P does not reset) | ✓ | No reset, no automatic save ✓ | Queue ✓ |
| **F5** Two overlapping automatic saves (fix A) | Unmarked grant possible (as F7) | ✓ | ✓ | Queue ✓ |
| **F6** Queued reset acting on stale region or intent (fix A) | n/a | ✓ | The clear is synchronous and reads the live region and `hasConsented()` when it runs ✓ | Token ✓ |
| **F8** Root layout re-renders with a new config after the store exists (Clerk refresh) | No harm | `offlinePolicy` is in the cache key; must be built stably | Clean-up is once per module and finds no marker after the first page; the store is reused (cache key unchanged) ✓ | ✓ |
| **Two tabs** Tab A auto-granted; region changes; tab B loads fresh | B restores A's grant (as H1) | ✓ | A's grant is only in A's memory; B stores nothing; A clears its own grant on its next region read ✓ | Shared record ✗ |
| **R1** Tab A restored a settled automatic grant | As H1 | ✓ | Cannot happen: new code cleans a marked record before its store exists. Only a tab still running old code can hold one (§5) ✓ | ✗ |
| **R2** Tab B's drop lands between tab A's two writes | n/a in P; in fix B, an unmarked record | ✓ | Tab A makes no automatic writes ✓. Deploy skew only: an old-code tab mid-save can still leave an unmarked record, which P can also leave (F7b) =P | ✗ |
| **R3** No `localStorage`, cookies work; explicit Accept in tab B | Tab A can save a denial over B's Accept (on region change) | ✓ | Tab A saves nothing automatic, so B's Accept stands ✓ | Queue is per tab ✗ |
| **Callback throws** (`onBeforeConsentRevocationReload`) | Denial saved, reload skipped | n/a | No new callback; the existing one cannot throw (`stopGoogleAnalytics` is guarded) ✓ | ✓ |
| **Explicit Reject after an automatic grant** (not in #375; C changes it) | Reload; fresh page loads nothing | No reload (§2, item 6) unless the handler adds one | Handler reloads when the grant it replaces was automatic =P ✓ | =P |

## 5. Windows and residuals under C

- **The landing route (#375, transient window 1).** In a not-required
  region with the tag running, a client navigation into a region that asks
  delivers the new cookie with the route's response. The region effect runs
  only after the route commits, so gtag's history-driven `page_view` for the
  landing route may fire first [inference: unmeasured; criterion (b) measures
  it]. Production has the same window. Two ways to close it, to be chosen
  during implementation, with (b) as the test:
  1. Suspend the tag while the region is in doubt: set the switch when a
     navigation starts in a document whose grant is automatic, and lift it
     only once the re-read confirms not required.
  2. Stop gtag's own history page views and send `page_view` from the region
     effect after the check.

  If neither proves out, the window is stated in `docs/ANALYTICS.md`, as
  production's is today.
- **The in-flight save (transient window 2).** Closed: there is no automatic
  save.
- **Deploy skew.** A tab opened before the deploy keeps running production's
  code until it reloads. It can still save and mark an automatic grant. The
  next new-code page in that browser cleans that record up, and the old tab
  behaves as production does. This lasts only until old tabs are reloaded.
- **Records production left unmarked** (F7 and F7b already happened in some
  browser). They read as explicit, as they do in production =P. Nothing can
  tell them apart.
- **A record held only in the cookie** (`localStorage` unavailable). The
  marker was never written, so production treats the record as explicit;
  C does the same =P.

## 6. What Brandon is asked to sign

**Recommendation: C.** It is the only option that passes every history in #375
without a one-way data effect:

- A deletes explicit choices through c15t's fingerprint reset.
- D still has automatic saves, and a queue cannot reach c15t's own second
  write.
- B adds a rendering change for no history it closes.

C is also the durable fix. It removes the thing every failing history
depended on, a stored automatic grant, rather than ordering around it. The one
reason to revisit it: a future c15t that grants without saving through a
public API with a stable fingerprint, or one that removes `setState` or
`updateScripts`. The exact pin and the gating test catch the second.

The questions, in one message:

1. **Do you sign option C?** Automatic Analytics grants are no longer stored.
   They live only in the open page and are cleared there without saving when
   the region asks, so the banner comes back. Records production has already
   stored as automatic are deleted once, on the next page load. This means you
   do not need the server-side region read from your starting shape.
2. **If a page loses the region cookie mid-visit, should an automatic grant
   be cleared (recommended, fail-closed), or kept as today?**
