import type { Block, SelectField } from 'payload'

/** The two ways the Testimonials block can present its items. */
export const TESTIMONIALS_LAYOUTS = [
  { label: 'Grid', value: 'grid' },
  { label: 'Carousel', value: 'carousel' },
] as const

/** Testimonials layout vocabulary, derived from {@link TESTIMONIALS_LAYOUTS}. */
export type TestimonialsLayout = (typeof TESTIMONIALS_LAYOUTS)[number]['value']

/** The layout a Testimonials block uses when nothing says otherwise. */
export const DEFAULT_TESTIMONIALS_LAYOUT: TestimonialsLayout = 'grid'

/**
 * Postgres enum backing the `layout` select. Named explicitly because the
 * block is column-eligible, so it nests three levels deep inside a column
 * (`pages.layout` → `container` → `column` → here), where the generated
 * identifier crowds Postgres's 63-character limit and would change the moment
 * the block moves (the same scar the Carousel enums name around).
 */
export const TESTIMONIALS_LAYOUT_ENUM_NAME = 'enum_testimonials_layout'

/** Select options for the `layout` field, derived from {@link TESTIMONIALS_LAYOUTS}. */
export const TESTIMONIALS_LAYOUT_OPTIONS: {
  label: string
  value: TestimonialsLayout
}[] = TESTIMONIALS_LAYOUTS.map(({ label, value }) => ({ label, value }))

/**
 * Build the shared `layout` select field.
 *
 * @returns A Payload select on {@link TESTIMONIALS_LAYOUT_ENUM_NAME}, defaulting
 * to {@link DEFAULT_TESTIMONIALS_LAYOUT}. A factory so config and tests read one
 * shape (mirrors the Carousel field factories).
 *
 * @remarks Deliberately *not* `required`: an absent value is well-defined here
 * — the Component treats missing/`null` as `grid` — so leaving it optional keeps
 * the generated type nullable (matching the additive, nullable-with-default
 * migration column) and every existing `TestimonialsBlock` fixture valid without
 * a forced edit, while the `defaultValue` still lands new blocks on `grid`.
 */
export function testimonialsLayoutField(): SelectField {
  return {
    name: 'layout',
    type: 'select',
    defaultValue: DEFAULT_TESTIMONIALS_LAYOUT,
    enumName: TESTIMONIALS_LAYOUT_ENUM_NAME,
    options: [...TESTIMONIALS_LAYOUT_OPTIONS],
    admin: {
      description:
        'Grid lays the testimonials out as a responsive card grid; Carousel shows the same cards as a swipeable stacked-cards deck (autoplay off, reduced-motion safe).',
    },
  }
}

/** Testimonial cards (ported from the Brytecore block set, simplified). */
export const Testimonials: Block = {
  slug: 'testimonials',
  interfaceName: 'TestimonialsBlock',
  imageURL: '/images/cms/testimonials.svg',
  imageAltText: 'Line-art preview of the Testimonials block',
  labels: { singular: 'Testimonials', plural: 'Testimonials' },
  fields: [
    testimonialsLayoutField(),
    {
      name: 'heading',
      type: 'text',
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 6,
      labels: { singular: 'Testimonial', plural: 'Testimonials' },
      admin: { initCollapsed: true },
      fields: [
        { name: 'quote', type: 'textarea', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'role', type: 'text' },
        { name: 'avatar', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
