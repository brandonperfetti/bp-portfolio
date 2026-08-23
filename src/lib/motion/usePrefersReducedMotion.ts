'use client'

import { useLayoutEffect, useState } from 'react'

/** Media query string for the platform reduced-motion preference. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Synchronously reads the platform reduced-motion preference.
 *
 * This is the single shared source for the `matchMedia` reduced-motion read —
 * no animation component may re-check it inline. Unlike {@link usePrefersReducedMotion},
 * it resolves the current value on demand, so a `useLayoutEffect`/`useEffect`
 * body can gate motion on the *first* client pass, before the hook's state has
 * flushed. SSR-safe: returns `false` when `window` is unavailable.
 *
 * @returns `true` when the user has requested reduced motion, else `false`.
 */
export function getPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Tracks the user-level reduced motion preference so animation components
 * can gracefully fall back to static rendering.
 *
 * @remarks Wraps the shared {@link getPrefersReducedMotion} read in reactive
 * state and subscribes to changes. Effect bodies that must gate on the first
 * client pass should call {@link getPrefersReducedMotion} directly rather than
 * re-reading `matchMedia` inline.
 */
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const media = window.matchMedia(REDUCED_MOTION_QUERY)
    const update = () => setPrefersReducedMotion(media.matches)

    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  return prefersReducedMotion
}
