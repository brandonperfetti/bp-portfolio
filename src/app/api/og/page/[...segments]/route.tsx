import { getCmsPageByPath, pathSegments } from '@/lib/cms/pagesRepo'
import { renderOgCard } from '@/lib/og/card'

/**
 * Generated OG title-card for a page-builder page (T7). Runs on the Node.js
 * runtime because {@link renderOgCard} reads the bundled font files from disk.
 *
 * @remarks #76 Piece 1: the explicit `export const runtime = 'nodejs'` was
 * removed — the `runtime` route-segment config is incompatible with
 * `cacheComponents`, and Node is already the default runtime, so this is a
 * behavior-preserving no-op removal.
 */

type RouteContext = { params: Promise<{ segments?: string[] }> }

/**
 * Render the branded fallback card for a Pages entry.
 *
 * @remarks **Path-keyed, not slug-keyed (#148).** Under per-parent slug
 * uniqueness a bare slug is ambiguous — `/work/about` and `/tech/about` are
 * different pages with the same slug — so the route takes the page's full path
 * and hands it straight to {@link getCmsPageByPath}, the same repo/cache seam
 * every other page uses.
 *
 * The old hand-built root special case (a ternary comparing the slug to the
 * root slug) is gone rather than
 * relocated: the root page's stored `path` is literally the root slug, so
 * `/api/og/page/home` resolves through the ordinary lookup. Every existing
 * one-segment URL therefore keeps working byte-for-byte, which is what makes
 * this safe while the emitter still sends a slug.
 *
 * The emitter agrees: `resolvePageSocialImage` builds this URL from the page's
 * public path via `publicPathFor`, so a nested page's card is requested at
 * `/api/og/page/work/brytecore`. An unknown or unpublished path 404s rather than
 * emitting a blank card.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { segments } = await params
  const parts = pathSegments((segments ?? []).join('/'))
  if (parts.length === 0) {
    return new Response('Not found', { status: 404 })
  }

  const page = await getCmsPageByPath(`/${parts.join('/')}`)

  if (!page) {
    return new Response('Not found', { status: 404 })
  }

  return renderOgCard(page.seoTitle || page.title)
}
