import type { Block } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { linkGroup } from '../../fields/linkGroup'

/**
 * Marketing CTA band: short rich-text pitch plus up to two link buttons.
 * Capped at two links deliberately — a CTA with more choices stops being a
 * call to a single action.
 */
export const CallToAction: Block = {
  slug: 'cta',
  interfaceName: 'CallToActionBlock',
  imageURL: '/images/cms/call-to-action.svg',
  imageAltText: 'Line-art preview of the Call to Action block',
  fields: [
    {
      name: 'richText',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [
            ...rootFeatures,
            HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ]
        },
      }),
      label: false,
    },
    linkGroup({
      appearances: ['default', 'outline'],
      overrides: {
        maxRows: 2,
      },
    }),
  ],
  labels: {
    plural: 'Calls to Action',
    singular: 'Call to Action',
  },
}
