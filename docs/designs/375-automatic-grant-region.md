# Design: an automatic Analytics grant meeting a region that asks (#375)

**Status: proposed, awaiting Brandon's signature. No code follows until it is
signed** (Brandon, 2026-11-25, on #375). This is a proposal for one decision:
once it is signed and built, the behaviour belongs in `docs/ANALYTICS.md`,
and this file stays as the record of the choice.

**The decision.** How should the site hold the Analytics grant it gives
automatically where consent is not required? The goal is that a visitor who
moves into a region that asks, on a fresh load or in the middle of a visit, is
asked again. No Google request and no stored grant may happen on their behalf.

**Recommendation in one line.** Option C: never store an automatic grant.

- Keep it only in the running page, in c15t's live state, and clear it there
  without saving.
- Read the region as today.
- Before c15t's store is created, delete the automatic records production has
  already stored, and keep the marker that names them.

The starting shape's server-side region read (option B) is optional: once
nothing automatic is stored, it closes no history that C leaves open.

Evidence labels follow the working agreements:

- **[measured]**: observed.
- **[source]**: read from code; what it says, not what it does.
- **[inference]**: not yet verified; the label names what would verify it.

Line numbers in c15t refer to the installed `c15t@2.2.1` `dist/index.js`
unless another file is named. Nothing about option C's behaviour has been run
yet. Every claim about it is **[inference]**, and the test for each history in
§4 is what verifies it.

## 1. What is settled

- **Production is the baseline.** #373 (`0fe9603`) first shipped in
  `v2026.11.19`, and every later tag contains it [source:
  `git tag --contains 0fe9603`]. Production's consent-state logic is the code
  #375 describes. The only consent files that differ between `master` and
  `develop` are the banner and dialog copy [source:
  `git diff origin/master origin/develop --stat -- src/components/consent`].
- **The bar** (#375, requirement 3): for the same sequence of events, no
  visitor is worse off than production. Worse off means one of three things:
  - more reaches Google;
  - a grant exists or is stored where production would have none;
  - an explicit choice is lost or overridden where production keeps it.
- **What not to repeat.** Both removed fixes changed state that c15t also
  writes, from outside c15t, with no ordering. Fix A reset the consent; fix B
  dropped the stored record before c15t read it. #375 lists the histories they
  failed: F4–F6, F8, two tabs, R1, R2 and R3.
- **The starting shape** (Brandon, 2026-11-25): decide the region on the
  server, from the headers the proxy reads, before c15t restores or commits
  anything, so that nothing automatic is ever stored. Section 3 compares it
  with the other shapes.

## 2. How the pieces work today

- **Region.** `src/proxy.ts` runs `requiresConsent()`
  (`src/lib/consent/jurisdiction.ts`) on `x-vercel-ip-country` and
  `x-vercel-ip-country-region`. On every matched request it writes the answer
  to the `cookieConsentRequired` cookie, with a one-hour lifetime. Missing
  headers count as "required". [source]
- **Reading the region.** `ConsentGeoCookieSignal` in `ConsentManager.tsx`
  re-reads that cookie in an effect, keyed on the pathname. The read comes
  after c15t's store exists, and after each navigation has committed. The
  effect does not wait for c15t's start-up to finish. [source]
- **The automatic grant.** When the region is confidently not required and
  nothing is consented, the effect calls `setConsent('measurement', true)` and
  sets the `localStorage` marker `bp-consent-autogrant`. `setConsent` is a
  full save. [source]
- **What a c15t save does.** It awaits a policy fingerprint
  (`crypto.subtle.digest`), then commits.
  - Write 1: `localStorage` and the `bp-consent` cookie (`:2798-2801`).
  - Write 2, a task later, from the offline manager: both again
    (`:1486-1502`).
  - Saves are not sequenced. Two saves are merged only when their payload is
    identical (`:3673-3690`).
  - When a save revokes a category and a record already existed, c15t calls
    `onBeforeConsentRevocationReload` and reloads the page. None of those
    callbacks is inside a try/catch (`:2717-2723`, `:2798-2831`).

  [source]

- **Restore.** The store is created during the provider's first client
  render and cached at module level (`:3987-4004`).
  - It reads `bp-consent` synchronously, cookie first, then `localStorage`
    (`:3603`, `:694-772`).
  - Its first script pass runs on what it restored, in `updateStore`, after
    an awaited digest (`:3076`).

  [source]

- **Banner.** `hasConsented()` is `consentInfo != null` [source: `:3785`].
  Our own banner shows when consent is required or unknown and
  `hasConsented()` is false (`shouldShowBanner`).
- **The tag.** It is gated on the live value of `consents.measurement`
  only [source: `:2577-2608`, `:2380`].
  - The switch `window['ga-disable-<id>']` follows that value
    (`buildConsentScripts`).
  - `stopGoogleAnalytics` turns the switch on.
- **Who reads the record.** Nothing outside `src/components/consent`
  reads `bp-consent` or the marker: no server code, and not Sentry's session
  id [source: grep of `src/`]. No e2e spec seeds either; the consent specs set
  the region with `x-vercel-ip-country` and click the banner [source:
  `grep -rn bp-consent e2e playwright.config.ts` finds nothing].

### What c15t offers that bears on this

Read from the installed source for this design. None of it has been run.

1. **c15t has its own opt-out path.** In offline mode, pass
   `overrides: { country, region }` and an `offlinePolicy` whose policy for
   that location is `model: 'none'` or `'opt-out'`. c15t then grants the
   categories in memory only: no record is written, `consentInfo` stays
   `null`, and `hasConsented()` stays false. [source: `computeAutoGrantInfo`
   `:2901-2911`, `buildStoreUpdate` `:2949-2954`]
   - Without an `offlinePolicy`, offline mode always uses an opt-in banner
     policy, whatever country is passed [source: `:1416-1419`].
2. **The policy fingerprint resets records.** Every saved record carries the
   fingerprint of the policy it was saved under.
   - At start-up, if that fingerprint differs from the current policy's,
     c15t deletes the record and resets consent. It does this for explicit
     choices too, in any model [source: `updateStore` `:3018-3029`].
   - `model` is part of what the fingerprint covers [source:
     `@c15t/schema/dist/450.js:231-238`].
3. **c15t's own Global Privacy Control rule.** Under an opt-out or `none`
   policy, c15t does not auto-grant `measurement` when the browser sends GPC,
   unless the policy turns that check off [source: `:2903-2904`]. Production
   auto-grants regardless of GPC.
4. **No public way to grant without saving.** `setConsent` and
   `saveConsents` always persist. `setSelectedConsent` changes only the draft,
   and the draft gates nothing [source: `:3661-3672`].
   - The store's own `setState({ consents, selectedConsents })`, followed by
     `getState().updateScripts()`, changes live state without writing
     storage. That route is internal API, also exposed as `window.c15tStore`
     [source: `:3976`, `:2577-2608`].
   - Nothing subscribes to the store and writes storage, and there is no
     `storage` listener [source].
5. **The store is cached.** A new `options` object returns the same cached
   store unless a field of the cache key changes. The key covers the storage
   key, `offlinePolicy`, mode, headers and the language set. It does not
   cover `scripts`, `callbacks` or `overrides` [source: `:3993-4004`]. The
   React provider re-applies `overrides` and the callbacks to a cached store
   [source: `@c15t/react/dist/providers/consent-manager-provider.js`].
6. **A rejection after an in-memory grant does not reload.** c15t reloads on
   a revoking save only when a record existed before it [source:
   `:2717-2723`].
7. **Start-up leaves an in-memory grant alone, under today's policy.** With
   `consentInfo` null and the offline opt-in policy, `buildStoreUpdate` sets
   `consents` only when c15t itself auto-grants. Today's policy has no
   preselected or strict category list, so neither of those branches fires
   [source: `:2949-2961`].

## 3. The options

| Option | Mechanism                                                                                                                                              | Effort      | Undo                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------- |
| **P**  | Production: automatic grant saved via `setConsent`, marker in `localStorage`                                                                           | —           | —                                                     |
| **A**  | Starting shape, using c15t's own opt-out model: the request's region is handed to c15t as `overrides`, plus an `offlinePolicy`                         | Medium      | One-way for some explicit choices (fingerprint reset) |
| **B**  | Starting shape, held by the app: the server reads the region from the headers and passes it to the provider; the grant is held as in C                 | Medium–Hard | Two-way                                               |
| **C**  | **Recommended.** Automatic grant in live state only, cleared there without a save; region read as today; one-time clean-up of stored automatic records | Medium      | Two-way                                               |
| **D**  | Keep storing automatic grants, with the origin written into the record, plus an app-side queue that orders every save                                  | Hard        | Two-way                                               |

### A. c15t's own opt-out model, region from the request

- **Mechanism.** The provider gets `overrides` built from the request's
  country and region. It also gets an `offlinePolicy` whose `policyPacks` are
  built from `jurisdiction.ts`:
  - opt-in for the EU, EEA and UK countries and for the listed US-state and
    Québec subdivisions;
  - `fallback` opt-in when no country is known;
  - `none` as the default for every other region.

  c15t then grants `measurement` in memory where consent is not required,
  and stores nothing. Our marker, the region effect's grant and its reprompt
  are removed.

- **Why it fails the bar.** c15t ties every record to the fingerprint of
  the policy it was saved under. When the visitor's policy differs, it deletes
  the record (§2, item 2). The opt-in and `none` policies have to differ in
  `model`, so their fingerprints differ.
  - A visitor who chose **Reject** in France and later loads from Australia
    has that record deleted. They are then auto-granted, and the tag loads:
    more reaches Google, and an explicit choice is lost.
  - On the first deploy, every explicit Reject already stored is lost
    wherever the `none` policy applies. Those records carry the fingerprint of
    the old opt-in banner policy [source: `:1419`].
  - A visitor who chose in a not-required region is asked again in a
    required one. That is mild, but it is still "an explicit choice lost".
- **Other costs.**
  - c15t's GPC rule changes what happens in not-required regions, unless it
    is switched off in the policy.
  - The region must exist before the store is created. Either the layout
    reads `headers()`, which makes it dynamic (see B), or the client reads a
    cookie the proxy writes, synchronously.
  - Mid-visit, a change to `overrides` re-runs c15t's start-up. But an
    opt-in policy does not take back a grant already made in memory (§2, item
    7), so the app still needs C's clearing step.
- **Blast radius.** Every stored record in production, explicit ones
  included. It cannot be undone for the records it deletes. That makes it a
  one-way door, and that is why it is not recommended.

### B. The starting shape, with the grant held by the app

- **Mechanism.** C's mechanism (below), plus the region decided on the
  server: the root layout, or a server component, reads the same two headers
  through `headers()`, runs `requiresConsent()` and passes the result to
  `ConsentManager`. The region is then known before c15t's store is created.
- **What it costs.** The root layout prerenders static under
  `cacheComponents`.
  - Reading `headers()` there makes the whole tree dynamic.
  - In a Suspense hole, the region would arrive after the provider had
    already created its store. The only way around that is to move the
    provider inside the hole, and then every page, and `ManageCookiesLink` in
    the footer, would stream behind it.

  Either way it is a change to caching and rendering
  (`docs/ARCHITECTURE.md` § Caching), not to consent.

- **A cheaper way to the same thing.** The proxy already writes the decision
  onto the document's own response. The client can read it synchronously
  during the first render, before the provider's `useMemo`, with no change to
  rendering [inference: verify, with criterion (a), that `document.cookie`
  holds the response's `Set-Cookie` at hydration on a CDN-served page].
- **What it adds over C.** Little. Once nothing automatic is stored, a fresh
  load has nothing automatic to restore, so reading the region before restore
  no longer protects anything (§4, H1). In a not-required region it moves the
  grant from the first effect to the first render. Production also grants in
  an effect.
- **Blast radius.** C's, plus the rendering change if `headers()` is used.

### C. Nothing automatic is stored (recommended)

Six rules, all in `src/components/consent/`:

1. **Grant in memory only.** This applies where the region is confidently
   not required and `hasConsented()` is false.
   - The region effect sets `consents.measurement` and
     `selectedConsents.measurement` to `true` with the store's `setState`,
     then calls `updateScripts()`.
   - It does not call `setConsent`: there is no save, digest, storage write or
     record.
   - A flag in the document's memory, `automaticGrantInThisDocument`, records
     that the live grant is ours.
   - New code never writes the `localStorage` marker.
2. **Clear in memory only.** This runs when the region becomes "asks", or the
   cookie is unreadable (rule 6). Its conditions are that the flag is set and
   `hasConsented()` is still false. Then:
   - call `stopGoogleAnalytics()`;
   - set `measurement` to `false` in both `consents` and `selectedConsents`,
     with `setState`, and call `updateScripts()`. Clearing both matters: the
     dialog's toggles show `selectedConsents`, and `saveConsents('custom')`
     builds from `selectedConsents ?? consents` (`:2744-2745`);
   - clear the flag.

   Nothing is saved, so no denial is recorded, `hasConsented()` stays false,
   and the banner returns. There is no reload, because no record existed. The
   tag element stays (`persistAfterConsentRevoked`) with the switch on, and a
   later explicit **Accept** lifts the switch through the existing
   `onConsentChange` wrapper.

3. **Explicit choices.**
   - The banner and dialog still call `saveConsents`, which persists.
   - Every explicit save clears the flag, after the handler has read it to
     decide the reload below.
   - They keep calling `markExplicitConsentChoice()` first, which clears the
     marker (rule 4).
   - A **Reject** after an in-memory grant does not reload (§2, item 6).
     For parity with production, the handler reloads the page itself when
     the grant it replaces was automatic. It must **await** `saveConsents`
     first. A reload issued straight after `void saveConsents(...)` would kill
     the page during the digest, before write 1, and lose the Reject.
     Production reloads only after write 1 (`:2798-2831`).
4. **One-time clean-up of what production stored.** This runs once per
   module instance, the lifetime of c15t's store cache, before
   `ConsentManagerProvider` first renders. If `bp-consent-autogrant` is
   `'1'` **and the stored record has the automatic shape**, it deletes the
   `bp-consent` record with c15t's own
   `deleteConsentFromStorage(undefined, { storageKey })`, so the cookie's path
   and domain match how c15t wrote it (`:308-316`, `:412-441`).
   - **The automatic shape.** `necessary` and `measurement` are true, and
     every other offered category is false: exactly what production's
     `setConsent('measurement', true)` stores. The test reads the copy c15t
     will restore, cookie first, as `getConsentFromStorage` does
     (`:694-772`), not `localStorage` alone.
   - **The marker is kept.** A tab still running production's code reads the
     marker to know its grant is automatic. Deleting it would make that tab
     treat its grant as explicit, and never revoke it: fix B's two-tab failure.
     Kept, the old tab revokes as production does. If an old tab re-saves an
     automatic grant, the next new-code page cleans that up too.
   - The marker is cleared only by an explicit choice, before it saves (rule
     3). An explicit record can still end up next to a marker, through two
     orderings between tabs. Both can also happen with every tab on
     production's code, so such records may already be stored before the
     deploy:
     - an old tab auto-grants over the explicit record after it lands; or
     - a new tab clears the marker and starts an explicit save. An old tab
       then auto-grants and sets the marker, and its save lands first, so the
       explicit record is the final one while the marker reads `'1'`.

     **The shape test bounds both.** A record that refuses `measurement`
     (a Reject), or grants any other category (an Accept of more than
     Analytics), does not have the automatic shape, so it is kept as
     production keeps it.

     The one explicit record that can be deleted is an Accept, caught in this
     race, of exactly `necessary` plus `measurement`. That is the whole of an
     Accept while the CMS offers only those two categories.
     - **For Google:** no worse. In a not-required region it is re-granted in
       memory, so the tag behaves as before. In a region that asks, production
       restores it, loads the tag on page 1 and then revokes it; C loads
       nothing.
     - **Residual:** the choice itself is lost, so a visitor in a region that
       asks is asked again. Production keeps the record there as a choice,
       with `measurement` switched off.

     Tests run both orderings.

   - **Check, then delete, across tabs.** The clean-up reads the marker and
     the record, then deletes, all in one synchronous task. Browsers give
     `localStorage` no lock across tabs, so another tab's save can land
     between the read and the delete. If that save is an explicit Reject, it
     is deleted. Accepted as a residual: it needs an explicit save to finish
     inside that sub-millisecond window, and only on the first new-code page
     that finds a marked automatic record. c15t's saves take no lock that the
     clean-up could share. [inference: the width of the window is unmeasured]

   - The clean-up runs in every region, with no region test. A not-required
     region re-grants in memory on the same page, so nothing is lost there.
   - This is fix B's mechanism. What made fix B unsafe was that automatic
     grants were still being saved and marked while it ran; under C, new code
     never writes either, so nothing new code writes is ever cleaned up.
5. **Start-up order.** The region effect does not wait for c15t's start-up.
   The in-memory grant survives start-up's state update only because of §2,
   item 7, which rests on today's offline policy. The exact pin (blast radius,
   below) and a test that runs the grant before and after start-up both guard
   it.
6. **Unreadable region mid-visit** (requirement 8). Treat it as "asks", and
   clear an automatic grant as in rule 2. That matches the banner, which
   already shows for an unknown region. Today the state is left as it was. The
   one-hour cookie is refreshed on every matched request. It goes missing when
   cookies are blocked or cleared, or when it expires with no matched request,
   such as a page restored from the back-forward cache after an hour. The cost
   is that such a visitor in a not-required region loses Analytics until the
   next page refreshes the cookie.
   - **What re-reads the region without a navigation.** A page restored
     from the back-forward cache keeps its pathname, so the pathname-keyed
     effect does not run. The signal therefore also re-reads the cookie:
     - on `pageshow` when `event.persisted` is true;
     - on `visibilitychange` to `visible`, for a tab the visitor returns to
       after it sat idle past the cookie's hour.

     A test restores a page after the cookie has gone and asserts that the
     automatic grant is cleared, and that no Google request is made. Until the
     handler runs, the restored page's tag is still enabled. Whether gtag
     sends anything in that gap is [inference: the restore test measures it].

     A page left visible and idle gets no new region information, because the
     proxy decides the region only on a request. It keeps its grant until the
     next navigation or the next time it becomes visible again. Accepted as a
     residual. Production does not re-read in any of these cases, and leaves
     the grant on a null region anyway.

- **Why it holds** [inference, each history's test verifies it]. Every
  history in #375 needs one of two things: an automatic write that can land
  late, or an automatic record that outlives the page that made it.
  - Under C an automatic write is a synchronous store update with no
    `await`. It is checked against `hasConsented()` at the moment it runs.
  - There is no automatic save to race, and nothing automatic is shared
    with another tab.
  - The origin of a grant is the flag beside it in memory. A record new code
    stores is explicit by construction (requirements 6 and 7).
- **Effort: Medium.**
  - Code: `ConsentManager.tsx` (the region effect, the clean-up, the flag);
    `consent-config.ts` (the predicates; the marker becomes read-only in new
    code, apart from the explicit-choice clear); the awaited reload in the
    banner and dialog handlers.
  - Tests: one per history in §4, run against production's code and against
    C, using the held-digest harness in `ConsentManager.ga.test.tsx`. A
    deploy-skew test runs production's region effect beside new code over
    shared storage. A unit test pins that every banner and dialog handler
    clears the marker before it saves: the clean-up is safe only while that
    holds.
  - E2e: criteria (a) and (b) in `e2e/consent-google-analytics.spec.ts`.
  - Docs: `docs/ANALYTICS.md`.
- **Undo: two-way.**
  - Reverting the code brings production's behaviour back.
  - The only data effect is the deleted automatic records. Production
    re-creates those on the visitor's next page in a not-required region.
  - Explicit records that do not have the automatic shape are not deleted,
    apart from rule 4's sub-millisecond check-then-delete window. An explicit
    Accept of exactly `necessary` and `measurement` is deleted only in rule
    4's race between tabs, including such records already stored before the
    deploy.
- **Blast radius.**
  - Inside `src/components/consent`: the tag's gating, the dialog's toggle
    state, the banner inset (`consentUndecided` is unchanged) and the reload
    path.
  - It relies on c15t's internal `setState` and `updateScripts`, and on
    rule 5. `package.json` allows `^2.2.1`, so a minor c15t upgrade could
    change them. Implementation pins c15t exactly (`docs/DEPENDENCIES.md`)
    and adds a test that fails if `setState` plus `updateScripts` stops
    gating the tag, or if start-up overwrites the in-memory grant.
  - If Sentry ever moves inside consent (#213, `isSessionIdAllowed()`), it
    must read live `consents.measurement`, not the stored record, because
    automatic grants will no longer be stored.
- **Verifiability.** Direct. Every history becomes a jsdom test against the
  real c15t, and criteria (a) and (b) become browser tests on a production
  build. A wrong result is visible: a stored record, a
  `consents.measurement` value, the `ga-disable` switch, or an appended
  `googletagmanager` script.

### D. Origin in the record, saves ordered by the app

- **Mechanism.** Keep saving automatic grants, but write
  `consentInfo.origin: 'automatic'` into the record. c15t's storage merge
  keeps unknown keys, in the cookie and in `localStorage` [source:
  `:651-658`, `:604-618`]. Every save goes behind an app-side queue with a
  generation token, so that a stale automatic save is dropped.
- **Why not.**
  - c15t rebuilds `consentInfo` from scratch on each save, so the origin
    disappears from live state until the next load.
  - The merge also keeps the origin through an explicit choice unless the app
    clears it. That clearing is a write outside c15t's save, the
    unordered-write class that sank fixes A and B.
  - A queue cannot order c15t's write 2 or the replay of a pending denial,
    because both happen inside c15t.
  - A fresh load in a region that asks still restores the automatic grant
    unless the record is dropped before c15t reads it. That is fix B again,
    two tabs included.
- **Effort: Hard. Undo: two-way. Blast radius: every save path.**

## 4. Every history, against production and each option

Marks used in the table:

- "✓": the visitor is no worse off than production, and the requirement in
  #375 is met.
- "✗": the option fails.
- "=P": the option behaves as production does.
- "**dev**": a deliberate deviation from production, which Brandon signs.

Cells for A, C and D predict code that does not exist yet, so they are
[inference]; each row's test verifies them. B behaves as C wherever no cell
says otherwise.

| History (from #375 unless noted)                                                                | P (production)                                                                                   | A                                                                                    | C (and B)                                                                                                                                                                                   | D                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **H0** Not-required region, nothing chosen                                                      | Automatic grant saved; tag loads on page 1                                                       | Grant in memory; tag loads ✓, except under GPC unless c15t's GPC check is turned off | Grant in memory; tag loads after the first effect, as today ✓                                                                                                                               | =P ✓                                                        |
| **E** Explicit choice in a stable region                                                        | Kept                                                                                             | Kept ✓                                                                               | Kept ✓                                                                                                                                                                                      | Kept ✓                                                      |
| **E′** Explicit Reject in FR, later load from AU (not in #375)                                  | Kept; tag off                                                                                    | **✗** Fingerprint reset deletes it; auto-grant; tag loads                            | Kept; tag off ✓                                                                                                                                                                             | Kept ✓                                                      |
| **H1** Auto-granted in AU, fresh load in FR                                                     | Grant restored; **tag loads on page 1**; effect saves a denial and reloads; banner never returns | Fingerprint reset; banner shown; no tag ✓                                            | Nothing stored, nothing restored; banner shown; no tag ✓. A record production stored is cleaned before the store exists ✓                                                                   | Needs a drop before restore (fix B) ✗                       |
| **H1u** The same, region unreadable                                                             | Grant restored; tag loads; banner hidden                                                         | `fallback` opt-in ✓                                                                  | Nothing restored; the unknown region shows the banner ✓                                                                                                                                     | As H1 ✗                                                     |
| **H2** Auto-granted, client navigation into FR                                                  | Denial saved; reload; **banner never returns**; landing route can be reported                    | No in-memory revoke without C's rule 2 ✗                                             | Cleared in memory; nothing saved; banner returns ✓. Landing route: §5                                                                                                                       | A denial or reset must be saved and ordered; Hard           |
| **H3** AU, then FR mid-visit, then back to AU (not in #375)                                     | The denial saved in FR keeps the tag off from then on                                            | Re-grants in memory                                                                  | **dev**: re-grants in memory on the return, so the tag sends again. Requirements 2 and 5 read this way: the visitor was never asked, so where no asking is needed they are treated as today | =P                                                          |
| **F7** An automatic save is in flight when the region changes; the denial lands first           | The older grant lands last: granted and stored in FR, no marker                                  | No automatic save ✓                                                                  | No automatic save; a synchronous `setState` cannot land late ✓                                                                                                                              | The queue drops the stale save ✓, if write 2 is ordered too |
| **F7b** A denial lands between an automatic save's two writes                                   | Stored record granted, no marker; restored on the next load                                      | ✓                                                                                    | No automatic writes ✓                                                                                                                                                                       | ✗ write 2 is inside c15t                                    |
| **F4** Reset while an automatic save is in flight (fix A)                                       | n/a: P does not reset                                                                            | ✓                                                                                    | No reset and no automatic save ✓                                                                                                                                                            | Queue ✓                                                     |
| **F5** Two overlapping automatic saves (fix A)                                                  | An unmarked grant is possible, as in F7                                                          | ✓                                                                                    | ✓                                                                                                                                                                                           | Queue ✓                                                     |
| **F6** A queued reset acting on a stale region or intent (fix A)                                | n/a                                                                                              | ✓                                                                                    | The clear is synchronous; it reads the live region, the flag and `hasConsented()` when it runs ✓                                                                                            | Token ✓                                                     |
| **F8** Root layout re-renders with a new config after the store exists (Clerk refresh)          | No harm                                                                                          | `offlinePolicy` is in the cache key, so it must be built stably                      | The store is reused (the cache key is unchanged); the clean-up runs once per module and only deletes a record next to a marker ✓                                                            | ✓                                                           |
| **Two tabs** Tab A auto-granted; the region changes; tab B loads fresh                          | B restores A's grant, as in H1                                                                   | ✓                                                                                    | A's grant lives only in A's memory; B stores nothing; A clears its own grant on its next region read ✓                                                                                      | Shared record ✗                                             |
| **Two tabs, old code** (deploy skew, not in #375) Tab A on production's code, tab B on new code | —                                                                                                | —                                                                                    | B deletes A's record and keeps the marker; A still revokes on FR =P                                                                                                                         | —                                                           |
| **R1** Tab A restored a settled automatic grant                                                 | As H1                                                                                            | ✓                                                                                    | New code cleans a marked record before its store exists, so it never restores one. An old-code tab behaves as P =P                                                                          | ✗                                                           |
| **R2** Tab B's drop lands between tab A's two writes                                            | n/a in P; in fix B, an unmarked record                                                           | ✓                                                                                    | New-code tabs make no automatic writes ✓. An old-code tab's write 2 can recreate the record, but the marker is still there, so the next new-code page cleans it ✓                           | ✗                                                           |
| **R3** No `localStorage`, cookies work; explicit Accept in tab B                                | The marker is never readable, so tab A never reprompts; B's Accept stands                        | ✓                                                                                    | Tab A saves nothing automatic; B's Accept stands =P ✓                                                                                                                                       | Queue is per tab ✗                                          |
| **Callback throws** (`onBeforeConsentRevocationReload`)                                         | Denial saved, reload skipped                                                                     | n/a                                                                                  | No new callback. The existing one calls `stopGoogleAnalytics`, whose guards are early returns, not a try/catch; it is unchanged =P                                                          | =P                                                          |
| **Explicit Reject after an automatic grant** (not in #375; C changes it)                        | Reload; the fresh page loads nothing                                                             | No reload (§2, item 6) unless the handler adds one                                   | The handler awaits the save, then reloads =P ✓                                                                                                                                              | =P                                                          |

## 5. Windows and residuals under C

- **The landing route** (#375, transient window 1; acceptance criterion b).
  In a not-required region with the tag running, a client navigation into a
  region that asks delivers the new cookie with the route's response. The
  region effect runs only after the route commits, so gtag's history-driven
  `page_view` for the landing route may fire first [inference: unmeasured;
  criterion (b) measures it]. Production has the same window. Criterion (b)
  requires that no request is made for the landing route, so this window must
  be closed, not stated. Two ways, chosen during implementation, with (b) as
  the test:
  1. **Suspend the tag while the region is in doubt.** Turn the switch on
     before a navigation commits in a document whose grant is automatic, and
     lift it once the re-read confirms not required. The App Router has no
     navigation-start event, so the hook is a click handler on internal links,
     or a patched `history.pushState` [inference: verify it runs before
     gtag's history listener sends].
  2. **Stop gtag's own history page views** and send `page_view` from the
     region effect after the check.

  If neither passes (b), the work comes back to Brandon before anything
  ships: either the criterion is relaxed, or a reload is used.

- **The in-flight save** (transient window 2). Closed: there is no automatic
  save.
- **Deploy skew.** A tab opened before the deploy runs production's code
  until it reloads, and behaves as production does. Because the marker is
  kept (rule 4), it still revokes in a region that asks. One sequence is left,
  and production has it too: an old tab auto-granting over a new tab's
  explicit choice. Production's own region effect can overwrite an explicit
  record when its in-memory state is stale. The same race can leave an
  explicit record next to a marker. Rule 4's shape test keeps a Reject and
  any wider Accept. An Accept of only Analytics is deleted, and the visitor
  is asked again in a region that asks; nothing more reaches Google. It
  lasts only until old tabs are reloaded, apart from such records already
  stored before the deploy.
- **Records production left unmarked** (F7 and F7b already happened in
  some browser). They read as explicit, as they do in production =P. Nothing
  can tell them apart.
- **A record held only in the cookie** (`localStorage` unavailable). The
  marker was never written, so production treats the record as explicit, and
  C does the same =P.

## 6. What Brandon is asked to sign

**Recommendation: C.** It is the only option that passes every history in #375
without a one-way data effect:

- A deletes explicit choices through c15t's fingerprint reset.
- D still has automatic saves, and a queue cannot reach c15t's own write 2.
- B adds a rendering change for no history it closes.

C is also the durable fix. It removes the one thing every failing history
depends on, a stored automatic grant, instead of ordering saves around it.

Two things would reopen it:

- a c15t release that grants without saving through a public API, with a
  fingerprint that stays stable across models;
- a c15t release that changes `setState`, `updateScripts` or start-up's
  handling of `consents`. The exact pin and the gating test catch this.

**The question:** Do you sign option C, with automatic grants never stored and
your server-side region read dropped as unneeded? Signing it also means:

1. A page whose region cookie is missing clears an automatic grant
   (fail-closed). Today the grant is left as it was.
2. A visitor who moves into a region that asks and then back out, without
   choosing, is granted again automatically (H3). Production keeps the tag
   off for them once it has saved the denial.
