import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildConfirmEmail,
  confirmLinkOrigin,
} from '@/lib/email/newsletterConfirmEmail'

/**
 * Where a confirmation link points (#411 review): the deployment that took
 * the sign-up, so staging links confirm on staging, but never a host a
 * forged header names, since the link goes out in mail from Brandon.
 */

const req = (headers: Record<string, string>) =>
  new Request('https://internal.invalid/api/newsletter', { headers })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('confirmLinkOrigin', () => {
  it('uses the site host, or a subdomain of it such as staging', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://brandonperfetti.com')
    expect(confirmLinkOrigin(req({ host: 'brandonperfetti.com' }))).toBe(
      'https://brandonperfetti.com',
    )
    expect(
      confirmLinkOrigin(
        req({ 'x-forwarded-host': 'staging.brandonperfetti.com' }),
      ),
    ).toBe('https://staging.brandonperfetti.com')
  })

  it("uses the deployment's own Vercel hosts", () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://brandonperfetti.com')
    vi.stubEnv('VERCEL_URL', 'bp-abc123.vercel.app')
    vi.stubEnv('VERCEL_BRANCH_URL', 'bp-git-develop.vercel.app')
    expect(confirmLinkOrigin(req({ host: 'bp-abc123.vercel.app' }))).toBe(
      'https://bp-abc123.vercel.app',
    )
    expect(confirmLinkOrigin(req({ host: 'bp-git-develop.vercel.app' }))).toBe(
      'https://bp-git-develop.vercel.app',
    )
  })

  it('uses http for localhost', () => {
    expect(confirmLinkOrigin(req({ host: 'localhost:3000' }))).toBe(
      'http://localhost:3000',
    )
  })

  it('falls back to the site URL for any other host, or none', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://brandonperfetti.com/')
    for (const host of [
      'evil.example',
      'brandonperfetti.com.evil.example',
      'notbrandonperfetti.com',
    ]) {
      expect(confirmLinkOrigin(req({ host }))).toBe(
        'https://brandonperfetti.com',
      )
    }
    expect(confirmLinkOrigin(req({}))).toBe('https://brandonperfetti.com')
  })
})

describe('buildConfirmEmail', () => {
  it('links to the confirm page on the origin it is given', () => {
    const { text, html } = buildConfirmEmail(
      'tok_en',
      'https://staging.brandonperfetti.com',
    )
    const link =
      'https://staging.brandonperfetti.com/newsletter/confirm?token=tok_en'
    expect(text).toContain(link)
    expect(html).toContain(`href="${link}"`)
  })
})
