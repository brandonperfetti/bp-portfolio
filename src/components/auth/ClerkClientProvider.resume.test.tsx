// @vitest-environment node
import path from 'node:path'

import { Suspense, type ComponentType, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * BP-PORTFOLIO-S: a cold server must resume the prerendered shell without
 * React reporting "Expected the resume to render <ReactClerkProvider> in
 * this slot but instead it rendered <ClerkProvider>".
 *
 * The test rebuilds the two processes involved with React's own
 * prerender/resume and Clerk's real modules. The **shell** is prerendered
 * the way a build worker does it, after other client components have
 * already loaded `@clerk/nextjs`. The **resume** runs in a fresh module
 * registry, standing for a cold server: the provider module is the first
 * Clerk module it loads, the order a cold resume of the layout loads them.
 * React compares each component's name with the one in the shell.
 *
 * The first case pins the hazard in `@clerk/nextjs` itself, so a Clerk
 * release that drops the rename shows up here (then `ClerkClientProvider`
 * can go). The second is the regression test for this site's provider.
 */

vi.mock('next/navigation', () => {
  const router = {
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
  }
  return {
    useRouter: () => router,
    usePathname: () => '/sign-up',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  }
})

type Provider = ComponentType<{ children: ReactNode }>

const PUBLISHABLE_KEY = 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k'

const CLERK_APP_ROUTER_PROVIDER = path.resolve(
  'node_modules/@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js',
)

/** Suspends for good, so the prerender leaves a hole for the resume. */
function Hole(): ReactNode {
  throw new Promise(() => undefined)
}

function page(Provider: Provider) {
  return (
    <html lang="en">
      <body>
        <Provider>
          <main>
            <Suspense fallback={<p>loading</p>}>
              <Hole />
            </Suspense>
          </main>
        </Provider>
      </body>
    </html>
  )
}

/**
 * Prerenders `page()` the way a build worker does, with `@clerk/nextjs`
 * already loaded, and returns the postponed state.
 */
async function prerenderShell(loadProvider: () => Promise<Provider>) {
  vi.resetModules()
  await import('@clerk/nextjs')
  const Provider = await loadProvider()
  const { prerender } = await import('react-dom/static')
  const controller = new AbortController()
  const pending = prerender(page(Provider), {
    signal: controller.signal,
    onError: () => undefined,
  })
  // Let everything that can render finish, then halt on the hole.
  await new Promise((resolve) => setTimeout(resolve, 50))
  controller.abort()
  const { postponed, prelude } = await pending
  await new Response(prelude).text()
  expect(postponed).not.toBeNull()
  return postponed!
}

/** Resumes the shell in a fresh module registry; returns React's errors. */
async function resumeCold(
  loadProvider: () => Promise<Provider>,
  postponed: Awaited<ReturnType<typeof prerenderShell>>,
) {
  vi.resetModules()
  const Provider = await loadProvider()
  const { resume } = await import('react-dom/server')
  const errors: string[] = []
  const stream = await resume(page(Provider), postponed, {
    onError: (error) => {
      errors.push(error instanceof Error ? error.message : String(error))
    },
  })
  const reader = stream.getReader()
  // The hole never resolves; the shell part of the resume is what matters.
  await Promise.race([
    (async () => {
      while (!(await reader.read()).done) {
        /* drain */
      }
    })(),
    new Promise((resolve) => setTimeout(resolve, 50)),
  ])
  await reader.cancel()
  return errors
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Clerk provider under a cold resume (BP-PORTFOLIO-S)', () => {
  it('pins the hazard: Clerk’s own app-router provider changes name between a warm and a cold process', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', PUBLISHABLE_KEY)
    // What `@clerk/nextjs`'s server `ClerkProvider` renders on the server.
    const loadClerkAppRouterProvider = async () => {
      // Not a public export, so it is loaded by its file path.
      const { ClientClerkProvider } = await import(
        /* @vite-ignore */ CLERK_APP_ROUTER_PROVIDER
      )
      return ClientClerkProvider as Provider
    }

    const postponed = await prerenderShell(loadClerkAppRouterProvider)
    const errors = await resumeCold(loadClerkAppRouterProvider, postponed)

    expect(errors).toContainEqual(
      expect.stringContaining(
        'Expected the resume to render <ReactClerkProvider> in this slot but instead it rendered <ClerkProvider>',
      ),
    )
  })

  it('resumes the site’s provider on a cold server with no tree mismatch', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', PUBLISHABLE_KEY)
    const loadSiteProvider = async () => {
      const { ClerkClientProvider } =
        await import('@/components/auth/ClerkClientProvider')
      const SiteProvider: Provider = ({ children }) => (
        <ClerkClientProvider appearance={undefined}>
          {children}
        </ClerkClientProvider>
      )
      return SiteProvider
    }

    const postponed = await prerenderShell(loadSiteProvider)
    const errors = await resumeCold(loadSiteProvider, postponed)

    expect(errors.filter((m) => m.includes('Expected the resume'))).toEqual([])
  })
})
