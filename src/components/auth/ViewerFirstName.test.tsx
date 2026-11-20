import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  ClerkViewerFirstName,
  useViewerFirstName,
  ViewerFirstNameProvider,
} from '@/components/auth/ViewerFirstName'

const useUser = vi.fn()
vi.mock('@clerk/nextjs', () => ({ useUser: () => useUser() }))

function NameProbe() {
  return <p>{useViewerFirstName() ?? 'anonymous'}</p>
}

/**
 * #381: the viewer's first name comes from the tree, never from an env var,
 * so a component rendered with no Clerk provider reads an anonymous visitor
 * instead of calling `useUser` and throwing.
 */
describe('ViewerFirstName (#381)', () => {
  it('reads null with no provider mounted, whatever the env says', () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_placeholder')
    try {
      render(<NameProbe />)
      expect(screen.getByText('anonymous')).toBeInTheDocument()
      expect(useUser).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reads the name a stub provider supplies', () => {
    render(
      <ViewerFirstNameProvider firstName="Ada">
        <NameProbe />
      </ViewerFirstNameProvider>,
    )
    expect(screen.getByText('Ada')).toBeInTheDocument()
  })

  it("supplies Clerk's first name inside the Clerk provider", () => {
    useUser.mockReturnValue({ user: { firstName: 'Grace' } })
    render(
      <ClerkViewerFirstName>
        <NameProbe />
      </ClerkViewerFirstName>,
    )
    expect(screen.getByText('Grace')).toBeInTheDocument()
  })

  it('supplies null for a signed-out visitor', () => {
    useUser.mockReturnValue({ user: null })
    render(
      <ClerkViewerFirstName>
        <NameProbe />
      </ClerkViewerFirstName>,
    )
    expect(screen.getByText('anonymous')).toBeInTheDocument()
  })
})
