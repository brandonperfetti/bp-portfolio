import type { Block } from 'payload'

import { cardChromeFields } from '@/blocks/cardChrome'

/**
 * The home-page Work card (work-history collection + CV download),
 * placeable on any page, with the optional heading + intro every zero-config
 * card gained in #40.
 *
 * @remarks `note` is hidden rather than removed — see `ContactForm/config.ts`
 * for the reasoning (additive-only schema until the Home/About flip).
 */
export const WorkHistoryCard: Block = {
  slug: 'workHistoryCard',
  interfaceName: 'WorkHistoryCardBlock',
  imageURL: '/images/cms/work-history-card.svg',
  imageAltText: 'Line-art preview of the Work History Card block',
  labels: { singular: 'Work History Card', plural: 'Work History Cards' },
  fields: [
    ...cardChromeFields(),
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'Retired placeholder — the work-history card itself needs no configuration.',
        readOnly: true,
        hidden: true,
      },
    },
  ],
}
