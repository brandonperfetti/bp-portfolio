import { expect } from '@playwright/test'

/**
 * Retry a client interaction until its effect lands.
 *
 * @remarks
 * Under Next 16 `cacheComponents` / partial-prerendering the interactive
 * islands (command palette, consent surface, filter inputs, the `/`-focus
 * shortcut) hydrate *after* the static shell paints and `load`/`domcontentloaded`
 * fire. A click or keypress fired immediately after `page.goto` can therefore
 * hit server-rendered markup whose React handlers are not yet attached, and
 * silently no-op — the failure mode measured on PR #111's Build·E2E run
 * (issue #114, mechanism A). Retrying the *trigger* (never the assertion) waits
 * hydration out deterministically without masking a genuinely broken feature:
 * if the effect never lands, this still fails at `timeout`.
 *
 * @param trigger - The interaction plus its own effect assertion. Must throw
 *   (e.g. via an `expect`) when the effect has not landed yet, so it is retried.
 *   Must be *idempotent*: each retry re-fires the whole trigger — its action as
 *   well as its assertion — so a non-idempotent action (e.g. one that
 *   double-submits) would compound across retries instead of settling.
 * @param options - Optional `timeout` (ms) for the whole retry loop.
 */
export async function interactUntil(
  trigger: () => Promise<void>,
  options?: { timeout?: number },
): Promise<void> {
  await expect(async () => {
    await trigger()
  }).toPass({
    timeout: options?.timeout ?? 15_000,
    intervals: [50, 100, 200, 400, 800, 1200],
  })
}
