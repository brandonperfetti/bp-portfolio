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
import { capturePublishedSlug } from '@/hooks/capturePublishedSlug'
import { createSlugRedirect } from '@/hooks/createSlugRedirect'
import { populateAuthors } from './hooks/populateAuthors'
import {
  deleteCorvusEmbeddings,
  refreshCorvusEmbeddings,
} from '@/hooks/corvusEmbeddings'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'
import { computePostPath, validatePostPlacement } from './hooks/postPlacement'
import { refusePlacedSlugRename } from './hooks/refusePlacedSlugRename'
import { ROOT_PAGE_SLUG } from '@/fields/slug/slugPaths'

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
    // `path` travels with every populated post read (#153) — without it a
    // `CMSLink` or a `relatedPosts` card resolves a placed post through
    // `publicPathFor` with no path in hand and silently links at
    // `/articles/<slug>`, which then 308s.
    path: true,
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
      // The whole document, not just its slug: a PLACED article previews at
      // `/work/brytecore`, which a slug alone cannot name (#153). A slug-only
      // call resolves to `/articles/<slug>`, and the article route then 308s
      // the previewer to the placed path — so the preview worked, but only by
      // riding a redirect, and the draft it wanted was never what it fetched.
      // Pages already passed the doc; this is Posts catching up now that a
      // post can carry a `path`.
      url: ({ data, req }) =>
        generatePreviewPath({
          doc: data,
          collection: 'posts',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        doc: data,
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
              // Admin label only — the field name and the `categories` slug
              // are unchanged (#149). Deliberately NO `admin.description`:
              // Payload emits a field description into `payload-types.ts` as a
              // TSDoc comment, and #149 is a zero-schema, zero-type change.
              // The caption is not worth a diff on a generated file.
              label: 'Topics',
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
    // Placement (#153). Both fields sit at the TOP LEVEL of the document, not
    // inside a tab — `parent` because that is where a relationship has to live
    // for a flat `select` to read it, and `path` because it carries a unique
    // index and a Postgres index cannot span a nested table. Mirrors the Pages
    // hierarchy fields exactly (#148); `position: 'sidebar'` is presentation
    // only.
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      // Published pages only, and never the site root: the root serves `/`, so
      // a post placed under it would take `/<slug>` — the top-level page
      // namespace — rather than a section URL. An unpublished parent would
      // compose a path that resolves to nothing until the parent ships.
      filterOptions: () => ({
        _status: { equals: 'published' },
        slug: { not_equals: ROOT_PAGE_SLUG },
      }),
      admin: {
        position: 'sidebar',
        description:
          'Optional. Place this article under a section page — the URL becomes that page’s path plus this article’s slug. Leave empty to keep it at /articles.',
      },
    },
    {
      name: 'path',
      type: 'text',
      index: true,
      unique: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Computed from the parent page and this article’s slug. Empty for an unplaced article, which is served at /articles.',
      },
    },
    ...slugField(),
  ],
  hooks: {
    // `validatePostPlacement` rejects an unservable placement before
    // `computePostPath` ever stores a path — the guard runs in
    // `beforeValidate`, the computation in `beforeChange`, so the stored `path`
    // is always one the guard has already accepted (#153).
    // `refusePlacedSlugRename` is a stop-gap that #150 deletes — it refuses a
    // slug rename on a placed, published article, whose redirect row would
    // otherwise be written with an `/articles` `from` and leave the section URL
    // 404ing. Its own file and its own TSDoc carry the argument both ways.
    beforeValidate: [validatePostPlacement, refusePlacedSlugRename],
    // `capturePublishedSlug` must run before the write: it reads the main-table
    // row, which is the only place the currently-served slug survives an
    // autosaved draft (see createSlugRedirect).
    beforeChange: [capturePublishedSlug, computePostPath],
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
