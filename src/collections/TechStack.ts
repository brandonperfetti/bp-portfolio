import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'

/**
 * Technologies powering the interactive /tech + /uses visualization.
 *
 * @remarks `githubRepo` (owner/name) feeds the live GitHub signals ported
 * from v3 `techSignals.ts` in Phase 6.
 */
export const TechStack: CollectionConfig = {
  slug: 'tech-stack',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'category', 'proficiency'],
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      // Mirrors the Notion planning taxonomy the content was authored in.
      options: [
        { label: 'Frontend', value: 'frontend' },
        { label: 'Framework', value: 'framework' },
        { label: 'Backend', value: 'backend' },
        { label: 'Testing', value: 'testing' },
        { label: 'Data', value: 'data' },
        { label: 'Tooling', value: 'tooling' },
        { label: 'AI', value: 'ai' },
      ],
      required: true,
    },
    {
      name: 'icon',
      type: 'text',
      admin: {
        description: 'Lucide icon name; leave empty to use the uploaded logo.',
      },
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'proficiency',
      type: 'select',
      options: [
        { label: 'Daily driver', value: 'daily' },
        { label: 'Proficient', value: 'proficient' },
        { label: 'Familiar', value: 'familiar' },
        { label: 'Exploring', value: 'exploring' },
      ],
    },
    {
      name: 'url',
      type: 'text',
    },
    {
      name: 'githubRepo',
      type: 'text',
      admin: {
        description:
          'Optional single repo hint as owner/name (e.g. "vercel/next.js") — ' +
          'NOT a profile URL. The /tech activity badges come from an ' +
          'account-wide scan of the GITHUB_OWNER account; this field is only ' +
          'a fallback to match this entry to scan results when its display ' +
          'name differs from the package/topic name.',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
    {
      name: 'featured',
      type: 'checkbox',
      admin: {
        position: 'sidebar',
      },
      defaultValue: false,
    },
    {
      name: 'sortOrder',
      type: 'number',
      admin: {
        description: 'Lower numbers sort first on /tech.',
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    afterChange: [revalidateCollectionTag('tech-stack', ['/tech'])],
    afterDelete: [revalidateCollectionTagDelete('tech-stack', ['/tech'])],
  },
  defaultSort: 'sortOrder',
}
