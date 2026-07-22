import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

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
      options: [
        { label: 'Language', value: 'language' },
        { label: 'Framework', value: 'framework' },
        { label: 'Library', value: 'library' },
        { label: 'Tooling', value: 'tooling' },
        { label: 'Platform', value: 'platform' },
        { label: 'Database', value: 'database' },
        { label: 'AI', value: 'ai' },
        { label: 'Design', value: 'design' },
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
        description: 'owner/name — enables live GitHub signals on /tech.',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
