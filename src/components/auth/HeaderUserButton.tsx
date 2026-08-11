'use client'

import { Show, UserButton } from '@clerk/nextjs'

/**
 * Signed-in-only account chip for the header (Clerk `UserButton`).
 *
 * @remarks Renders nothing for anonymous visitors, so the header stays
 * visually identical to the pre-auth design for the overwhelming majority
 * of traffic — the affordance (account management + sign out) only appears
 * for the users who need it. Sign-IN has no persistent header entry point
 * by design: gated-article CTAs are the contextual door.
 *
 * Must only be mounted when Clerk is configured (the parent threads
 * `isClerkEnabled()` from the server), because Clerk components require
 * `ClerkProvider`, which `AuthProvider` omits in keys-off environments.
 * "Manage account" navigates to `/account` (the one canonical profile
 * surface) instead of Clerk's default modal.
 */
export function HeaderUserButton() {
  return (
    <Show when="signed-in">
      <UserButton
        userProfileMode="navigation"
        userProfileUrl="/account"
        appearance={{
          elements: {
            userButtonAvatarBox:
              'h-8 w-8 ring-1 ring-zinc-900/5 dark:ring-white/10',
          },
        }}
      />
    </Show>
  )
}
