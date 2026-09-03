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
 * - `doc` is the form to prefer, and since #153 it is what **every production
 *   caller passes** — Pages and Posts both hand over the whole document. It is
 *   the only form that can name a nested URL, for either collection.
 * - `slug` is the arm for a caller that holds no document, and it is kept for
 *   that reason. It is necessarily wrong for a placed document of either kind:
 *   a slug alone cannot spell `/work/brytecore`, and for a post it can only
 *   ever produce `/articles/<slug>`.
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
 * An **unplaced** post renders at `/articles/[slug]` — the v3 URL surface,
 * preserved, and still the state of the whole corpus. A **placed** one renders
 * at its placed path through the same catch-all pages use (#153), and previews
 * there: a slug-only preview would resolve to the archive URL and reach the
 * placed path only by riding the article route's 308, having fetched a URL that
 * is not the document's. The `/next/preview` route handler is added with the
 * frontend port (Phase 2).
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
