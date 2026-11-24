import { describe, expect, it } from 'vitest'

import {
  enabledSocialProviders,
  socialProviderNames,
  socialProviderOf,
} from './socialProviders'

describe('enabledSocialProviders (#431)', () => {
  it('offers Google only when the GitHub flag is unset, as before #431', () => {
    expect(enabledSocialProviders({})).toEqual(['google'])
  })

  it('offers GitHub after Google when the flag is exactly "true"', () => {
    expect(enabledSocialProviders({ CLERK_GITHUB_ENABLED: 'true' })).toEqual([
      'google',
      'github',
    ])
  })

  it.each(['1', 'TRUE', 'yes', ''])(
    'treats %j as off: the connection must be switched on on purpose',
    (value) => {
      expect(enabledSocialProviders({ CLERK_GITHUB_ENABLED: value })).toEqual([
        'google',
      ])
    },
  )
})

describe('socialProviderOf', () => {
  it('names the connection behind a Clerk strategy', () => {
    expect(socialProviderOf('oauth_google')).toBe('google')
    expect(socialProviderOf('oauth_github')).toBe('github')
  })

  it('knows no other strategy', () => {
    expect(socialProviderOf('oauth_apple')).toBeUndefined()
    expect(socialProviderOf('email_code')).toBeUndefined()
    expect(socialProviderOf(null)).toBeUndefined()
  })
})

describe('socialProviderNames', () => {
  it('joins the names for a sentence', () => {
    expect(socialProviderNames(['google'])).toBe('Google')
    expect(socialProviderNames(['google', 'github'])).toBe('Google or GitHub')
  })
})
