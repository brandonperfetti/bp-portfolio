import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { slugField } from '@/fields/slug'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'
import {
  deleteCorvusEmbeddings,
  refreshCorvusEmbeddings,
} from '@/hooks/corvusEmbeddings'

/** Portfolio projects shown on /projects. */
export const Projects: CollectionConfig = {
  slug: 'projects',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'year', 'featured'],
    useAsTitle: 'title',
  },
  fields: [
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
      name: 'link',
      type: 'text',
      admin: {
        description: 'External URL (live site, repo, or case study).',
      },
    },
    {
      name: 'linkLabel',
      type: 'text',
      admin: {
        description: 'Display label for the link (defaults to the hostname).',
      },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'tech',
      type: 'relationship',
      hasMany: true,
      relationTo: 'tech-stack',
    },
    {
      name: 'featured',
      type: 'checkbox',
      admin: {
        position: 'sidebar',
      },
      defaultValue: false,
    },
    {
      name: 'year',
      type: 'number',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sortOrder',
      type: 'number',
      admin: {
        description: 'Lower numbers sort first on /projects.',
        position: 'sidebar',
      },
    },
    ...slugField(),
  ],
  hooks: {
    afterChange: [
      revalidateCollectionTag('projects', ['/projects']),
      refreshCorvusEmbeddings('projects'),
    ],
    afterDelete: [
      revalidateCollectionTagDelete('projects', ['/projects']),
      deleteCorvusEmbeddings('projects'),
    ],
  },
  defaultSort: 'sortOrder',
}
