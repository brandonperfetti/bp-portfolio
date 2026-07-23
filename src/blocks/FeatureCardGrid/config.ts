import type { Block } from 'payload'

import { link } from '@/fields/link'

/**
 * Grid of feature cards (ported from the Brytecore block set, adapted to
 * this site's card language): optional icon, eyebrow, title, copy, and an
 * optional link per card. Simplified to plain text/textarea fields — the
 * Brytecore original nests rich text, which is overkill for card copy.
 */
export const FeatureCardGrid: Block = {
  slug: 'featureCardGrid',
  interfaceName: 'FeatureCardGridBlock',
  labels: {
    singular: 'Feature Card Grid',
    plural: 'Feature Card Grids',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      admin: {
        description: 'Optional section heading rendered above the grid.',
      },
    },
    {
      name: 'intro',
      type: 'textarea',
      admin: {
        description: 'Optional intro line under the heading.',
      },
    },
    {
      name: 'cards',
      type: 'array',
      minRows: 1,
      maxRows: 6,
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'icon',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description: 'Optional icon (~96px square, SVG/PNG).',
          },
        },
        {
          name: 'eyebrow',
          type: 'text',
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'copy',
          type: 'textarea',
        },
        {
          name: 'enableLink',
          type: 'checkbox',
        },
        link({
          overrides: {
            admin: {
              condition: (_data, siblingData) =>
                Boolean(siblingData?.enableLink),
            },
          },
        }),
      ],
    },
  ],
}
