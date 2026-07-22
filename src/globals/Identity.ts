import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

/**
 * Person schema fields for JSON-LD (ported from v3 `src/lib/identity.ts`).
 *
 * @remarks Feeds `buildPersonSchema` in the SEO layer (Phase 2). The avatar
 * moves from Cloudinary to a Media upload during migration.
 */
export const Identity: GlobalConfig = {
  slug: 'identity',
  access: {
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      defaultValue: 'Brandon Perfetti',
      required: true,
    },
    {
      name: 'jobTitle',
      type: 'text',
      defaultValue: 'Technical PM + Software Engineer',
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'sameAs',
      type: 'array',
      admin: {
        description: 'Social profile URLs for the Person schema sameAs list.',
      },
      fields: [{ name: 'url', type: 'text', required: true }],
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal('identity')],
  },
}
