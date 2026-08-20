'use client'

import { useEffect } from 'react'

import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'

/**
 * Root error boundary for the App Router (Next.js's `global-error.tsx`
 * convention) — catches render crashes that escape every other boundary,
 * including the root layout itself.
 *
 * @remarks
 * Because this replaces the entire root layout tree when it renders, it
 * defines its own `<html>`/`<body>` and cannot rely on `RootLayout`'s
 * providers (`next-themes`'s `ThemeProvider`, in particular, never mounts
 * here) — the tiny inline `<style>` below covers light/dark parity via a
 * plain `prefers-color-scheme` media query instead of the app's usual
 * `.dark`-class strategy, so this fallback still respects the visitor's
 * OS theme even though the JS that normally drives theming didn't run.
 *
 * `Sentry.captureException` no-ops when `Sentry.init` was never called
 * (no DSN configured) — see `src/instrumentation-client.ts` — so this
 * file is a harmless import with Sentry disabled, same as every other
 * entrypoint in #73.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <style>{`
          body {
            display: flex;
            min-height: 100vh;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 1.5rem;
            font-family: ui-sans-serif, system-ui, sans-serif;
            background: #fafafa;
            color: #27272a;
          }
          @media (prefers-color-scheme: dark) {
            body {
              background: #000;
              color: #f4f4f5;
            }
          }
          .global-error-actions a {
            color: inherit;
            text-decoration: underline;
            text-underline-offset: 2px;
          }
        `}</style>
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.5rem' }}>
            We&rsquo;ve been notified and are looking into it.
          </p>
          <p className="global-error-actions" style={{ marginTop: '1rem' }}>
            <Link href="/">Go back home</Link>
          </p>
        </div>
      </body>
    </html>
  )
}
