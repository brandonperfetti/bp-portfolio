# Auth, gating & email capture (Clerk)

## Setup

- `@clerk/nextjs`; middleware lives in `src/proxy.ts` (Next 16 proxy
  convention), wrapped by `isClerkEnabled()` so missing keys never break
  boot. `<ClerkProvider>` mounts in the frontend layout under the same gate.
- Routes: `/sign-in`, `/sign-up` (catch-all Clerk components), `/account`.
- Header shows a signed-in-only `UserButton` chip (`HeaderUserButton`,
  mounted only when `isClerkEnabled()` — anonymous visitors and keys-off
  environments get the pre-auth header byte-identical). Sign-IN has no
  persistent header entry by design; gated-article CTAs are the door.
  "Manage account" navigates to `/account`, the one profile surface.
- Payload admin auth is **separate** (Payload Users) — Clerk never guards
  `/admin`.

## Gating model (server-side, §12)

- Posts carry `access.visibility = public | gated` plus dormant
  `requiredPlan` / `requiredFeature` fields (Clerk Billing seam).
- Enforcement happens in RSCs via `getViewer()` (`src/lib/auth/getViewer.ts`)
  - `canAccess(isAuthenticated, doc)` (`src/access/canAccess.ts`): gated
    bodies are excluded from the payload for anonymous viewers — a teaser +
    sign-in prompt renders instead. Client `<Protect>`-style components are
    UX only.
- **Billing flip (do not build until asked):** enable Clerk Billing, replace
  the `canAccess` internals with plan/feature checks (`has({ plan })`), and
  the field seams light up. `// TODO(brandon): enable Clerk Billing` marks
  the seam.

## Email capture

- Clerk webhook → `POST /api/clerk/webhook` (svix signature verified with
  `CLERK_WEBHOOK_SIGNING_SECRET`) → Resend contact, optionally segmented
  via `RESEND_CONTACT_SEGMENT_ID`. Respect the marketing consent field.
  (Migrated from the SendGrid marketing list 2026-08-10 — SendGrid walls
  contact storage behind a separate paid Marketing Campaigns plan.)
- Payload transactional email (forgot-password etc.) rides the
  `@payloadcms/email-resend` adapter configured in `payload.config.ts`
  (active when `RESEND_API_KEY` is set).
