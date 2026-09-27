import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'

import { APIError } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import {
  revalidateCollectionTag,
  revalidateCollectionTagDelete,
} from '@/hooks/revalidateCollection'

/**
 * The upload-derived fields a caller can put in `data` without sending a file.
 * Payload fills every one of them itself from the bytes of a real upload.
 */
const FILE_METADATA_FIELDS = [
  'url',
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
] as const

/** The refusal text, exported so tests pin the exact wording callers see. */
export const MEDIA_CREATE_WITHOUT_UPLOAD_ERROR =
  'Media rows are created from an upload. To attach an image from a URL use POST /api/media/ingest.'

/**
 * Refuse a Media create that carries file metadata but no file (#242).
 *
 * @remarks Without this, the generated MCP `createMedia` called with `alt`,
 * `url`, `filename`, `mimeType`, `width`, `height` and `filesize` (and no
 * file) is accepted (staging media 176, measured 2026-09-23 on #237).
 *
 * Corrected 2026-09-27: an earlier version of this remark said such a create
 * "mints a row with no bytes behind it" because the storage adapter uploads
 * only `req.file`; do not rely on that. What payload 3.88.0 does: given a
 * `filename` + `url` and no file, `generateFileData` fetches the `url`
 * server-side (`getExternalFile`, any public host — no allowlist), throws if
 * the fetch fails, and on success puts the fetched bytes on `req.file`
 * (`generateFileData.js:262,285`) under the caller's `filename`, with
 * `overwriteExistingFiles` forced on so no safe-name suffix is added
 * (`:68,76,190`). The storage adapter's `afterChange` then uploads `req.file`
 * (`plugin-cloud-storage` `hooks/afterChange.js:10`). Measured on local disk
 * (no Blob token), the create stored the fetched bytes at that filename. So
 * the hazard is a server-side fetch of an arbitrary URL written to a
 * caller-chosen path in the store, bypassing the ingest route's guard rails —
 * not a row without bytes.
 *
 * Guarded on the presence of the file, not on the caller, so every path that
 * sends bytes — admin uploads, the ingest route's and the scripts' Local API
 * `payload.create({ file })` (Local API sets `req.file` from `file`) — is
 * untouched, and updates never reach it. The admin's Duplicate posts `{}` as
 * `data`, so it carries none of these fields and passes too.
 *
 * It is a `beforeOperation` hook, not `beforeValidate`/`beforeChange`, because
 * Payload's create runs `generateFileData` BEFORE those hooks, and with no file
 * but a `filename` + `url` in `data` that step itself fetches the caller's URL
 * server-side (`generateFileData` → `getExternalFile`, payload 3.88.0). Refusing
 * here stops the request before any fetch. An `APIError` (400, public) rather
 * than a field `ValidationError`, because the MCP tool relays only
 * `error.message` and a `ValidationError`'s message names the field, not the
 * supported path.
 */
export const refuseCreateWithoutUpload: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'create' || req.file) {
    return args
  }
  const data = (args as { data?: Record<string, unknown> }).data ?? {}
  const carried = FILE_METADATA_FIELDS.filter(
    (field) => data[field] !== undefined && data[field] !== null,
  )
  if (carried.length > 0) {
    throw new APIError(
      MEDIA_CREATE_WITHOUT_UPLOAD_ERROR,
      400,
      { carried },
      true,
    )
  }
  return args
}

/**
 * Uploaded media (article covers, page images). Stored in Vercel Blob via
 * `@payloadcms/storage-vercel-blob` when `BLOB_READ_WRITE_TOKEN` is set.
 *
 * @remarks SVG is allowed because legacy content uses it; SVGs can carry
 * scripts, so only trusted staff should hold editor accounts. PDF is
 * allowed for document uploads (the Identity global's CV file).
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
      'application/pdf',
    ],
  },
  // Media (alt text, refreshed uploads) renders through both the posts and
  // pages caches (fresh-eyes review 2026-08, m1).
  hooks: {
    beforeOperation: [refuseCreateWithoutUpload],
    afterChange: [
      revalidateCollectionTag('posts', ['/articles']),
      revalidateCollectionTag('pages', ['/']),
    ],
    afterDelete: [
      revalidateCollectionTagDelete('posts', ['/articles']),
      revalidateCollectionTagDelete('pages', ['/']),
    ],
  },
}
