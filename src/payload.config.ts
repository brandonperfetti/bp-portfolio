import path from 'path'
import { fileURLToPath } from 'url'

import { vercelPostgresAdapter } from '@payloadcms/db-vercel-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Media, Users } from './collections'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Payload CMS configuration — the single source of truth for site content.
 *
 * @remarks
 * - Postgres via `@payloadcms/db-vercel-postgres` (Drizzle, Vercel-optimized
 *   pooling). Migrations run on deploy (`payload migrate`), not dev push.
 * - Media lives in Vercel Blob; the storage plugin is only enabled when
 *   `BLOB_READ_WRITE_TOKEN` is present so local dev can boot with only a
 *   database.
 * - Admin auth is Payload's own (Users collection). Clerk (end users) is
 *   wired separately in later phases and never guards `/admin`.
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    // Use Payload's built-in avatar, not Gravatar: avoids an external image
    // host and stops leaking each admin's email hash to gravatar.com.
    avatar: 'default',
    meta: {
      titleSuffix: '- BP Portfolio Admin',
      description: 'Content management for brandonperfetti.com',
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Media, Users],
  editor: lexicalEditor(),
  graphQL: {
    // Payload's default in production — asserted here so it can't regress.
    disablePlaygroundInProduction: true,
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: vercelPostgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
    // Disable dev schema push unless explicitly enabled — migrations are the
    // source of truth so staging/prod schema stays reproducible.
    push: process.env.PAYLOAD_DB_PUSH === 'true',
  }),
  sharp,
  plugins: [
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: {
        media: true,
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
  ],
})
