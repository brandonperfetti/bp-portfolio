import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

/**
 * Person identity: JSON-LD Person schema fields plus the downloadable CV.
 *
 * @remarks Read via `getCmsIdentity` (identityRepo) — feeds
 * `buildPersonSchema` in the SEO layer and the Resume card's Download CV
 * button. Hard-coded `src/lib/identity.ts` constants remain the fallback
 * while fields here are empty.
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
      name: 'resume',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description:
          'CV file (PDF) served by the “Download CV” button on the home-page Work card. Upload a fresh copy here whenever the resume changes — no deploy needed.',
      },
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
