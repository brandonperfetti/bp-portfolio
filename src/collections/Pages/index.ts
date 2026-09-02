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
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
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
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePage, createSlugRedirect],
    beforeChange: [populatePublishedAt, capturePublishedSlug],
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
