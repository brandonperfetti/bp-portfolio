import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

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
        { name: 'description', type: 'textarea' },
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
  ],
  hooks: {
    afterChange: [revalidateGlobal('site-settings')],
  },
}
