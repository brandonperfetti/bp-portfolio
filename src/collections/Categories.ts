import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { slugField } from '@/fields/slug'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'

/** Article categories (topic chips on /articles). */
export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    ...slugField(),
  ],
  // Category/Tag titles render out of the posts cache (article topics) —
  // without these, a rename stays stale until an unrelated post edit
  // (fresh-eyes review 2026-08, m1).
  hooks: {
    afterChange: [revalidateCollectionTag('posts', ['/articles'])],
    afterDelete: [revalidateCollectionTagDelete('posts', ['/articles'])],
  },
}
