import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import {
  Authors,
  Categories,
  Media,
  Pages,
  Posts,
  Projects,
  Tags,
  TechStack,
  Users,
  Uses,
  WorkHistory,
} from './collections'
import { defaultLexical } from './fields/defaultLexical'
import { Footer, Identity, Navigation, SiteSettings } from './globals'
import { buildMediaBlobUrl } from './lib/storage/mediaBlobUrl'
import { plugins } from './plugins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Payload CMS configuration — the single source of truth for site content.
 *
 * @remarks
 * - Postgres via `@payloadcms/db-postgres` (Drizzle over node-postgres;
 *   Supabase in staging/prod, local Postgres in dev). Migrations run on
 *   deploy (`payload migrate`), not dev push.
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
  collections: [
    Pages,
    Posts,
    Projects,
    TechStack,
    Uses,
    Categories,
    Tags,
    Media,
    Users,
    Authors,
    WorkHistory,
  ],
  editor: defaultLexical,
  graphQL: {
    // Payload's default in production — asserted here so it can't regress.
    disablePlaygroundInProduction: true,
  },
  // Resend transactional email (migrated from SendGrid SMTP 2026-08-10 —
  // first-party adapter, HTTP API instead of an SMTP relay). Only active
  // when the API key is present; otherwise Payload logs emails to console,
  // so local dev and CI boot without Resend. Covers forgot-password etc.
  ...(process.env.RESEND_API_KEY
    ? {
        email: resendAdapter({
          apiKey: process.env.RESEND_API_KEY,
          defaultFromAddress:
            process.env.CONTACT_FROM_EMAIL || 'info@brandonperfetti.com',
          defaultFromName: process.env.NEXT_PUBLIC_SITE_NAME || 'BP Portfolio',
        }),
      }
    : {}),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // Plain node-postgres adapter (migrated from @payloadcms/db-vercel-postgres
  // 2026-08-10 with the Neon → Supabase move): the Vercel adapter rides
  // Neon's proprietary serverless driver and cannot speak to any other
  // Postgres. Both adapters are Drizzle-Postgres underneath — schema and
  // committed migrations are interchangeable by design.
  db: postgresAdapter({
    pool: {
      // DATABASE_URI is our canonical name (POSTGRES_URL / DATABASE_URL
      // accepted as fallbacks). On Supabase this must be the SUPAVISOR
      // TRANSACTION-MODE pooler string (port 6543) — serverless functions
      // need many transient connections. Transaction mode rejects prepared
      // statements, which is fine: node-postgres does not use named
      // prepared statements by default. pg_dump/restore against the same
      // database use the session-mode string (port 5432) instead.
      connectionString:
        process.env.DATABASE_URI ||
        process.env.POSTGRES_URL ||
        process.env.DATABASE_URL ||
        '',
    },
    // Disable dev schema push unless explicitly enabled — migrations are the
    // source of truth so staging/prod schema stays reproducible.
    push: process.env.PAYLOAD_DB_PUSH === 'true',
  }),
  sharp,
  globals: [SiteSettings, Navigation, Footer, Identity],
  plugins: [
    ...plugins,
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: {
        media: {
          // Emit the public blob origin as `media.url` instead of the
          // canonical-domain `/api/media/file/**` route, so OG/social and every
          // media URL resolves to where the bytes live regardless of the serving
          // host (fixes production-pinned OG image URLs that 404 off-production).
          // `generateFileURL` is checked before `disablePayloadAccessControl` in
          // the url afterRead hook, so the static file route stays registered.
          generateFileURL: ({ filename, prefix }) =>
            buildMediaBlobUrl({ filename, prefix }),
        },
      },
      token: process.env.BLOB_READ_WRITE_TOKEN || '',
    }),
  ],
})
