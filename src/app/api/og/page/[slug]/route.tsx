import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { renderOgCard } from '@/lib/og/card'

/**
 * Generated OG title-card for a page-builder page (T7). Node runtime because
 * {@link renderOgCard} reads the bundled font files from disk.
 */
export const runtime = 'nodejs'

type RouteContext = { params: Promise<{ slug: string }> }

/**
 * Render the branded fallback card for a Pages entry. The route is keyed by the
 * collection slug; `home` maps back to `/` so it resolves through the same
 * repo/cache seam every other page uses ({@link getCmsPageByPath}). An unknown
 * or unpublished slug 404s rather than emitting a blank card.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params
  const path = slug === 'home' ? '/' : `/${slug}`
  const page = await getCmsPageByPath(path)

  if (!page) {
    return new Response('Not found', { status: 404 })
  }

  return renderOgCard(page.seoTitle || page.title)
}
