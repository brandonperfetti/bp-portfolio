import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

/**
 * Résumé entries for the home-page Work block.
 *
 * @remarks Sourced from the Notion planning DB by the one-time seed
 * (`scripts/seed-cms-from-notion.ts`); edited here from then on. The
 * home page falls back to a hard-coded list while this collection is empty.
 */
export const WorkHistory: CollectionConfig = {
  slug: 'work-history',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['company', 'title', 'startDate', 'current'],
    useAsTitle: 'company',
  },
  fields: [
    {
      name: 'company',
      type: 'text',
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'startDate',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'endDate',
      type: 'date',
      admin: {
        description: 'Leave empty for a current role.',
        position: 'sidebar',
      },
    },
    {
      name: 'current',
      type: 'checkbox',
      admin: {
        position: 'sidebar',
      },
      defaultValue: false,
    },
    {
      name: 'sortOrder',
      type: 'number',
      admin: {
        description: 'Lower numbers sort first (most recent role on top).',
        position: 'sidebar',
      },
    },
  ],
  defaultSort: 'sortOrder',
}
