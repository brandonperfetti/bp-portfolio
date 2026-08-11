import type { Block } from 'payload'

/** Metric band: 2-4 large stats with labels (universal marketing block). */
export const Stats: Block = {
  slug: 'stats',
  interfaceName: 'StatsBlock',
  imageURL: '/images/cms/stats.svg',
  imageAltText: 'Line-art preview of the Stats block',
  labels: { singular: 'Stats Band', plural: 'Stats Bands' },
  fields: [
    {
      name: 'items',
      type: 'array',
      minRows: 2,
      maxRows: 4,
      labels: { singular: 'Stat', plural: 'Stats' },
      fields: [
        {
          name: 'value',
          type: 'text',
          required: true,
          admin: { description: 'e.g. "120+", "99.9%", "12 yrs"' },
        },
        { name: 'label', type: 'text', required: true },
      ],
    },
  ],
}
