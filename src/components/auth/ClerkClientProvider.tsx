'use client'

import { ClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

import { ClerkViewerFirstName } from '@/components/auth/ViewerFirstName'

/**
 * Clerk's provider, mounted from a client module so its rendered name is the
 * same in the prerendered shell and in every resume of it (BP-PORTFOLIO-S).
 *
 * @remarks
 * Importing `ClerkProvider` from `@clerk/nextjs` in a client module loads
 * `@clerk/nextjs`'s pages-router provider, and that module renames the
 * shared `@clerk/react` provider to `ReactClerkProvider` as it loads
 * (`ReactClerkProvider.displayName = "ReactClerkProvider"`, a module side
 * effect, in `@clerk/nextjs` 7.10.2 as installed;
 * `ClerkClientProvider.resume.test.tsx` fails when a release drops it).
 * React's resume compares each component's name with the one the prerender
 * recorded. When the server `ClerkProvider`
 * from `@clerk/nextjs` was rendered from the layout directly, the provider's
 * name depended on whether some other client module had already loaded that
 * file in the same process: the build that was looked at had (its shell
 * recorded `ReactClerkProvider`), the cold first render that was looked at
 * had not (it rendered `ClerkProvider`), and React gave up on the shell and
 * rendered the whole page on the client. Here the import that renames it is this module's own,
 * so it runs before the provider ever renders, in every process.
 *
 * The server provider rendered this same client provider, and this site does
 * not use its `dynamic` or keyless modes. One thing it did that this does
 * not: it merged Clerk's environment into the props on the server and sent
 * the result to the browser. Every variable that merge reads is a
 * `NEXT_PUBLIC_*` one, which the browser has for itself, with one
 * exception: Clerk's auto-proxy (`getAutoProxyUrlFromEnvironment` in
 * `@clerk/shared`), which reads the server-only `VERCEL_TARGET_ENV`,
 * `VERCEL_PROJECT_PRODUCTION_URL` and `CLERK_DISABLE_AUTO_PROXY` and so
 * would now resolve on the server and not in the browser. It is off here: it
 * needs a live key and a project whose production URL ends in `.vercel.app`,
 * and this project's production domain is a custom one. If the custom
 * domain is ever removed, set `proxyUrl` or `domain` explicitly.
 *
 * It also mounts {@link ClerkViewerFirstName} directly inside the provider,
 * so the viewer's first name is supplied exactly where Clerk is mounted and
 * nowhere else (#381).
 *
 * @param props - `appearance`, Clerk's theming for every Clerk surface, and
 *   `children`, the site.
 */
export function ClerkClientProvider({
  appearance,
  children,
}: {
  appearance: Parameters<typeof ClerkProvider>[0]['appearance']
  children: ReactNode
}) {
  return (
    <ClerkProvider appearance={appearance}>
      <ClerkViewerFirstName>{children}</ClerkViewerFirstName>
    </ClerkProvider>
  )
}
