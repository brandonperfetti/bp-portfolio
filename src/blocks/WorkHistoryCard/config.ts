import type { Block } from 'payload'

/**
 * The home-page Work card (work-history collection + CV download),
 * placeable on any page.
 */
export const WorkHistoryCard: Block = {
  slug: 'workHistoryCard',
  interfaceName: 'WorkHistoryCardBlock',
  labels: { singular: 'Work History Card', plural: 'Work History Cards' },
  fields: [
    {
      name: 'note',
      type: 'text',
      admin: {
        description: 'No configuration needed — renders the work-history card.',
        readOnly: true,
      },
    },
  ],
}
