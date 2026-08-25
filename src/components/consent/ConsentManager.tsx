'use client'

import { useMemo } from 'react'

// c15t prebuilt (styled) component styles — the full compiled stylesheet from
// @c15t/ui, self-contained (no Tailwind content scanning, so no tailwind.css
// edit). Runtime components come from @c15t/react (which @c15t/nextjs merely
// re-exports); importing the @c15t/nextjs barrel would drag in `next/script`
// via C15tPrefetch, which the repo's vitest unit resolver can't resolve and
// which offline mode doesn't need. @c15t/nextjs stays installed for the
// self-host fast-follow.
import '@c15t/react/styles.css'
import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
} from '@c15t/react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'

import {
  buildConsentManagerOptions,
  buildConsentScripts,
  readGaEnv,
} from './consent-config'

/**
 * App-wide c15t consent runtime: mounts the provider plus the banner and
 * dialog once, inside `Providers` so it reads the same next-themes context as
 * the rest of the app (light/dark parity, teal `:focus-visible` ring). Runs in
 * `mode: 'offline'` — GA4 is wired via c15t's Consent Mode v2 script loader;
 * the self-hosted backend is a separate fast-follow (#83).
 *
 * @see docs/ANALYTICS.md for the analytics + consent architecture.
 */
export function ConsentManager({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = usePrefersReducedMotion()

  const options = useMemo(() => {
    const { measurementId, isProduction } = readGaEnv()
    return buildConsentManagerOptions({
      scripts: buildConsentScripts({ measurementId, isProduction }),
      disableAnimation: prefersReducedMotion,
    })
  }, [prefersReducedMotion])

  return (
    <ConsentManagerProvider options={options}>
      {children}
      <ConsentBanner />
      <ConsentDialog />
    </ConsentManagerProvider>
  )
}
