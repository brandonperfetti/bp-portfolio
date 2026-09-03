import { PayloadRequest } from 'payload'

import { publicPathFor } from '@/fields/slug/slugPaths'
import type { PathableDoc } from '@/fields/slug/slugPaths'
import type { SlugRoutedCollection } from '@/fields/slug/slugPaths'

/**
 * How the caller identifies the document being previewed.
 *
 * @remarks A discriminated union rather than two optional fields, so a call
 * that supplies **neither** is a type error instead of a silent `null` preview
 * URL the admin would render as a dead button.
 *
 * - `doc` is the form to prefer: it is the only one that can name a nested URL.
 * - `slug` is for a caller that holds no document. Posts use it, and will keep
 *   agreeing with `doc` until post placement lands (#153) — a post has no
 *   `path`, so both forms produce `/articles/<slug>`.
 */
type PreviewTarget =
  { doc: PathableDoc; slug?: never } | { slug: unknown; doc?: never }

type Props = PreviewTarget & {
  collection: SlugRoutedCollection
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
