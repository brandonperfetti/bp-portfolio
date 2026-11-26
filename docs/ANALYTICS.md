# Analytics & consent (#83)

How brandonperfetti.com measures traffic, and how consent is managed. Two
analytics paths run in parallel; a **headless** consent runtime (c15t) plus a
middleware geo decision gate the one that needs consent.

## The two analytics paths

- **Vercel Analytics + Speed Insights** — always on, **cookieless**, no consent
  required. Mounted in `src/app/(frontend)/layout.tsx` and untouched.
- **Google Analytics 4 (GA4)** — free, portable deep analytics, loaded only
  once the `measurement` category is granted (#361). Registered only when
  `NEXT_PUBLIC_VERCEL_ENV === 'production'` **and** `NEXT_PUBLIC_GA_MEASUREMENT_ID`
  is set (production-only — `NODE_ENV` is `'production'` on Vercel Preview too,
  so it is not used). Out of scope: GTM, ads/marketing pixels, other vendors.

## Consent runtime — headless c15t (Brandon's production pattern)

c15t runs **headless**: `ConsentManagerProvider` from `@c15t/react` in
`mode: 'offline'` with **`noStyle: true`**, **no** `@c15t/react/styles.css`, and
**no** built-in `<ConsentBanner>`/`<ConsentDialog>`. c15t only holds consent
state and runs the gated GA4 script; the banner and dialog are bp's **own**
components in the site's zinc/teal design system (Tailwind v4 + Radix `Dialog`/
`Switch`), driven by `useConsentManager()`. There is no "Secured by c15t" badge
by construction (no c15t-rendered surface), and no dependence on c15t's
stylesheet (which caused the clipped/bare render of the earlier built-in
approach).

- **Files:** `src/components/consent/` — `ConsentManager.tsx` (headless provider,
  cookie read, region effect), `automatic-grant.ts` (the in-memory automatic
  grant, the one-time clean-up and the landing-route guard, #375),
  `CookieBanner.tsx`, `CookieDialog.tsx` (the disclosure + toggles),
  `ManageCookiesLink.tsx` (footer button), `consent-config.ts` (options, GA
  gating, banner/opt-out helpers). `src/lib/consent/` —
  `jurisdiction.ts` (the geo table) and `cookie.ts` (the cookie name + parser).
- **Categories:** `necessary` (always on) and `measurement` (GA4). No
  `marketing`/`experience`.
- **Manage entry point:** a custom footer "Manage Cookies" button reopens the
  dialog (`setActiveUI('dialog', { force: true })`) — reachable even where the
  banner is suppressed.

## Geo gating — middleware cookie (no backend, no new env var)

The banner shows **only where consent is legally required**; analytics run
unconsented elsewhere. The authority is a `cookieConsentRequired` cookie written
by `src/proxy.ts` from Vercel's edge geo headers (`x-vercel-ip-country`,
`x-vercel-ip-country-region`), mirroring the Brytecore production pattern. This
replaces c15t's own geolocation (a no-op in offline mode) and the self-host
backend.

- **Required jurisdictions** (`src/lib/consent/jurisdiction.ts`, updatable
  constants): EU-27 + EEA (IS, LI, NO) + UK (GB) at the **country** level; and
  the `bc-sites-api` **subdivision** set — US states
  `CA CO CT DE DC IN IA KY MD MN MT NE NH NJ OK OR RI TN TX UT VA` + Québec `QC`.
  - **Footgun:** `CA` is **California** as a subdivision but **Canada** as a
    country. Country codes match only the EU/EEA+UK set; subdivision codes match
    only the subdivision set — never crossed. (Canada + Ontario ⇒ not required.)
  - **Fail-closed:** unknown/absent geo ⇒ required (banner shows). Only a
    confident `false` suppresses it.
- **Analytics is opt-out-aware** (mirrors Brytecore `getEffectiveConsent`): where
  consent is **not** required, `measurement` is granted by default so GA4 runs
  unconsented; where required (or unknown), it stays denied until the visitor
  grants it. The default grant is held in memory and never stored (#375,
  below). An explicit choice via the dialog always wins. The geo cookie has a
  short TTL and is refreshed on each navigation, so a travelling visitor
  re-resolves.

## GA4 loads only on a grant (#361)

GA4 is registered through c15t's prebuilt Google Tag integration
(`@c15t/scripts/google-tag`), with one override in `buildConsentScripts`
(`consent-config.ts`): **`alwaysLoad: false`**. The prebuilt tag ships
always-load: gtag.js is installed for every visitor and left to police itself
through Consent Mode v2, which still sends Google a cookieless `page_view`
(page URL and title, screen size, language, browser and OS versions) while
storage is denied. That ran from #83 until #361 `[measured on production
2026-11-18, at 561a5bf]`, under a banner that says "Google Analytics only with
your consent".

- **Before a grant:** c15t skips the script and all of its setup. No
  `dataLayer`, no `gtag`, no script element, and no request to a Google host.
  This is every visitor where consent is required or the region is unknown,
  until they choose.
- **On a grant:** c15t runs the tag's setup with Consent Mode v2 defaults
  already granted for `analytics_storage`, loads gtag.js, and GA4 collects.
  Where consent is not required the grant is automatic (below), so GA4 loads
  on the first page as before.
- **On a withdrawal:** c15t reloads the page when a choice revokes a category
  that a stored choice had granted (`reloadOnConsentRevoked`, its default),
  and the fresh page loads nothing from Google. A Reject that replaces an
  automatic grant has no stored record to revoke, so c15t would not reload;
  `saveExplicitChoice` reloads it instead, after awaiting the save, so the
  Reject is stored before the page goes. `stopGoogleAnalytics` sets gtag's
  own opt-out switch (`window['ga-disable-<id>']`) and tells an installed tag
  storage is denied. It is called from c15t's
  `onBeforeConsentRevocationReload` callback, which runs synchronously just
  before c15t's reload, and from an effect for a revoke that does not reload.
  The stop is not made at the click itself: c15t awaits a digest before it
  commits the choice and calls that callback, so for those few milliseconds
  the installed tag is still enabled. What the browser proof measures is the
  outcome, in the runs it made: no request to a Google host from the Reject
  click onwards, the departing document included. It does not read the switch
  in that document, and it is not a guarantee that the tag cannot send inside
  that interval.

## The automatic grant is held in memory (#375)

Where consent is confidently not required and the visitor has made no
choice, `measurement` is granted **without a save**: the region effect writes
it into c15t's live state and re-runs c15t's script pass
(`grantAutomatically`). Nothing is stored, so `hasConsented()` stays false, a
fresh page has nothing automatic to restore, no automatic save can land late,
and no other tab sees the grant. Brandon signed this design (option C) on
2026-11-26; the record of the choice, with every history it was tested
against, is [`docs/designs/375-automatic-grant-region.md`](designs/375-automatic-grant-region.md).

- **When the region asks** (on a navigation, a back-forward-cache restore, or
  a tab becoming visible again), or the region cookie cannot be read, the
  automatic grant is cleared the same way (`clearAutomaticGrant`): the tag is
  switched off, `measurement` goes back to off, and nothing is saved. No
  denial is recorded on the visitor's behalf, so the banner comes back. If
  the visitor goes back out without choosing, Analytics is granted again.
  Both are changes from before #375, where the revoke was stored as a choice
  and the banner stayed away.
- **The route the visitor lands on** is not reported, once the region cookie
  has changed. While an automatic grant is live, a wrapper on
  `history.pushState`/`replaceState`, installed before the tag ever loads,
  reads the cookie and switches the tag off before the router commits a route
  into a region that asks, so gtag's history-driven `page_view` for that route
  is dropped.
- **Explicit choices** go through `saveExplicitChoice` from the banner and the
  dialog, and are stored as before. A record stored by this code is therefore
  always an explicit choice.
- **The one-time clean-up.** Production before #375 stored automatic grants,
  marked by `bp-consent-autogrant`. Once per document, before c15t's store is
  created, a record next to that marker is deleted, **only if it has exactly
  the automatic shape** (`necessary` and `measurement` on, every other
  category off). A Reject, or an Accept of more than Analytics, is kept. The
  marker itself is kept, so a tab still running the old code knows its grant
  is automatic and revokes it. In a not-required region the deleted grant is
  re-granted in memory on the same page.

**What is not covered.** These residuals were accepted with the design:

- **An Accept of exactly Analytics, caught in a race between tabs.** Two
  orderings between tabs can leave an explicit record next to the marker,
  under the old code as well as the new. A Reject or a wider Accept is kept by
  the shape test; an Accept of only `necessary` and `measurement` (all of an
  Accept while the CMS offers those two categories) is deleted, and the
  visitor is asked again in a region that asks. Nothing more reaches Google.
- **Check, then delete.** `localStorage` has no lock across tabs, so another
  tab's explicit save can land between the clean-up's read and its delete,
  and be deleted. The window is sub-millisecond and open only on the first
  page that finds a marked automatic record [inference: unmeasured].
- **A region change that has not reached the proxy yet.** The site learns
  the region only from a request the proxy answers. A route the router
  prefetched before the change commits from that prefetch with no new
  request, so the cookie still says "not required": the grant stays, the
  banner does not come back and that route is reported, until a request
  reaches the proxy (a full load, a route not prefetched yet). Production has
  the same gap. Measured on a local production build on 2026-11-26, and
  pinned as a known failure in `e2e/consent-google-analytics.spec.ts`.
- **A page left visible and idle** gets no new region information until its
  next navigation or the next time it becomes visible, because the region is
  decided only on a request.
- **Records the old code left unmarked**, and records held only in the cookie
  where `localStorage` is unavailable, read as explicit choices, as they did
  before.
- **c15t internals.** The grant uses the store's `setState` and
  `updateScripts`, which are not c15t's public API, so the c15t packages are
  pinned exactly (`docs/DEPENDENCIES.md`) and
  `ConsentManager.histories.test.tsx` fails if either stops gating the tag.
  Code that ever needs the visitor's Analytics consent (for example Sentry
  sessions, #213) must read live `consents.measurement`, not the stored
  record, because automatic grants are no longer stored.

Which visitors are granted without being asked is decided by the region
predicates in `consent-config.ts` and nowhere else:
`shouldAutoGrantMeasurement` (who is granted) and `shouldClearAutomaticGrant`
(when such a grant stops counting). The script registration knows nothing
about regions, so changing who is asked is a change to those predicates
alone.

**The dialog's Analytics sentence.** The default copy says the tag loads only
while the category is on. The sentence shipped before #361 ("Google still
receives an anonymous, cookieless signal") was the saved value in the
`cookie-consent` global and the column default; until #372 the reader swapped
that exact stored sentence for the current default. Staging and production
were edited in the CMS first (confirmed 2026-11-19), then #372 removed the
swap and moved the column default with a migration. The stored subtitle is now
served as written, like every other consent string, so a database that still
holds the old sentence would show it.

## Essential cookies (exempt from the banner)

Set regardless of the consent choice — strictly-necessary, consent frameworks
exempt them:

- **Clerk** — authentication session. See `docs/AUTH.md`.
- **Cloudflare Turnstile** — bot/security challenge on the contact form (and,
  when armed, Corvus chat).

## Sessions in Sentry (#213) — outside the banner, like the rest of Sentry

Sentry sits **outside** c15t (`docs/MAINTENANCE.md` §Sentry) because its
events carry no identity. #168 confirmed that: no `setUser` from Clerk, no
`sendDefaultPii`, so every issue read "Users impacted: 0" — a constant, not a
measurement.

#213 makes that field mean something without changing the posture. The
browser SDK now sets a **random per-tab id** — a bare `crypto.randomUUID()`
held in `sessionStorage` under `bp.sentry.sessionId`, minted once per tab and
gone when the tab closes — as `Sentry.setUser({ id })`, and nothing else. It
takes no inputs: no account id, no email, no IP, no user-agent, no timestamp,
no seed, so it cannot be worked backwards to a person by anyone. Two errors
from one tab are one session; two tabs are two. A known bot user-agent mints
no id at all, matching the `beforeSend` filter that already drops those
events (#98).

Why it stays outside the banner: a value in client storage is not
automatically "strictly necessary" under ePrivacy, but this one is neither an
identifier of a person nor linkable across visits or sites — it exists only
to make an error report interpretable, and it dies with the tab. That reading
lives in exactly one place, `isSessionIdAllowed()` in
`src/lib/observability/sessionId.ts`; moving Sentry inside consent means
changing that one function to read the c15t state and nothing else.

Nothing here is a secret; the names-only rule is `docs/SECURITY.md`
§ Secret handling. See `src/lib/observability/sessionId.ts` for the full
reasoning and `src/lib/observability/sessionId.test.ts` for the assertions
that pin it.

## Verifying it (browser / preview, not sandbox)

The a11y gate (`addon-a11y`, `test:'error'`) and the Storybook `play` functions
run under CI / `pnpm test:storybook`, not in a headless sandbox. Manual/preview
checks:

- **Geo:** on the Vercel preview, from a required region (EU / a listed US state,
  via VPN or a spoofed `x-vercel-ip-country`/`-country-region`) the banner shows;
  from a non-required region (e.g. US-WA) it is suppressed but "Manage Cookies"
  still opens the dialog. Unknown geo ⇒ banner shows (fail-closed).
- **Both themes at ~1440/768/390:** banner and dialog readable, don't obscure
  primary CTAs, dialog scrolls at 390px.
- **Keyboard:** Tab/Shift+Tab through banner and dialog; Escape closes the dialog
  and restores focus; toggles are real Radix `switch`es; the teal
  `:focus-visible` ring shows. Reduced-motion: enter/exit static.
- **GA:** loads only in production (not Preview) and only where allowed
  (unconsented where not required; not at all until a grant where required or
  unknown). Before a grant: no request to `googletagmanager.com` or
  `google-analytics.com`, read from the full network log, not a filtered
  panel. After a grant: gtag.js loads and a `page_view` is sent. After a
  withdrawal: the page reloads and no request is made. Vercel Analytics fires
  throughout. The same three states are pinned in a browser by
  `e2e/consent-google-analytics.spec.ts`.
- **The real tag, by hand.** In CI that spec answers the gtag.js request with
  a stand-in, so a required check never depends on Google's servers. When the
  gating changes, run **that spec alone** once with the real tag, against a
  production build that has GA configured:
  `NEXT_PUBLIC_VERCEL_ENV=production NEXT_PUBLIC_GA_MEASUREMENT_ID=<id> GA_E2E_LIVE=1 CI=1 pnpm exec playwright test consent-google-analytics`
  (the same two variables must have been set for `pnpm build`). Use the CI
  placeholder id or a test property for `<id>`, never the production one.
  gtag.js then loads from Google; its `collect` hits are answered locally by
  the spec, and the measurement hosts stay unresolvable in the browser as a
  second stop, so the browser is seen to send them and nothing is delivered.
