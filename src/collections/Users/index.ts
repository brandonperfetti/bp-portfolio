import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

/**
 * Payload admin users (CMS staff). Auth-enabled collection guarding `/admin`.
 *
 * @remarks Distinct from end-user (Clerk) identity — Clerk users never get
 * Payload accounts. Keep this collection minimal.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
  timestamps: true,
}
