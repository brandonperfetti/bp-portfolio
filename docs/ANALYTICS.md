# Analytics & consent (#83)

How brandonperfetti.com measures traffic, and how consent is managed. Two
analytics paths run in parallel; a **headless** consent runtime (c15t) plus a
middleware geo decision gate the one that needs consent.

## The two analytics paths

- **Vercel Analytics + Speed Insights** — always on, **cookieless**, no consent
  required. Mounted in `src/app/(frontend)/layout.tsx` and untouched.
- **Google Analytics 4 (GA4)** — free, portable deep analytics, gated behind
  consent via Google **Consent Mode v2**. Loads only when
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
  cookie read, opt-out auto-grant), `CookieBanner.tsx`, `CookieDialog.tsx` (the
  disclosure + toggles), `ManageCookiesLink.tsx` (footer button), `consent-config.ts`
  (options, GA gating, banner/opt-out helpers). `src/lib/consent/` —
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
  grants it. An explicit choice via the dialog always wins. The geo cookie has a
  short TTL and is refreshed on each navigation, so a travelling visitor
  re-resolves.

## Consent Mode v2 — the cookieless-ping caveat (disclosed in the dialog)

GA4 is registered through c15t's prebuilt Google Tag integration
(`@c15t/scripts/google-tag`) with **Consent Mode v2**: gtag.js loads with consent
defaults **denied**, and c15t pushes `gtag('consent','update', …)` on grant/revoke.

- **Before consent:** GA4 sets **zero cookies**. gtag.js still loads
  (`alwaysLoad`), so Google receives a **cookieless consent-mode ping** with no
  identifiers — the basis of modeled conversions, disclosed in the dialog.
- **After grant:** `analytics_storage` → granted; GA4 collects.
- **After revoke:** back to denied; collection stops.

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

Names only, as ever: nothing here is a secret, and no DSN or id value belongs
in this repo. See `src/lib/observability/sessionId.ts` for the full
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
  (unconsented where not required; denied-until-grant where required). Before
  grant — zero GA cookies; a cookieless consent-mode ping is expected. After
  grant — events in DebugView; after revoke — collection stops. Vercel Analytics
  fires throughout.
