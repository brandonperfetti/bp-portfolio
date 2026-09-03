import { PayloadRequest } from 'payload'

import { publicPathFor } from '@/fields/slug/slugPaths'
import type { PathableDoc } from '@/fields/slug/slugPaths'
import type { SlugRoutedCollection } from '@/fields/slug/slugPaths'

type Props = {
  collection: SlugRoutedCollection
  /**
   * The document being previewed — `slug`, plus `path` for a placed page.
   * Prefer this; it is the only form that can preview a nested URL.
   */
  doc?: PathableDoc
  /**
   * Slug-only form, for a caller that holds no document. Posts still use it:
   * a post has no `path` until placement lands (#153), so the two forms agree
   * for every post today.
   */
  slug?: unknown
  req: PayloadRequest
}

/**
 * Build the draft-preview URL for a document, used by the admin Live Preview
 * and "Preview" button.
 *
 * @param collection - The document's collection.
 * @param doc - The document, or a projection carrying `slug` and `path`.
 * @returns A `/next/preview` URL, or `null` when the document has no public
 *   path yet (a create with no slug).
 *
 * @remarks This module used to carry `collectionPrefixMap`, a **second copy**
 * of `SLUG_ROUTED_COLLECTIONS` that drifted from `slugPaths.ts` by construction.
 * It is deleted: the preview path is now the same string `publicPathFor`
 * produces for the live URL, so previewing a placed page opens
 * `/work/brytecore` rather than the `/brytecore` that never existed (#148).
 *
 * Posts render at `/articles/[slug]` (v3 URL surface, preserved). The
 * `/next/preview` route handler is added with the frontend port (Phase 2).
 */
export const generatePreviewPath = ({ collection, doc, slug }: Props) => {
  const path = publicPathFor(collection, doc ?? { slug })
  if (!path) return null

  // Encode each segment so a slug with special characters survives, without
  // encoding the separators that make it a path.
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  const encodedParams = new URLSearchParams({
    path: encodedPath,
    previewSecret: process.env.PREVIEW_SECRET || '',
  } satisfies Record<string, string>)

  return `/next/preview?${encodedParams.toString()}`
}
