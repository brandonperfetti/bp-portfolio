'use client'

import { ClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

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
 * file in the same process: a build worker always had (its shell recorded
 * `ReactClerkProvider`), a cold server often had not (it rendered
 * `ClerkProvider`), and React gave up on the shell and rendered the whole
 * page on the client. Here the import that renames it is this module's own,
 * so it runs before the provider ever renders, in every process.
 *
 * The server provider rendered this same client provider, with the same
 * props: Clerk merges only `NEXT_PUBLIC_*` variables into them, and this
 * site does not use its `dynamic` or keyless modes.
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
  return <ClerkProvider appearance={appearance}>{children}</ClerkProvider>
}
