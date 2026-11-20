import { existsSync } from 'node:fs'
import path from 'node:path'

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AccountPage from './page'

/**
 * #391: `<UserProfile>` path-routes its sub-pages (`/account/security`, …), so
 * a direct load of one must reach this page rather than the CMS catch-all.
 *
 * `@clerk/nextjs` is mocked as in the sign-in page test: the mock renders the
 * props it received, so the routing contract is pinned. `redirect` throws, as
 * the real one does, so a redirected render never reaches the profile.
 */
vi.mock('@clerk/nextjs', () => ({
  UserProfile: (props: Record<string, unknown>) => (
    <div data-testid="user-profile" data-props={JSON.stringify(props)} />
  ),
}))

const auth = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({ auth: () => auth() }))

const redirect = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT ${to}`)
})
vi.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
}))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_x')
})

afterEach(() => {
  vi.unstubAllEnvs()
  auth.mockReset()
  redirect.mockClear()
})

describe('AccountPage', () => {
  it('is an optional catch-all, so /account and every sub-page such as /account/security resolve to it', () => {
    const accountDir = path.resolve(__dirname, '..')
    expect(path.basename(__dirname)).toBe('[[...account]]')
    // A plain page beside the catch-all would claim /account on its own and
    // is the shape that 404'd sub-pages (#391).
    expect(existsSync(path.join(accountDir, 'page.tsx'))).toBe(false)
  })

  it('renders <UserProfile> path-routed under /account for a signed-in visitor', async () => {
    auth.mockResolvedValue({ userId: 'user_1' })

    render(await AccountPage())

    const props = JSON.parse(
      screen.getByTestId('user-profile').dataset.props ?? '{}',
    )
    expect(props).toMatchObject({ path: '/account', routing: 'path' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends a signed-out visitor to /sign-in', async () => {
    auth.mockResolvedValue({ userId: null })

    await expect(AccountPage()).rejects.toThrow('NEXT_REDIRECT /sign-in')
  })

  it('sends visitors home when Clerk is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
    vi.stubEnv('CLERK_SECRET_KEY', '')

    await expect(AccountPage()).rejects.toThrow('NEXT_REDIRECT /')
    expect(auth).not.toHaveBeenCalled()
  })
})
