import type {
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
} from 'payload'

import { APIError } from 'payload'

import { buildMediaBlobUrl } from './mediaBlobUrl'

/**
 * Read-only media mode: a tokenless way for local work to show the shared Blob
 * store's media (#328).
 *
 * @remarks A database restored from staging or production
 * (`pnpm db:local:refresh`) stores each media row's `filename`, and `media.url` is
 * recomputed on every read. With the Blob storage plugin off (no
 * `BLOB_READ_WRITE_TOKEN`), Payload computes `/api/media/file/<name>` and looks
 * for the bytes on local disk, so every restored image 404s. The old workaround
 * was to put the store's read-write token in `.env.local`, which let any local
 * upload write to production media.
 *
 * Blob objects are public to read, so reading needs no token. Setting only
 * `STORAGE_VERCEL_BLOB_BASE_URL` to the store's public origin points
 * `media.url` there. A file uploaded in this mode would land on local disk while
 * its URL pointed at the shared store, so every file write is refused instead:
 * an upload, and a file Payload makes itself from a crop, a focal-point
 * re-upload or a duplicate. Clear the variable to upload to local disk.
 */

/**
 * The public origin read-only mode serves media from, or `null` when the mode
 * is off.
 *
 * @returns the origin (no trailing slash) when an origin is set and no token
 *   is. With a token the storage plugin owns URLs and uploads, so the mode is
 *   off.
 */
export function getReadOnlyMediaBaseUrl(
  token: string | undefined = process.env.BLOB_READ_WRITE_TOKEN,
  override: string | undefined = process.env.STORAGE_VERCEL_BLOB_BASE_URL,
): string | null {
  if (token || !override) {
    return null
  }
  return override.replace(/\/+$/, '')
}

/** The refusal text, exported so tests pin the exact wording callers see. */
export const READ_ONLY_MEDIA_UPLOAD_ERROR =
  'Media is read-only here: STORAGE_VERCEL_BLOB_BASE_URL is set without a Blob token, so a new or edited file would get a URL in the shared store that does not serve its bytes. Clear STORAGE_VERCEL_BLOB_BASE_URL to upload or edit files on local disk.'

/**
 * Point a media row's `url` at the read-only origin.
 *
 * @remarks A collection `afterRead` hook runs after the field hooks that
 * compute Payload's local route, so this replaces that value. A row without a
 * filename keeps the value Payload gave it.
 */
export const pointMediaUrlAtReadOnlyOrigin: CollectionAfterReadHook = ({
  doc,
}) => {
  const baseUrl = getReadOnlyMediaBaseUrl()
  if (!baseUrl || typeof doc?.filename !== 'string' || !doc.filename) {
    return doc
  }
  return { ...doc, url: buildMediaBlobUrl({ baseUrl, filename: doc.filename }) }
}

/**
 * Refuse an upload while read-only mode is on, before Payload fetches anything.
 *
 * @remarks Guarded on `req.file`, so alt-text edits and deletes still work: a
 * delete without the plugin only removes the local row and its local file.
 * This is the early refusal for a request that arrives with a file; files
 * Payload makes later are caught by {@link refuseFileWriteInReadOnlyMedia}.
 */
export const refuseUploadInReadOnlyMedia: CollectionBeforeOperationHook = ({
  args,
  operation,
  req,
}) => {
  if (
    (operation === 'create' || operation === 'update') &&
    req.file &&
    getReadOnlyMediaBaseUrl()
  ) {
    throw new APIError(READ_ONLY_MEDIA_UPLOAD_ERROR, 400, undefined, true)
  }
  return args
}

/**
 * Refuse any file Payload is about to write while read-only mode is on.
 *
 * @remarks A crop or resize (`?uploadEdits`), a changed focal point, and a
 * duplicate reach the collection with no file: Payload's `generateFileData`
 * fetches or copies the bytes after `beforeOperation` and only then sets
 * `req.file` (payload 3.88.0 `uploads/generateFileData.js`). Collection
 * `beforeChange` runs after that step and before `uploadFiles` writes to
 * disk, in create and update alike, so this is the last point that sees every
 * file before it is written. Without it, a crop would save new bytes locally
 * while `media.url` still served the original from the shared store.
 */
export const refuseFileWriteInReadOnlyMedia: CollectionBeforeChangeHook = ({
  data,
  req,
}) => {
  if (req.file && getReadOnlyMediaBaseUrl()) {
    throw new APIError(READ_ONLY_MEDIA_UPLOAD_ERROR, 400, undefined, true)
  }
  return data
}
