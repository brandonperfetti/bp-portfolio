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

/**
 * Résumé entries for the home-page Work block.
 *
 * @remarks Sourced from the Notion planning DB by the one-time seed
 * (`scripts/seed-cms-from-notion.ts`); edited here from then on. The
 * home page falls back to a hard-coded list while this collection is empty.
 *
 * ## The slug is an addressing key, not a route (#137)
 *
 * `work-history` is **not** in `SLUG_ROUTED_COLLECTIONS`: no route resolves a
 * work-history row, and adding one is explicitly out of scope — the narrative
 * for a role is a **Page** under `/work`, and this collection stays the
 * structured facts behind it (Brandon, 2026-08-30). The slug exists for two
 * consumers that need to name a role without holding its numeric id:
 *
 * 1. **Corvus.** `sourceUrlFor('work-history', slug)` composes `/work/<slug>`
 *    so a work-history chunk cites the role's section page instead of the
 *    near-uncitable `/` it cited before (`src/lib/ai/chunking.ts`).
 * 2. **The editor.** The `workHistoryCard` block's `entry` relationship and the
 *    role Page it sits on agree by convention on one spelling, so a page at
 *    `work/brytecore` and the row it renders are obviously the same thing.
 *
 * Because nothing routes on it, `enforceSlugFreeze` is inert here (it keys on
 * `isSlugRoutedCollection`) — the shared field's own description says as much.
 * `unique: true` is what makes the slug a dependable key for (1): two rows
 * spelling themselves `brytecore` would make the composed citation ambiguous.
 * Derived from `company` rather than `title`, since the company is what the
 * URL segment reads as.
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
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'MMM d, yyyy',
        },
        position: 'sidebar',
      },
    },
    {
      name: 'endDate',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'MMM d, yyyy',
        },
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
    ...slugField('company', {
      slugOverrides: {
        unique: true,
        admin: {
          description:
            'Addressing key, not a URL: Corvus cites this role at /work/<slug>, and the role’s Page under /work should use the same spelling. Derived from the company name.',
        },
      },
    }),
    {
      name: 'sortOrder',
      type: 'number',
      admin: {
        description: 'Lower numbers sort first (most recent role on top).',
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    afterChange: [
      revalidateCollectionTag('work-history', ['/']),
      refreshCorvusEmbeddings('work-history'),
    ],
    afterDelete: [
      revalidateCollectionTagDelete('work-history', ['/']),
      deleteCorvusEmbeddings('work-history'),
    ],
  },
  defaultSort: 'sortOrder',
}
