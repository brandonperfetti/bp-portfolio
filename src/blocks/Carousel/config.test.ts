// @vitest-environment node
import type { ArrayField, CollapsibleField, Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Carousel } from '@/blocks/Carousel/config'
import {
  CAROUSEL_DIRECTION_ENUM_NAME,
  CAROUSEL_EFFECT_ENUM_NAME,
  CAROUSEL_VARIANT_ENUM_NAME,
  DEFAULT_CAROUSEL_DIRECTION,
  DEFAULT_CAROUSEL_EFFECT,
  DEFAULT_CAROUSEL_VARIANT,
  EXPO_MAX_ROTATE,
} from '@/blocks/Carousel/options'

const named = (fields: Field[], name: string): Field | undefined =>
  fields.find(
    (f): f is Field & { name: string } => 'name' in f && f.name === name,
  )

const behaviourFields = (): Field[] => {
  const collapsible = Carousel.fields.find(
    (f): f is CollapsibleField => f.type === 'collapsible',
  )
  if (!collapsible) throw new Error('no behaviour collapsible')
  // Flatten the row fields so a knob is found regardless of its row wrapper.
  return collapsible.fields.flatMap((f) => (f.type === 'row' ? f.fields : [f]))
}

/** Guards #41's mapping block: identity, the two enums, and the behaviour defaults. */
describe('Carousel block config', () => {
  it('registers as the generic carousel block', () => {
    expect(Carousel.slug).toBe('carousel')
    expect(Carousel.interfaceName).toBe('CarouselBlock')
    expect(Carousel.imageURL).toBe('/images/cms/carousel.svg')
  })

  it('names both selects explicitly, inside the 63-char identifier limit', () => {
    const variant = named(Carousel.fields, 'variant') as SelectField
    const effect = behaviourFields().find(
      (f): f is SelectField => 'name' in f && f.name === 'effect',
    ) as SelectField

    expect(variant.type).toBe('select')
    expect(variant.enumName).toBe(CAROUSEL_VARIANT_ENUM_NAME)
    expect(variant.defaultValue).toBe(DEFAULT_CAROUSEL_VARIANT)

    expect(effect.type).toBe('select')
    expect(effect.enumName).toBe(CAROUSEL_EFFECT_ENUM_NAME)
    expect(effect.defaultValue).toBe(DEFAULT_CAROUSEL_EFFECT)

    for (const name of [
      CAROUSEL_VARIANT_ENUM_NAME,
      CAROUSEL_EFFECT_ENUM_NAME,
    ]) {
      expect(name.length).toBeLessThanOrEqual(63)
    }
  })

  it('offers the expo effect alongside slide and fade (#62)', () => {
    const effect = behaviourFields().find(
      (f): f is SelectField => 'name' in f && f.name === 'effect',
    ) as SelectField
    const values = (effect.options as { value: string }[]).map((o) => o.value)
    expect(values).toEqual(['slide', 'fade', 'expo'])
  })

  it('adds the three expo controls, each gated on effect === expo (#62 addendum)', () => {
    const fields = behaviourFields()
    const cond = (f: unknown) =>
      (f as { admin?: { condition?: (d: unknown, s: unknown) => boolean } })
        .admin?.condition

    const direction = fields.find(
      (f): f is SelectField => 'name' in f && f.name === 'direction',
    ) as SelectField
    expect(direction.type).toBe('select')
    expect(direction.enumName).toBe(CAROUSEL_DIRECTION_ENUM_NAME)
    expect(direction.defaultValue).toBe(DEFAULT_CAROUSEL_DIRECTION)
    expect(
      (direction.options as { value: string }[]).map((o) => o.value),
    ).toEqual(['horizontal', 'vertical'])

    const rotate = fields.find(
      (f) => 'name' in f && f.name === 'rotate',
    ) as Field & { type: string; min?: number; max?: number }
    expect(rotate.type).toBe('number')
    expect(rotate.min).toBe(0)
    expect(rotate.max).toBe(EXPO_MAX_ROTATE)

    const grayscale = fields.find(
      (f) => 'name' in f && f.name === 'grayscale',
    ) as Field & { type: string; defaultValue?: unknown }
    expect(grayscale.type).toBe('checkbox')
    expect(grayscale.defaultValue).toBe(true)

    // All three render only for expo, and vanish for slide/fade.
    for (const f of [direction, rotate, grayscale]) {
      const c = cond(f)
      expect(c).toBeTypeOf('function')
      expect(c!({}, { effect: 'expo' })).toBe(true)
      expect(c!({}, { effect: 'slide' })).toBe(false)
      expect(c!({}, {})).toBe(false)
    }
  })

  it('models slides as a non-empty array with a required image', () => {
    const slides = named(Carousel.fields, 'slides') as ArrayField
    expect(slides.type).toBe('array')
    expect(slides.minRows).toBe(1)

    const image = named(slides.fields, 'image') as Field & {
      type: string
      relationTo?: string
      required?: boolean
    }
    expect(image.type).toBe('upload')
    expect(image.relationTo).toBe('media')
    expect(image.required).toBe(true)
  })

  it('defaults autoplay OFF and navigation/pagination ON', () => {
    const fields = behaviourFields()
    const autoplay = fields.find(
      (f) => 'name' in f && f.name === 'autoplay',
    ) as Field & {
      defaultValue?: unknown
    }
    const navigation = fields.find(
      (f) => 'name' in f && f.name === 'navigation',
    ) as Field & {
      defaultValue?: unknown
    }
    const pagination = fields.find(
      (f) => 'name' in f && f.name === 'pagination',
    ) as Field & {
      defaultValue?: unknown
    }

    expect(autoplay.defaultValue).toBe(false)
    expect(navigation.defaultValue).toBe(true)
    expect(pagination.defaultValue).toBe(true)
  })

  it('shows the interval only when autoplay is on', () => {
    const interval = behaviourFields().find(
      (f) => 'name' in f && f.name === 'interval',
    ) as Field & { admin?: { condition?: (d: unknown, s: unknown) => boolean } }
    const condition = interval.admin?.condition
    expect(condition).toBeTypeOf('function')
    expect(condition!({}, { autoplay: true })).toBe(true)
    expect(condition!({}, { autoplay: false })).toBe(false)
  })
})
