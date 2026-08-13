import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

/**
 * The share destinations the post-actions feature knows how to render. Pinned
 * ids — T2 builds its share module against exactly these values, and every
 * per-entry add/remove select and the global enable list draw from the same
 * vocabulary. `copylink` is the floor: the Copy-link action is always offered.
 */
export const SHARE_TARGET_OPTIONS = [
  { label: 'X', value: 'x' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Reddit', value: 'reddit' },
  { label: 'Hacker News', value: 'hackernews' },
  { label: 'Email', value: 'email' },
  { label: 'Copy link', value: 'copylink' },
] as const

/** The bare `value` ids of {@link SHARE_TARGET_OPTIONS}, in pinned order. */
export const SHARE_TARGET_IDS = SHARE_TARGET_OPTIONS.map(
  (option) => option.value,
)

/** Site-wide settings: name, canonical URL, default SEO/OG, social links. */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: {
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      defaultValue: 'Brandon Perfetti',
      required: true,
    },
    {
      name: 'canonicalUrl',
      type: 'text',
      admin: {
        description:
          'Canonical origin (e.g. https://brandonperfetti.com). Falls back to NEXT_PUBLIC_SITE_URL.',
      },
    },
    {
      name: 'defaultSeo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'description',
          type: 'textarea',
          admin: {
            description:
              'Default meta description. Empty → the built-in site description.',
          },
        },
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
      ],
    },
    {
      name: 'socialLinks',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
      ],
    },
    // Post-actions (Batch 1 / T1, #51): global toggles for the Copy-page and
    // Share controls plus the generated-OG master switch. Flat top-level fields
    // (a UI-only collapsible for admin tidiness) — a `group` would prefix the
    // Postgres column names, which the reader/T2 module does not expect.
    {
      type: 'collapsible',
      label: 'Post actions',
      admin: {
        initCollapsed: true,
        description:
          'Copy-page, Share, and generated-OG defaults for articles and pages.',
      },
      fields: [
        {
          name: 'copyPageEnabled',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description: 'Show the Copy-page button on articles.',
          },
        },
        {
          name: 'copyPageLabel',
          type: 'text',
          admin: {
            description: 'Button label. Empty → "Copy page".',
          },
        },
        {
          name: 'shareTargets',
          type: 'select',
          hasMany: true,
          enumName: 'enum_site_settings_share_targets',
          options: [...SHARE_TARGET_OPTIONS],
          defaultValue: [...SHARE_TARGET_IDS],
          admin: {
            description:
              'Globally enabled share destinations (desktop modal). Copy-link is the floor.',
          },
        },
        {
          name: 'generatedOgEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Global toggle for dynamic generated OG title-cards (T7).',
          },
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal('site-settings')],
  },
}
