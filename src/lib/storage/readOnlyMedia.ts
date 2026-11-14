import type {
  CollectionAfterReadHook,
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
 * its URL pointed at the shared store, so uploads are refused instead. Clear the
 * variable to upload to local disk.
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
  'Media is read-only here: STORAGE_VERCEL_BLOB_BASE_URL is set without a Blob token, so an upload would get a URL in the shared store that has no bytes behind it. Clear STORAGE_VERCEL_BLOB_BASE_URL to upload to local disk.'

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
 * Refuse an upload while read-only mode is on.
 *
 * @remarks Guarded on `req.file`, so alt-text edits and deletes still work: a
 * delete without the plugin only removes the local row and its local file.
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
