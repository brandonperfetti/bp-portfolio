/**
 * Whether Clerk is configured for this deployment.
 *
 * @remarks The whole auth surface is env-gated so staging/local boot cleanly
 * before Clerk keys exist (Phase 0 invariant: boots with only a database).
 * When keys are absent: no provider, pass-through middleware, gated content
 * renders its teaser as if signed out.
 */
export const isClerkEnabled = (): boolean =>
  Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  )
