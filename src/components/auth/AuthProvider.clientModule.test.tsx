import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from '@/components/auth/AuthProvider'

/**
 * BP-PORTFOLIO-S: the layout's provider must reach Clerk through
 * `ClerkClientProvider`, the client module whose import keeps the
 * provider's name stable between the shell and a cold resume. Rendering
 * `@clerk/nextjs`'s `ClerkProvider` from `AuthProvider` directly would
 * bring the mismatch back, and `ClerkClientProvider.resume.test.tsx` would
 * not see it, since it renders `ClerkClientProvider` itself.
 */
vi.mock('@/components/auth/ClerkClientProvider', () => ({
  ClerkClientProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="clerk-client-provider">{children}</div>
  ),
}))

vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: () => {
    throw new Error(
      'AuthProvider rendered ClerkProvider directly; mount it through ClerkClientProvider (BP-PORTFOLIO-S)',
    )
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AuthProvider (BP-PORTFOLIO-S)', () => {
  it('mounts Clerk through ClerkClientProvider when Clerk is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')

    render(
      <AuthProvider>
        <div>site content</div>
      </AuthProvider>,
    )

    expect(screen.getByTestId('clerk-client-provider')).toContainElement(
      screen.getByText('site content'),
    )
  })
})
