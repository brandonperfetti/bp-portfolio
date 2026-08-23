import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { slugField } from '@/fields/slug'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'

/**
 * Post authors — public byline identities (name, role, avatar, bio, socials).
 *
 * @remarks Deliberately a dedicated collection, NOT a fattened `users`
 * (locked 2026-08-11 decision): `users` is the access-locked admin-account
 * collection, whereas authors are PUBLIC byline data and a guest author must
 * be addable without a Payload login. `read` is therefore public so anonymous
 * article reads populate the byline and the Article JSON-LD `author.sameAs`;
 * create/update/delete stay authenticated. `socials` URLs surface as the
 * schema.org `author.sameAs` array.
 */
export const Authors: CollectionConfig = {
  slug: 'authors',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'role', 'slug'],
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'text',
      admin: {
        description:
          'Byline role/title, e.g. "Technical PM + Software Engineer".',
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'bio',
      type: 'textarea',
    },
    {
      name: 'email',
      type: 'email',
    },
    {
      name: 'socials',
      type: 'array',
      admin: {
        description:
          'Public profile URLs — surfaced as Article JSON-LD author.sameAs.',
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
    ...slugField('name'),
  ],
  // Authors render out of the posts cache (article bylines) and the authors
  // cache (authorsRepo). Purge both so a renamed/edited author goes live
  // without a redeploy — mirrors the Categories/Media revalidation pattern.
  hooks: {
    afterChange: [
      revalidateCollectionTag('posts', ['/articles']),
      revalidateCollectionTag('authors'),
    ],
    afterDelete: [
      revalidateCollectionTagDelete('posts', ['/articles']),
      revalidateCollectionTagDelete('authors'),
    ],
  },
}
