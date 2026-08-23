import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'

/** Gear/software entries for /uses, grouped by category. */
export const Uses: CollectionConfig = {
  slug: 'uses',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'category'],
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Workstation', value: 'workstation' },
        { label: 'Development tools', value: 'development' },
        { label: 'Design', value: 'design' },
        { label: 'Podcasts', value: 'podcasts' },
        { label: 'Productivity', value: 'productivity' },
        { label: 'AI', value: 'ai' },
      ],
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'link',
      type: 'text',
    },
    {
      name: 'tech',
      type: 'relationship',
      admin: {
        description: 'Optional link into the tech stack for the shared viz.',
      },
      relationTo: 'tech-stack',
    },
    {
      name: 'sortOrder',
      type: 'number',
      admin: {
        description: 'Lower numbers sort first within each /uses section.',
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    afterChange: [revalidateCollectionTag('uses', ['/uses'])],
    afterDelete: [revalidateCollectionTagDelete('uses', ['/uses'])],
  },
  defaultSort: 'sortOrder',
}
