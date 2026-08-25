'use client'

import { createContext, Suspense, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeProvider, useTheme } from 'next-themes'

import { ConsentManager } from '@/components/consent/ConsentManager'

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

export function Providers({ children }: { children: React.ReactNode }) {
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
        <ConsentManager>{children}</ConsentManager>
      </ThemeProvider>
    </AppContext.Provider>
  )
}
