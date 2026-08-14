import path from 'path'

/**
 * Public Vercel Blob URL construction for the `media` collection.
 *
 * @remarks
 * Payload's `@payloadcms/storage-vercel-blob` adapter defaults `access: 'public'`
 * and, when access control is disabled, serves media from
 * `https://<storeId>.public.blob.vercel-storage.com/<key>`. We keep access
 * control enabled (so the `/api/media/file/**` route stays registered) and
 * instead point `media.url` at that same public blob origin via the collection's
 * `generateFileURL` hook — which the url `afterRead` hook checks *before*
 * `disablePayloadAccessControl` (see `@payloadcms/plugin-cloud-storage`
 * `hooks/afterRead`). The result is a domain-independent, env-aware media URL:
 * each deployment derives the store from its own `BLOB_READ_WRITE_TOKEN`, so
 * staging emits staging-store URLs and production emits production-store URLs
 * with zero `VERCEL_*` branching, and the value recomputes on every read (no
 * data migration; reverts cleanly if this is rolled back).
 *
 * @see src/lib/cms/pageMetadata.ts — OG/social image URLs consume `media.url`
 *   and previously prefixed the canonical (production) origin onto the relative
 *   `/api/media/file/**` route, which 404s off-production.
 */

/**
 * Derive the media store's public blob origin from a Vercel Blob RW token,
 * matching the store-id parse and origin shape the adapter itself uses. Honors
 * the emulator override the plugin also respects.
 *
 * @returns the origin (no trailing slash), or `null` when no valid token is
 *   present (e.g. local dev on local storage) so callers fall back to the
 *   Payload-served route.
 */
export function getMediaBlobBaseUrl(
  token: string | undefined = process.env.BLOB_READ_WRITE_TOKEN,
  override: string | undefined = process.env.STORAGE_VERCEL_BLOB_BASE_URL,
): string | null {
  if (override) {
    return override.replace(/\/+$/, '')
  }
  const storeId = token
    ?.match(/^vercel_blob_rw_([a-z\d]+)_[a-z\d]+$/i)?.[1]
    ?.toLowerCase()
  return storeId ? `https://${storeId}.public.blob.vercel-storage.com` : null
}

/**
 * Build the absolute public blob URL for a media file — byte-identical to the
 * adapter's own `generateURL` (origin + key, with only the filename segment
 * percent-encoded). `media` has no image sizes and no prefix today; `prefix` is
 * handled defensively so this stays correct if one is ever introduced.
 *
 * @returns the absolute blob URL, or Payload's default relative route
 *   (`/api/media/file/<name>`) when no blob origin resolves.
 */
export function buildMediaBlobUrl({
  filename,
  prefix,
  baseUrl = getMediaBlobBaseUrl(),
}: {
  baseUrl?: string | null
  filename: string
  prefix?: string
}): string {
  if (!baseUrl) {
    return `/api/media/file/${encodeURIComponent(filename)}`
  }
  const keyPath = prefix ? path.posix.join(prefix, filename) : filename
  const dir = path.posix.dirname(keyPath)
  const encodedFilename = encodeURIComponent(path.posix.basename(keyPath))
  const key =
    dir === '.' ? encodedFilename : path.posix.join(dir, encodedFilename)
  return `${baseUrl}/${key}`
}
