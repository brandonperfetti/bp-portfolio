// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { resolveTestimonialsDeck } from '@/blocks/Testimonials/deck'

/**
 * The pure deck resolver (#61): proves the two "Cards Stack" contracts without
 * mounting Swiper — autoplay stays OFF, and the stacked `EffectCards` flourish
 * degrades to a plain slide under reduced motion — and that both come *through*
 * the shared `resolveCarouselBehavior` mapping rather than a duplicated one.
 */
describe('resolveTestimonialsDeck', () => {
  it('mounts the stacked deck and keeps autoplay off when motion is allowed', () => {
    const { behavior, stacked } = resolveTestimonialsDeck(false)
    expect(stacked).toBe(true)
    expect(behavior.autoplay).toBe(false)
    expect(behavior.navigation).toBe(true)
    expect(behavior.pagination).toBe(true)
    expect(behavior.keyboard).toBe(true)
  })

  it('degrades the stacked effect to a plain slide under reduced motion', () => {
    const { stacked } = resolveTestimonialsDeck(true)
    expect(stacked).toBe(false)
  })

  it('never autoplays and always keeps keyboard nav, even under reduced motion', () => {
    const reduced = resolveTestimonialsDeck(true)
    expect(reduced.behavior.autoplay).toBe(false)
    expect(reduced.behavior.keyboard).toBe(true)
  })
})
