'use client'

import { useEffect, useState } from 'react'

/**
 * Machine-readable current year for an ongoing ("Present") role's `<time>`,
 * computed client-side (#76 B2).
 *
 * @remarks `new Date()` in a Client Component's render is still an unstable
 * value that `cacheComponents` rejects during prerender (measured — the B1
 * diagnosis clean-room; the Footer copyright only escapes it by living inside a
 * `<Suspense>` boundary). Reading it in `useEffect` (browser-only) keeps it out
 * of the prerender pass entirely: the prerendered HTML carries
 * `<time>Present</time>` and the `dateTime` is filled after hydration. The
 * visible label is unchanged; only the empty-CMS fallback resume reaches this.
 */
export function CurrentYearTime() {
  const [year, setYear] = useState<string | undefined>(undefined)
  useEffect(() => {
    setYear(new Date().getFullYear().toString())
  }, [])
  return <time dateTime={year}>Present</time>
}
