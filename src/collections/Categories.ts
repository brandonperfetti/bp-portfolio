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
 *
 * ## `sectionPage` — a topic's optional home (#151)
 *
 * A topic that has grown into a real section can point at the Page that is its
 * home; article chips for it then link there instead of at
 * `/articles?topic=<title>`. **Opt-in by design**: a topic without one stays a
 * pure filter and costs nothing — no shell pages, no forced 1:1 between topics
 * and pages (#136 Direction extended, item 5).
 *
 * The relationship is resolved to an href in `articlesRepo`
 * (`resolveTopicHref`), never here, and an unpublished or deleted target falls
 * back to the filtered view rather than linking at a 404.
 *
 * **Schema note: this field creates no join table, and therefore owes no new
 * RLS line.** #151 and the #136 spike (§7.1) both expected the opposite —
 * that adding the first relationship to Categories would create
 * `categories_rels` and require
 * `ALTER TABLE "categories_rels" ENABLE ROW LEVEL SECURITY;` in the same
 * migration. Measured against a database migrated to this schema, it does not.
 * Payload's Postgres adapter materialises a `_rels` table only for a
 * relationship that is `hasMany` or polymorphic (`relationTo` an array) — the
 * shapes a single column cannot express. `sectionPage` is `hasMany: false`
 * against one collection, so it lands as `categories.section_page_id` with an
 * index, exactly like every other 1:1 relationship in this schema.
 *
 * `categories` pre-dates the #72 lockdown and already carries RLS; adding a
 * column cannot weaken that, because RLS is a table property rather than a
 * column one. The convention itself is untouched: the next `hasMany` or
 * polymorphic relationship on this collection **does** create `categories_rels`
 * and **does** owe the line in its own migration (docs/PAYLOAD.md §"New-table
 * RLS convention (#72)"; gated by `scripts/check-migrations-rls.mjs`).
 * Categories has no drafts, so even then there would be no
 * `_categories_v_rels` companion.
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
    {
      name: 'sectionPage',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description:
          'Optional. When set, this topic’s chips on an article link to this page instead of a filtered /articles view. The filter chips on /articles are unaffected — they never navigate.',
      },
    },
  ],
  // Category/Tag titles render out of the posts cache (article topics) —
  // without these, a rename stays stale until an unrelated post edit
  // (fresh-eyes review 2026-08, m1).
  hooks: {
    afterChange: [revalidateCollectionTag('posts', ['/articles'])],
    afterDelete: [revalidateCollectionTagDelete('posts', ['/articles'])],
  },
}
