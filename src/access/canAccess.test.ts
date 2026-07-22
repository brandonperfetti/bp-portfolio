import { describe, expect, it } from 'vitest'

import { canAccess } from './canAccess'

describe('canAccess (server-side gating, §12)', () => {
  it('allows everyone when visibility is public', () => {
    expect(canAccess(false, { access: { visibility: 'public' } })).toBe(true)
    expect(canAccess(true, { access: { visibility: 'public' } })).toBe(true)
  })

  it('treats a missing access group as public', () => {
    expect(canAccess(false, {})).toBe(true)
    expect(canAccess(false, null)).toBe(true)
    expect(canAccess(false, undefined)).toBe(true)
  })

  it('blocks anonymous viewers from gated content', () => {
    expect(canAccess(false, { access: { visibility: 'gated' } })).toBe(false)
  })

  it('allows signed-in viewers through gated content', () => {
    expect(canAccess(true, { access: { visibility: 'gated' } })).toBe(true)
  })
})
