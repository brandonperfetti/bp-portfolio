import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { slugField } from '@/fields/slug'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'

/**
 * Article topics (the topic chips on /articles).
 *
 * @remarks **Labelled "Topic"/"Topics" in the admin; the slug stays
 * `categories` (#149).** The public surface has said "topics" for a long time
 * — the chips, the `?topic=` filter, `topics: string[]` on the read models —
 * and the admin was the last place still saying "Categories". `labels` closes
 * that gap for free: it is presentation only, so no table rename, no
 * reindex, and no churn on the `categories` MCP tool names agents call. See
 * `docs/PAYLOAD.md` §Collections for the full rationale.
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Topic',
    plural: 'Topics',
  },
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
