import { describe, expect, it } from 'vitest'

import { shouldUseGeneratedOg } from './resolveOgImage'

describe('shouldUseGeneratedOg', () => {
  it('generated mode always uses a card, regardless of toggle or cover', () => {
    for (const generatedOgEnabled of [true, false]) {
      for (const hasOwnImage of [true, false]) {
        expect(
          shouldUseGeneratedOg({
            mode: 'generated',
            generatedOgEnabled,
            hasOwnImage,
          }),
        ).toBe(true)
      }
    }
  })

  it('bespoke mode never uses a card, regardless of toggle or cover', () => {
    for (const generatedOgEnabled of [true, false]) {
      for (const hasOwnImage of [true, false]) {
        expect(
          shouldUseGeneratedOg({
            mode: 'bespoke',
            generatedOgEnabled,
            hasOwnImage,
          }),
        ).toBe(false)
      }
    }
  })

  it('auto generates only when the toggle is on and there is no own cover', () => {
    expect(
      shouldUseGeneratedOg({
        mode: 'auto',
        generatedOgEnabled: true,
        hasOwnImage: false,
      }),
    ).toBe(true)
    expect(
      shouldUseGeneratedOg({
        mode: 'auto',
        generatedOgEnabled: true,
        hasOwnImage: true,
      }),
    ).toBe(false)
    expect(
      shouldUseGeneratedOg({
        mode: 'auto',
        generatedOgEnabled: false,
        hasOwnImage: false,
      }),
    ).toBe(false)
  })

  it('treats an absent mode as auto', () => {
    expect(
      shouldUseGeneratedOg({
        mode: undefined,
        generatedOgEnabled: true,
        hasOwnImage: false,
      }),
    ).toBe(true)
    expect(
      shouldUseGeneratedOg({
        mode: undefined,
        generatedOgEnabled: false,
        hasOwnImage: false,
      }),
    ).toBe(false)
  })
})
