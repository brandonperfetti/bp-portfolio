import type { CollectionConfig } from 'payload'

import {
  BlockquoteFeature,
  BlocksFeature,
  ChecklistFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  IndentFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  lexicalEditor,
  OrderedListFeature,
  UnorderedListFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

import { authenticated } from '@/access/authenticated'
import { slugField } from '@/fields/slug'
import { authenticatedOrPublished } from '@/access/authenticatedOrPublished'
import { accessGroup } from '@/fields/accessGroup'
import { pageBuilderBlocks } from '@/blocks/library'
import { Banner } from '@/blocks/Banner/config'
import { Code } from '@/blocks/Code/config'
import { MediaBlock } from '@/blocks/MediaBlock/config'
import { generatePreviewPath } from '@/utilities/generatePreviewPath'
import { populateAuthors } from './hooks/populateAuthors'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'

/**
 * Articles (v3 `/articles/[slug]` URL surface, slugs preserved on migration).
 *
 * @remarks Drafts + versions + autosave enabled; publishing is just a status
 * flip and `revalidatePost` refreshes ISR pages/tags. The `access` group is
 * the server-side gating model (§12) — bodies of gated posts must never reach
 * anonymous clients.
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
    categories: true,
    access: true,
    meta: {
      image: true,
      description: true,
    },
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'posts',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'posts',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'excerpt',
              type: 'textarea',
              admin: {
                description:
                  'Short summary used on cards, RSS, and meta description fallback.',
              },
            },
            {
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
            },
            {
              name: 'content',
              type: 'richText',
              // Field-level gate (§12): without this, the public Payload
              // REST/GraphQL surface returned gated bodies to anonymous
              // callers — the app-layer canAccess() gate sits ABOVE Payload
              // and never saw those requests (fresh-eyes review 2026-08,
              // finding B2). Anonymous reads of gated posts now omit
              // `content`; entitled Clerk viewers get bodies via the
              // trusted refetch in the content layer (getGatedPostContent).
              access: {
                read: ({ req: { user }, doc }) =>
                  Boolean(user) ||
                  (doc?.access?.visibility ?? 'public') !== 'gated',
              },
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    HeadingFeature({
                      enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'],
                    }),
                    BlocksFeature({ blocks: [Banner, Code, MediaBlock] }),
                    FixedToolbarFeature(),
                    InlineToolbarFeature(),
                    HorizontalRuleFeature(),
                    // Node types the Notion migration emits — without these
                    // registered, parseEditorState throws Lexical #17 ("type
                    // 'list' not found") and the editor error-boundaries on
                    // every migrated article.
                    UnorderedListFeature(),
                    OrderedListFeature(),
                    ChecklistFeature(),
                    BlockquoteFeature(),
                    UploadFeature(),
                    InlineCodeFeature(),
                    IndentFeature(),
                  ]
                },
              }),
              label: false,
              required: true,
            },
            {
              name: 'layout',
              type: 'blocks',
              blocks: pageBuilderBlocks,
              label: 'Below-article blocks',
              admin: {
                initCollapsed: true,
                description:
                  'Optional page-builder sections rendered after the article body — CTA, newsletter signup, FAQ, related sections, and so on.',
              },
            },
          ],
          label: 'Content',
        },
        {
          fields: [
            {
              name: 'relatedPosts',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              filterOptions: ({ id }) => {
                return {
                  id: {
                    not_in: [id],
                  },
                }
              },
              hasMany: true,
              relationTo: 'posts',
            },
            {
              name: 'categories',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              hasMany: true,
              relationTo: 'categories',
            },
            {
              name: 'tags',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              hasMany: true,
              relationTo: 'tags',
            },
          ],
          label: 'Meta',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      hasMany: true,
      relationTo: 'users',
    },
    // Populated via `populateAuthors` (users collection is access-locked).
    {
      name: 'populatedAuthors',
      type: 'array',
      access: {
        update: () => false,
      },
      admin: {
        disabled: true,
        readOnly: true,
      },
      fields: [
        {
          name: 'id',
          type: 'text',
        },
        {
          name: 'name',
          type: 'text',
        },
      ],
    },
    accessGroup,
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePost],
    afterRead: [populateAuthors],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100,
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
