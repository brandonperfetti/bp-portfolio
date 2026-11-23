import type { ReactNode } from 'react'

import { ClerkClientProvider } from '@/components/auth/ClerkClientProvider'
import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Wraps children in ClerkProvider only when Clerk is configured, so the app
 * renders identically (signed-out) in environments without keys.
 *
 * @remarks Appearance: `colorPrimary` brands the Clerk surfaces still
 * prebuilt (account, UserButton, Clerk's bot-check and Protect modals; sign-in
 * and sign-up are the site's own forms, #377, #379) with the site's
 * teal-700; dark mode needs
 * no JS wiring because Clerk's default theme keys off the CSS
 * `color-scheme` property, which `tailwind.css` sets on `:root`/`.dark` —
 * the components follow the next-themes toggle automatically.
 *
 * The provider is mounted through {@link ClerkClientProvider}, a client
 * module, so its name matches between the prerendered shell and a cold
 * resume (BP-PORTFOLIO-S; that component carries why).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkEnabled()) {
    return <>{children}</>
  }
  return (
    <ClerkClientProvider
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
    </ClerkClientProvider>
  )
}
