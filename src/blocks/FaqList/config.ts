import type { Block } from 'payload'

import { defaultLexical } from '@/fields/defaultLexical'

/**
 * FAQ accordion (ported from the Brytecore block set). Renders native
 * disclosure elements plus FAQPage JSON-LD for rich results.
 */
export const FaqList: Block = {
  slug: 'faqList',
  interfaceName: 'FaqListBlock',
  imageURL: '/images/cms/faq-list.svg',
  imageAltText: 'Line-art preview of the FAQ List block',
  labels: { singular: 'FAQ List', plural: 'FAQ Lists' },
  fields: [
    {
      name: 'heading',
      type: 'text',
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      labels: { singular: 'Question', plural: 'Questions' },
      admin: { initCollapsed: true },
      fields: [
        { name: 'question', type: 'text', required: true },
        {
          name: 'answer',
          type: 'richText',
          editor: defaultLexical,
          required: true,
        },
      ],
    },
  ],
}
