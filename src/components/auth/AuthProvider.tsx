import { ClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Wraps children in ClerkProvider only when Clerk is configured, so the app
 * renders identically (signed-out) in environments without keys.
 *
 * @remarks Appearance: `colorPrimary` brands every Clerk surface (sign-in,
 * sign-up, account, UserButton) with the site's teal-700; dark mode needs
 * no JS wiring because Clerk's default theme keys off the CSS
 * `color-scheme` property, which `tailwind.css` sets on `:root`/`.dark` —
 * the components follow the next-themes toggle automatically.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkEnabled()) {
    return <>{children}</>
  }
  return (
    <ClerkProvider
      appearance={{
        variables: {
          // teal-700 — matches the site's primary action color (buttons,
          // links) so Clerk cards read as first-party UI.
          colorPrimary: '#0f766e',
          // rounded-xl, the site's control radius.
          borderRadius: '0.75rem',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
