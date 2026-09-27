import type {
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

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
 * `data`, so it carries none of these fields and passes too. (Added
 * 2026-09-27: the update-path counterpart is `refuseFilelessFileRewrite`
 * below — a fileless update does not fetch, but it can re-point the row.)
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
 * The stored fields that describe a row's bytes. An update may carry them
 * unchanged (a client round-tripping the doc), but only an upload may change
 * them. `url` is not listed: the storage adapter recomputes it from
 * `filename` on every write, so a caller-sent `url` has no effect on update.
 */
const FILE_IDENTITY_FIELDS = [
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
] as const

/** The update refusal text, exported so tests pin the exact wording. */
export const MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR =
  "A Media row's file is changed by uploading a new one, not by editing its filename or file metadata. To attach an image from a URL use POST /api/media/ingest."

/** Same value for our purposes: both absent, or equal once stringified. */
const sameStoredValue = (incoming: unknown, stored: unknown): boolean =>
  (incoming ?? null) === null
    ? (stored ?? null) === null
    : String(incoming) === String(stored ?? '')

/**
 * Refuse a Media update that re-points the row at another file, or rewrites
 * the file's metadata, without an upload (#242, added 2026-09-27).
 *
 * @remarks Measured on local disk on 2026-09-27 (wave 9 lane D, addendum 2): a
 * fileless `payload.update` — what the MCP `updateMedia` tool calls, by id or
 * by `where` — carrying a new `filename` succeeded, fetched nothing, wrote
 * nothing, and left the row naming a path with no bytes of its own while
 * orphaning its old file. One carrying `mimeType`/`filesize`/`width`/`height`
 * rewrote them to whatever was sent. On Blob the re-pointed `url` resolves to
 * whatever object sits at that path in the shared store (`[source]`: with no
 * `req.file` the cloud-storage `afterChange` neither uploads nor deletes) —
 * the same plausible-but-not-its-own row the create guard exists for.
 *
 * Refused: any of `filename`, `mimeType`, `filesize`, `width`, `height` that
 * DIFFERS from the stored value, with no file on the request. Metadata-only
 * rewrites are refused too, not only a changed `filename`: those five fields
 * describe the bytes, Payload itself only ever writes them from a file
 * (`generateFileData`, which runs with `req.file` set), and a fileless write
 * can only make them disagree with the bytes that are served — width and
 * height feed image layout and OG metadata. Passed: `alt`, focal point and
 * every other field; any of the five sent back UNCHANGED (a client
 * round-tripping the doc — and Payload itself: measured 2026-09-27, the
 * `data` this hook sees on an alt-only or focal-only Local API update already
 * carries the stored file fields, so a presence check here would refuse every
 * update; the comparison is load-bearing); any update with a file (a real re-upload sets
 * `req.file`, and Payload fills these from it).
 *
 * Also passed: the storage adapter's own metadata write-back, which runs
 * with `context.skipCloudStorage` set and `req.file` cleared right after it
 * uploaded the bytes (`plugin-cloud-storage` `hooks/afterChange.js`). With
 * `addRandomSuffix` on, that write-back changes `filename` to the suffixed
 * name the Blob store chose (`storage-vercel-blob` `uploadFile.js`); it is
 * off in this config, and the exemption keeps enabling it from breaking every
 * upload. `context` is server-side only — no request body can set it.
 *
 * A `beforeValidate` hook, not `beforeOperation` like the create guard,
 * because the comparison needs the stored doc and Payload hands it to
 * `beforeValidate` per document, for id and `where` updates alike. Nothing
 * earlier in the update path fetches or writes for this shape (measured in
 * addendum 2; `updateByID.js:98-106` passes no `originalDoc` to
 * `generateFileData`) — unless the request carries an `uploadEdits` query.
 * Corrected 2026-09-27 (CodeRabbit round 1 on #271, #270): this said that path
 * was "unmeasured and not covered"; it is now measured and guarded one step
 * earlier by `refuseUploadEditsRefetch`, because that re-fetch sets `req.file`
 * and so passes this hook.
 */
export const refuseFilelessFileRewrite: CollectionBeforeValidateHook = ({
  context,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || req.file || context?.skipCloudStorage) {
    return data
  }
  const incoming = (data ?? {}) as Record<string, unknown>
  const stored = (originalDoc ?? {}) as Record<string, unknown>
  const changed = FILE_IDENTITY_FIELDS.filter(
    (field) =>
      incoming[field] !== undefined &&
      !sameStoredValue(incoming[field], stored[field]),
  )
  if (changed.length > 0) {
    throw new APIError(
      MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
      400,
      { changed },
      true,
    )
  }
  return data
}

/**
 * The two body fields Payload's re-fetch reads to find the bytes it re-crops
 * (`generateFileData.js:55`).
 */
const REFETCH_SOURCE_FIELDS = ['url', 'filename'] as const

/**
 * Refuse a Media update whose `uploadEdits` query would make Payload re-fetch
 * the file from a body `url`/`filename` that is not the row's own (#270; found
 * by CodeRabbit round 1 on #271, 2026-09-27).
 *
 * @remarks What payload 3.88.0 does. On update, `generateFileData` takes its
 * edits from `req.query.uploadEdits` (`generateFileData.js:342`); a body
 * `focalX`/`focalY` alone never re-fetches, because with no `originalDoc` it
 * is compared with itself (`:24-30`, `:362-367`). A query crop,
 * `widthInPixels`/`heightInPixels`, or a focal point that differs from the
 * body's makes it re-fetch the file when there is no `req.file` (`:16-33`,
 * `:54`), from the BODY's `filename` and `url` (`:55`):
 * a `url` starting with `/` is read from local disk at `staticDir/<filename>`
 * (`:59-68`, skipped when local storage is disabled, as it is with Blob);
 * otherwise `getExternalFile` fetches the `url` (`:69-76`; `safeFetch`, which
 * refuses private addresses but allows any public host). Either way it forces
 * `overwriteExistingFiles` and puts the bytes on `req.file` (`:262`, `:285`)
 * under the body's `filename` — so `refuseFilelessFileRewrite` sees a file and
 * lets the update through, and the ingest route's rails (Cloudinary-only,
 * `redirect: 'error'`, 12 MB) never run. The update operation calls it before
 * any `beforeValidate` hook (`updateByID.js:98`, `update.js:135`), so the
 * guard is a `beforeOperation` hook, like the create guard.
 *
 * Measured on local disk (no Blob token), 2026-09-27, lane M: with a body `url`
 * of `http://127.0.0.1:9/…` the update failed only because `safeFetch` refused
 * the loopback address ("Failed to fetch from http://127.0.0.1:9/…") — Payload
 * had tried to fetch the body's URL. With a body `filename` naming ANOTHER
 * row's file (and `url` `/api/media/file/<that name>`), the other row's file on
 * disk was overwritten with the 3×2 crop, although the request then failed
 * `filename`'s unique check and neither row changed. A public-host fetch was
 * not measured (no network in the lane).
 *
 * Refused, with an `uploadEdits` query and no file: a `url` or `filename` that
 * differs from the stored row's value as read (after `afterRead`); and a
 * `where` (bulk) update carrying either — Payload re-fetches once for every
 * matched row (`update.js:135`), and no admin bulk-edit view sends
 * `uploadEdits` (in `@payloadcms/ui` only the document view, the upload field
 * and bulk UPLOAD reference it). Passed: the admin's own crop and focal-point
 * edits — its edit view loads the doc with `findByID` at depth 0
 * (`@payloadcms/next` `views/Document/getDocumentData.js:23-36`), so the form
 * holds the same as-read `url` and `filename`, and it posts them with
 * `uploadEdits` in the action URL (`@payloadcms/ui`
 * `providers/DocumentInfo/index.js:296-306`); `[inference]` that the hidden
 * `url`/`filename` are posted, since Payload's crop cannot re-fetch without
 * them (measured: a crop with neither in the body changes nothing). Also
 * passed: any update without `uploadEdits`, any with a real file, and one
 * that sends neither field.
 */
export const refuseUploadEditsRefetch: CollectionBeforeOperationHook = async ({
  args,
  collection,
  operation,
  req,
}) => {
  const edits = req.query?.uploadEdits
  if (
    operation !== 'update' ||
    req.file ||
    typeof edits !== 'object' ||
    edits === null
  ) {
    return args
  }
  const { data, id } = args as {
    data?: Record<string, unknown>
    id?: number | string
  }
  const incoming = data ?? {}
  const sent = REFETCH_SOURCE_FIELDS.filter(
    (field) => incoming[field] !== undefined && incoming[field] !== null,
  )
  if (sent.length === 0) {
    return args
  }
  const stored =
    id === undefined
      ? null
      : ((await req.payload.findByID({
          collection: collection.slug as 'media',
          depth: 0,
          disableErrors: true,
          id,
          overrideAccess: true,
          req,
        })) as Record<string, unknown> | null)
  // An id that finds nothing: Payload 404s before it would fetch.
  if (id !== undefined && stored === null) {
    return args
  }
  const changed = stored
    ? sent.filter((field) => !sameStoredValue(incoming[field], stored[field]))
    : sent
  if (changed.length > 0) {
    throw new APIError(
      MEDIA_UPDATE_WITHOUT_UPLOAD_ERROR,
      400,
      { changed, uploadEdits: true },
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
    beforeOperation: [refuseCreateWithoutUpload, refuseUploadEditsRefetch],
    beforeValidate: [refuseFilelessFileRewrite],
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
