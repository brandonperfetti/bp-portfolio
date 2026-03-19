import { describe, expect, it } from 'vitest'

import { toSafeJsonLd } from './jsonLd'

describe('toSafeJsonLd', () => {
  it('escapes angle brackets and JS line separators', () => {
    const value = {
      text: '</script><script>alert(1)</script>',
      separators: 'line\u2028paragraph\u2029end',
    }

    const serialized = toSafeJsonLd(value)

    expect(serialized).toContain('\\u003c/script\\u003e\\u003cscript\\u003e')
    expect(serialized).toContain('\\u003e')
    expect(serialized).toContain('\\u2028')
    expect(serialized).toContain('\\u2029')
    expect(serialized).not.toContain('\u2028')
    expect(serialized).not.toContain('\u2029')
  })
})
