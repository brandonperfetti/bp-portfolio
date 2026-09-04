import type { CollectionConfig } from 'payload'

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
import { pageBuilderBlocks } from '@/blocks/library'
import { SHARE_TARGET_OPTIONS } from '@/globals/SiteSettings'
import { hero } from '@/heros/config'
import { capturePublishedSlug } from '@/hooks/capturePublishedSlug'
import { createSlugRedirect } from '@/hooks/createSlugRedirect'
import { populatePublishedAt } from '@/hooks/populatePublishedAt'
import { generatePreviewPath } from '@/utilities/generatePreviewPath'
import { computePagePath, validatePageHierarchy } from './hooks/pageHierarchy'
import { refuseNestedSlugRename } from './hooks/refuseNestedSlugRename'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

/**
 * Layout-builder pages — how Brandon adds/removes site sections on the fly.
 *
 * @remarks Hero supports `shader` (shaders.com preset background, Phase 6
 * component); `layout` is a blocks array dispatched by `RenderBlocks`.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      // The whole document, not just its slug: a placed page previews at
      // `/work/brytecore`, which a slug alone cannot name (#148).
      url: ({ data, req }) =>
        generatePreviewPath({
          doc: data,
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        doc: data,
        collection: 'pages',
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
      name: 'subtitle',
      type: 'textarea',
      admin: {
        description: 'Page intro line under the headline (distinct from SEO).',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [hero],
          label: 'Hero',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: pageBuilderBlocks,
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
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
          enumName: 'enum_pages_share_targets_add',
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
          enumName: 'enum_pages_share_targets_remove',
          options: [...SHARE_TARGET_OPTIONS],
          admin: {
            description: 'Force-remove these targets from the site default.',
          },
        },
        {
          name: 'ogImageMode',
          type: 'select',
          defaultValue: 'auto',
          enumName: 'enum_pages_og_image_mode',
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
        position: 'sidebar',
      },
    },
    // Hierarchy (#148). Both fields sit at the TOP LEVEL of the document, not
    // inside a group/tab — `parent` because that is where a relationship has to
    // live for the ancestor walk to read it with a flat `select`, and `path`
    // because it carries a unique index and a Postgres index cannot span a
    // nested table. `position: 'sidebar'` is presentation only; these are
    // top-level fields either way.
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description:
          'Place this page under another one. The URL becomes the parent’s path plus this page’s slug — at most 3 levels deep. Leave empty for a top-level page.',
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
          'Computed from the parent chain and this page’s slug. The `[...segments]` route resolves on it.',
      },
    },
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePage, createSlugRedirect],
    // `validatePageHierarchy` rejects an unservable placement before
    // `computePagePath` ever stores a path — the guard runs in `beforeValidate`,
    // the computation in `beforeChange`, so the stored `path` is always one the
    // guard has already accepted.
    // `refuseNestedSlugRename` is a stop-gap that #150 deletes — it refuses a
    // slug rename on a nested, published page, whose redirect row would
    // otherwise be written with a top-level `from` and leave the old nested URL
    // 404ing. Its own file and its own TSDoc carry the argument both ways.
    beforeValidate: [validatePageHierarchy, refuseNestedSlugRename],
    beforeChange: [populatePublishedAt, capturePublishedSlug, computePagePath],
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
