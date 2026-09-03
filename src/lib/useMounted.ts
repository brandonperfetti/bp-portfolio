'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the component has completed its first client commit.
 *
 * @remarks
 * The hydration contract, written once here so the three call sites cannot
 * drift: React requires the server render and the **hydration render** to
 * produce the same tree. Anything a component can only know in the browser —
 * `localStorage`, a cookie, the visitor's clock, the resolved theme — is
 * therefore unusable during that first render even though the value is already
 * available client-side. Reading it anyway is what makes React discard the SSR
 * output and regenerate the tree (#140).
 *
 * `false` on the server AND on the hydration render, `true` from the first
 * post-hydration commit onwards, because the `useEffect` that flips it does not
 * run on the server and runs after that commit in the browser. So gating a
 * browser-only branch on this makes both renders agree *by construction* rather
 * than by the branch happening to match.
 *
 * Deliberately not a `useSyncExternalStore` with a `getServerSnapshot`: that is
 * the better tool when the browser-only value comes from a store you control,
 * but the three call sites here read `next-themes`, the visitor's clock and
 * c15t — and c15t 2.2.1 in particular seeds its store from `localStorage`
 * synchronously at creation and exposes no server-snapshot seam, so subscribing
 * would still hand back the browser value on the hydration render.
 *
 * The cost is one extra commit before the browser-only branch paints. That is
 * the intended trade: a deferred paint, never a mismatched one.
 *
 * @returns `false` until the component has mounted in the browser, then `true`.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}
