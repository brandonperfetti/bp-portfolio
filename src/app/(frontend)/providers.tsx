'use client'

import { createContext, Suspense, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeProvider, useTheme } from 'next-themes'

import { ConsentManager } from '@/components/consent/ConsentManager'
import type { ConsentConfig } from '@/components/consent/consent-content'

function ThemeWatcher() {
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    function onMediaChange() {
      const systemTheme = media.matches ? 'dark' : 'light'
      if (resolvedTheme === systemTheme) {
        setTheme('system')
      }
    }

    onMediaChange()
    media.addEventListener('change', onMediaChange)

    return () => {
      media.removeEventListener('change', onMediaChange)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export const AppContext = createContext<{ previousPathname?: string }>({})

/**
 * Tracks the previous pathname for the in-app "back" affordance
 * ({@link AppContext}), isolated so its `usePathname` read sits behind its own
 * Suspense boundary.
 *
 * @remarks #76 Piece 1: under `cacheComponents`, `usePathname` suspends during
 * the static-shell prerender of dynamic-param routes (`/articles/[slug]`,
 * `/[slug]`). Reading it directly in {@link Providers} — which wraps the whole
 * app — would force the entire tree into a Suspense boundary and remount every
 * page on hydration. Instead this leaf reads it, renders nothing, and reports
 * the previous pathname up so the provider can hold it in state; `children`
 * stay outside the boundary and never remount.
 */
function PreviousPathnameTracker({
  onChange,
}: {
  onChange: (previousPathname?: string) => void
}) {
  const pathname = usePathname()
  const currentPathnameRef = useRef(pathname)

  useEffect(() => {
    // Report the pathname we were on before this change as the "previous" one.
    // A ref (not `usePrevious`) so the value can't converge to the current
    // pathname when the parent re-renders after receiving it via state.
    if (currentPathnameRef.current !== pathname) {
      onChange(currentPathnameRef.current)
      currentPathnameRef.current = pathname
    }
  }, [pathname, onChange])

  return null
}

/**
 * Client provider shell for the `(frontend)` tree: theme, the previous-pathname
 * tracker, and the consent runtime.
 *
 * @remarks
 * Owns the {@link PreviousPathnameTracker} Suspense boundary and the
 * {@link AppContext} that holds `previousPathname` in state, so the whole app
 * (`children`) sits outside that boundary and never remounts on navigation
 * (#76 Piece 1). {@link ConsentManager} is mounted here, under the theme
 * provider, so the consent UI inherits the resolved theme; the server-resolved
 * `consentConfig` is threaded straight through to it.
 */
export function Providers({
  children,
  consentConfig,
}: {
  children: React.ReactNode
  /** CMS-driven consent copy/categories/toggles, resolved server-side in the
   * root layout and passed through to {@link ConsentManager}. Optional so
   * consumers/tests without a CMS fall back to the built-in defaults. */
  consentConfig?: ConsentConfig
}) {
  const [previousPathname, setPreviousPathname] = useState<string>()

  return (
    <AppContext.Provider value={{ previousPathname }}>
      <ThemeProvider attribute="class" disableTransitionOnChange>
        <ThemeWatcher />
        {/* Isolated so `children` never sit inside the pathname Suspense
            boundary (see PreviousPathnameTracker). */}
        <Suspense fallback={null}>
          <PreviousPathnameTracker onChange={setPreviousPathname} />
        </Suspense>
        <ConsentManager consentConfig={consentConfig}>
          {children}
        </ConsentManager>
      </ThemeProvider>
    </AppContext.Provider>
  )
}
