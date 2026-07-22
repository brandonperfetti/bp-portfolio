import type { CollectionConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'

/**
 * Uploaded media (article covers, page images). Stored in Vercel Blob via
 * `@payloadcms/storage-vercel-blob` when `BLOB_READ_WRITE_TOKEN` is set.
 *
 * @remarks SVG is allowed because legacy content uses it; SVGs can carry
 * scripts, so only trusted staff should hold editor accounts.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/gif',
      'image/svg+xml',
    ],
  },
}
