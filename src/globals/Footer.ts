import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

/**
 * Footer navigation + copyright line.
 *
 * @remarks
 * No `afterChange` revalidation hook (#104): the footer is rendered from the
 * static nav fallback (`src/components/Footer.tsx` → `PRIMARY_NAV_LINKS`) and
 * this global is not read through any cached reader, so nothing caches under a
 * `global_footer` tag. The previous `revalidateGlobal('footer')` hook purged a
 * tag no reader subscribed to (a dead purge, and `CMS_TAGS` has no `footer`
 * entry). If the footer is ever wired to a cached reader, add
 * `CMS_TAGS.footer = 'global_footer'`, cache the reader under it, and restore
 * the hook.
 */
export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'links',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
      ],
    },
    {
      name: 'copyrightName',
      type: 'text',
      defaultValue: 'Brandon Perfetti',
    },
  ],
}
