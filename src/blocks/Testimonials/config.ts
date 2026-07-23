import type { Block } from 'payload'

/** Testimonial cards (ported from the Brytecore block set, simplified). */
export const Testimonials: Block = {
  slug: 'testimonials',
  interfaceName: 'TestimonialsBlock',
  labels: { singular: 'Testimonials', plural: 'Testimonials' },
  fields: [
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
