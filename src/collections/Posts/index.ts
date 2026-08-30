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
import { SHARE_TARGET_OPTIONS } from '@/globals/SiteSettings'
import { Banner } from '@/blocks/Banner/config'
import { Code } from '@/blocks/Code/config'
import { MediaBlock } from '@/blocks/MediaBlock/config'
import { generatePreviewPath } from '@/utilities/generatePreviewPath'
import { createSlugRedirect } from '@/hooks/createSlugRedirect'
import { populateAuthors } from './hooks/populateAuthors'
import {
  deleteCorvusEmbeddings,
  refreshCorvusEmbeddings,
} from '@/hooks/corvusEmbeddings'
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
    // Post-actions overrides (Batch 1 / T1, #51): flat top-level fields — a
    // `name`-less collapsible keeps them un-prefixed (the SEO tab is
    // `name: 'meta'`, which would nest them under `meta_*`). Each per-entry
    // select carries an explicit `enumName` unique to this collection.
    {
      type: 'collapsible',
      label: 'Post actions',
      admin: {
        initCollapsed: true,
        description:
          'Per-entry share/OG overrides on top of the site defaults.',
      },
      fields: [
        {
          name: 'disableSharing',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Hide the Share control on this entry (kill switch).',
          },
        },
        {
          name: 'shareTargetsAdd',
          type: 'select',
          hasMany: true,
          enumName: 'enum_posts_share_targets_add',
          options: [...SHARE_TARGET_OPTIONS],
          admin: {
            description:
              'Force-enable these targets on top of the site default.',
          },
        },
        {
          name: 'shareTargetsRemove',
          type: 'select',
          hasMany: true,
          enumName: 'enum_posts_share_targets_remove',
          options: [...SHARE_TARGET_OPTIONS],
          admin: {
            description: 'Force-remove these targets from the site default.',
          },
        },
        {
          name: 'ogImageMode',
          type: 'select',
          defaultValue: 'auto',
          enumName: 'enum_posts_og_image_mode',
          options: [
            {
              label: 'Auto (follow the global generated-OG toggle)',
              value: 'auto',
            },
            {
              label: "Bespoke (always this entry's own image)",
              value: 'bespoke',
            },
            {
              label: 'Generated (always a generated card)',
              value: 'generated',
            },
          ],
          admin: {
            description:
              'auto = follow the global generated-OG toggle · bespoke = always this entry’s own image · generated = always a generated card.',
          },
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
      // Re-pointed users → authors (W5B1, #25): bylines now carry a public,
      // per-author name/role/avatar/socials, and a guest author is addable
      // without a Payload admin account. The migration seeds one Author from
      // the site-owner identity and repoints existing relationships so every
      // published post keeps its `Brandon Perfetti` byline.
      relationTo: 'authors',
    },
    // Populated via `populateAuthors`. Kept as the admin-hidden {id,name}
    // fallback surface; the rich byline (role/avatar/socials) is resolved
    // from the populated `authors` relation in articlesRepo (authors are
    // publicly readable, so anonymous reads populate them directly).
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
    afterChange: [
      revalidatePost,
      createSlugRedirect,
      refreshCorvusEmbeddings('posts'),
    ],
    afterRead: [populateAuthors],
    afterDelete: [revalidateDelete, deleteCorvusEmbeddings('posts')],
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
