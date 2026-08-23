// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SECTION_WIDTH_CLASSES } from '@/blocks/Container/section'
import {
  PHOTO_STRIP_FULL_BLEED_CLASS,
  photoStripFullBleedClass,
} from '@/blocks/PhotoStrip/fullBleed'

/**
 * Guards the PhotoStrip full-bleed breakout: off by default (empty string),
 * and — when on — the exact established full-bleed idiom, not a second hand
 * copy of it. The homepage renders its gallery outside the reading container
 * to span the viewport; this is what lets a CMS `photoStrip` block do the same.
 */
describe('photo strip full bleed', () => {
  it('adds nothing at all when the checkbox is off', () => {
    expect(photoStripFullBleedClass(false)).toBe('')
    expect(photoStripFullBleedClass(null)).toBe('')
    expect(photoStripFullBleedClass(undefined)).toBe('')
  })

  it('breaks out to the viewport when on', () => {
    expect(photoStripFullBleedClass(true)).toBe(PHOTO_STRIP_FULL_BLEED_CLASS)
  })

  it('reuses the container section full-bleed idiom rather than a new one', () => {
    // One breakout pattern across the codebase — if `Container/section.ts`
    // changes how full bleed escapes its wrapper, this fails loudly instead
    // of leaving the photo strip on a stale copy.
    expect(PHOTO_STRIP_FULL_BLEED_CLASS).toBe(SECTION_WIDTH_CLASSES.fullBleed)
    expect(PHOTO_STRIP_FULL_BLEED_CLASS).toBe(
      'relative left-1/2 w-screen -translate-x-1/2',
    )
  })
})
