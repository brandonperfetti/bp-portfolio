import { getArticleBySlug } from '@/lib/articles'
import { renderOgCard } from '@/lib/og/card'

/**
 * Generated OG title-card for an article (T7). Runs on the Node.js runtime
 * because {@link renderOgCard} reads the bundled font files from disk (`next/og`
 * can run on the edge, but font `fs` reads cannot).
 *
 * @remarks #76 Piece 1: the explicit `export const runtime = 'nodejs'` was
 * removed — the `runtime` route-segment config is incompatible with
 * `cacheComponents`, and Node is already the default runtime, so this is a
 * behavior-preserving no-op removal.
 */

type RouteContext = { params: Promise<{ slug: string }> }

/**
 * Render the branded fallback card for `/articles/[slug]`. The metadata resolver
 * only points social tags at this URL when the entry resolves to a generated
 * image, but the route is title-only and safe to render for any published slug;
 * an unknown slug 404s rather than emitting a blank card.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params
  const article = await getArticleBySlug(slug)

  if (!article) {
    return new Response('Not found', { status: 404 })
  }

  return renderOgCard(article.seoTitle || article.title)
}
