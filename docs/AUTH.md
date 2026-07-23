# Auth, gating & email capture (Clerk)

## Setup

- `@clerk/nextjs`; middleware lives in `src/proxy.ts` (Next 16 proxy
  convention), wrapped by `isClerkEnabled()` so missing keys never break
  boot. `<ClerkProvider>` mounts in the frontend layout under the same gate.
- Routes: `/sign-in`, `/sign-up` (catch-all Clerk components), `/account`.
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
  `CLERK_WEBHOOK_SIGNING_SECRET`) → SendGrid marketing list
  (`SENDGRID_MARKETING_LIST_ID`). Respect the marketing consent field.
- Payload transactional email (forgot-password etc.) rides the SendGrid SMTP
  adapter configured in `payload.config.ts` (active when
  `SENDGRID_API_KEY` is set).
