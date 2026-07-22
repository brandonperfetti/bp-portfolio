import { ClerkProvider } from '@clerk/nextjs'
import type { ReactNode } from 'react'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Wraps children in ClerkProvider only when Clerk is configured, so the app
 * renders identically (signed-out) in environments without keys.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkEnabled()) {
    return <>{children}</>
  }
  return <ClerkProvider>{children}</ClerkProvider>
}
