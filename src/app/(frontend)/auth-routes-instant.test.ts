import { describe, expect, it, vi } from 'vitest'

// #76 B3: the three noindex, genuinely-dynamic auth routes opt out of prerender
// via `export const instant = false`. Clerk is stubbed so importing the modules
// (for their `instant` export) doesn't pull the SDK into jsdom.
vi.mock('@clerk/nextjs', () => ({
  UserProfile: () => null,
  SignIn: () => null,
  SignUp: () => null,
}))
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))

import { instant as accountInstant } from '@/app/(frontend)/account/page'
import { instant as signInInstant } from '@/app/(frontend)/sign-in/[[...sign-in]]/page'
import { instant as signUpInstant } from '@/app/(frontend)/sign-up/[[...sign-up]]/page'

describe('#76 B3 instant=false on dynamic auth routes', () => {
  it('opts /account, /sign-in, /sign-up out of prerender', () => {
    expect(accountInstant).toBe(false)
    expect(signInInstant).toBe(false)
    expect(signUpInstant).toBe(false)
  })
})
