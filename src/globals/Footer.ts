import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

/**
 * Footer-only links + copyright line.
 *
 * @remarks
 * `links` is read by `getCmsFooterLinks` (`src/lib/cms/footerRepo.ts`), cached
 * under `CMS_TAGS.footer` (`global_footer`), and rendered by the site footer
 * after the header navigation items (#363). The `afterChange` hook purges that
 * tag, so a saved link shows without a deploy.
 *
 * History: #104 removed this hook when nothing read the global, because it
 * purged a tag no reader subscribed to. #363 added the reader and restored
 * it; the two belong together, and `Footer.test.ts` and `cacheTags.test.ts`
 * pin that the hook purges the tag the reader caches under.
 *
 * `copyrightName` is still read by nothing: the footer's copyright line is
 * hard-coded in `src/components/Footer.tsx`.
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
  hooks: {
    afterChange: [revalidateGlobal('footer')],
  },
}
