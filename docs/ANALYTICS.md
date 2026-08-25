# Analytics & consent (#83)

How brandonperfetti.com measures traffic, and how consent is managed. Two
analytics paths run in parallel by design; a self-hosted consent runtime
(c15t) gates the one that needs consent.

## The two analytics paths

- **Vercel Analytics + Speed Insights** — always on, **cookieless**, no consent
  required. Mounted in `src/app/(frontend)/layout.tsx` (`<Analytics />`,
  `<SpeedInsights />`) and untouched by the consent work. This is the baseline.
- **Google Analytics 4 (GA4)** — free, portable deep analytics, paired with the
  existing Search Console property. GA4 is **not** cookieless, so it is gated
  behind consent via Google **Consent Mode v2**. Enabled only when
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set **and** the build is production.

Why both: Vercel Analytics is the zero-config cookieless baseline; GA4 is free
and the c15t consent pattern is reusable across projects (the portability
motivation in #83). Out of scope: Google Tag Manager, ads/marketing pixels,
any other vendor.

## Consent runtime — c15t

The consent banner, dialog, and "Manage cookies" entry point are provided by
[c15t](https://c15t.com) (`@c15t/nextjs`, Apache-2.0, self-hostable), mounted
once app-wide inside `src/app/(frontend)/providers.tsx` so it reads the same
next-themes context as the rest of the site. The surface is themed from the
site's own zinc/teal tokens (both light and dark) via c15t's JS theme config —
no second colour system, no edit to `tailwind.css`.

- **Files:** `src/components/consent/` — `ConsentManager.tsx` (provider, banner,
  dialog), `consent-config.ts` (offline options, theme, GA4 gating),
  `ManageCookiesLink.tsx` (persistent entry point, rendered in the footer).
- **Categories:** `necessary` (always on) and `measurement` (GA4). No
  `marketing`/`functional`.

### Consent mode: offline (this landing) → self-host (fast-follow)

c15t currently runs in **`mode: 'offline'`** — fully client-side, consent stored
in `localStorage`, no backend service. This ships the banner, dialog, GA4
gating, and the manage-cookies entry point with zero backend to operate.

The **self-hosted `@c15t/backend`** is a deliberate, separate fast-follow
(decided self-host in #83). The recommended target is an in-app Next.js Route
Handler reusing the existing Supabase Postgres via a Drizzle adapter (c15t's
own tables in their own schema), with a separate deployed service as the
fallback — gated on two probes (Payload/c15t schema ownership; Supavisor
transaction-mode pooling). Until then, offline mode is the runtime.

**Geo behaviour, stated honestly.** Offline mode has no server `/init`, so it
**cannot geo-detect a real visitor** — a visitor's jurisdiction is only known
if passed explicitly (`overrides`, used in Storybook). With the built-in preset
triad (`europeOptIn` + `californiaOptOut` + `worldNoBanner`), every real
offline visitor resolves via the **fallback** (`europeOptIn`): the banner is
shown and all non-necessary consent defaults **denied**. That is conservative
and compliant (it never silently hides the banner from someone who needs it),
but it does **not** suppress the banner outside required jurisdictions — true
per-visitor geo-scoping arrives with the self-host backend.

## Consent Mode v2 — the cookieless-ping caveat (disclose this)

GA4 is registered through c15t's prebuilt Google Tag integration
(`@c15t/scripts/google-tag`) with **Consent Mode v2**: gtag.js loads with
consent defaults set to **denied**, and c15t pushes `gtag('consent', 'update', …)`
when the visitor grants or revokes. This is the standard Consent Mode v2 model,
and it has an honest caveat worth disclosing:

- **Before consent:** GA4 sets **zero cookies**. Because gtag.js itself loads
  (`alwaysLoad` — Google's own consent API does the request gating), Google
  receives a **cookieless "consent-mode ping"** with no identifiers. This is by
  design (the basis of modeled conversions) and is what "zero requests before
  consent" in the original acceptance criteria was reworded to mean: **zero GA
  cookies; only the cookieless ping before grant, disclosed.**
- **After grant:** `analytics_storage` flips to granted; GA4 collects normally.
- **After revoke:** consent returns to denied; collection stops.

## Essential cookies (exempt from the banner)

The site's only pre-existing cookies are strictly-necessary and consent
frameworks exempt them — they are set regardless of the consent choice:

- **Clerk** — authentication session (visitor sign-in/gating). See `docs/AUTH.md`.
- **Cloudflare Turnstile** — bot/security challenge on the contact form (and,
  when armed, Corvus chat). Security category.

## Verifying it (browser, not sandbox)

The a11y gate (`addon-a11y`, `test: 'error'`) and the Storybook `play` functions
run under `pnpm test:storybook` / CI, not in a headless sandbox. Manual/CI
checks:

- **Both themes at ~1440/768/390:** banner and dialog readable, don't obscure
  primary CTAs, dialog category list scrolls at 390px.
- **Keyboard:** Tab/Shift+Tab through banner and dialog; Escape closes the
  dialog and restores focus; toggles are real controls; the teal
  `:focus-visible` ring shows (confirm c15t ships no competing `outline: none`).
- **Reduced motion:** banner enter/exit is static under
  `prefers-reduced-motion` (also forced off via c15t `disableAnimation`).
- **Network/cookies (production build, cleared storage):** before grant — zero
  `google-analytics.com`/`googletagmanager.com` **cookies**, though the gtag.js
  script and a cookieless consent-mode ping are expected. After grant — GA4
  events flow (DebugView/Realtime). After revoke — collection stops.
- **Vercel Analytics** fires throughout, regardless of consent state.
