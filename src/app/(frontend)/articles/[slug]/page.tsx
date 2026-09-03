import type { Metadata } from 'next'
import { notFound, permanentRedirect, redirect } from 'next/navigation'

import { publicPathFor, publicPathForSlug } from '@/fields/slug/slugPaths'
import { getAllArticles, getArticleBySlug } from '@/lib/articles'
import { EMPTY_CMS_SENTINEL } from '@/lib/cms/emptyCmsSentinel'
import { getRedirectForPath } from '@/lib/cms/redirectsRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import {
  ArticleView,
  articleAncestors,
  buildArticleMetadata,
} from './ArticleView'

// #76 Piece 1: `export const dynamicParams = true` removed — `dynamicParams` is
// unsupported under `cacheComponents` (hard build error). Its behavior (serve
// params not returned by `generateStaticParams` at request time) is the
// cacheComponents default, so removal is behavior-preserving. `notFound()` in
// the page still handles slugs that don't resolve. Piece 2 adds the empty-CMS
// `generateStaticParams` guard + the `<Suspense>`/auth-gated-body split.

type Params = {
  slug: string
}

type PageProps = {
  params: Promise<Params>
}

/**
 * The path this route is *able* to serve for a slug — `/articles/<slug>`,
 * always, whatever the document says.
 *
 * @remarks The comparison half of the placed-article check (#153). Written
 * through `publicPathForSlug` rather than as a template so it stays the same
 * expression `createSlugRedirect` writes its rows with; a hand-built
 * slash-articles-slash-slug template here would be a twelfth copy of the prefix
 * and would stop matching the moment the prefix moved.
 */
const routePathFor = (slug: string): string | null =>
  publicPathForSlug('posts', slug)

export async function generateStaticParams() {
  const articles = await getAllArticles()
  // Empty-CMS guard (mirrors the catch-all): Cache Components hard-errors on an
  // empty `generateStaticParams`. One sentinel → `getArticleBySlug` returns null
  // → `notFound()`, so a zero-published-posts CMS degrades to a 404, not a crash.
  if (articles.length === 0) return [{ slug: EMPTY_CMS_SENTINEL }]
  // PLACED articles stay in this list on purpose (#153). Their slugs no longer
  // render here — the check below redirects them — but emitting them is what
  // makes that redirect *prerender* as a static 308 instead of being resolved
  // dynamically on every request to an old `/articles/<slug>` link.
  return articles.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const [article, settings] = await Promise.all([
    getArticleBySlug(slug),
    getCmsSiteSettings(),
  ])

  if (!article) {
    return {
      title: 'Article not found',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  // A placed article's metadata is emitted by the catch-all at its real URL.
  // This route only 308s to it, and metadata for a redirect is never read — but
  // `buildArticleMetadata` would still advertise the placed canonical here,
  // which is correct and harmless either way.
  return buildArticleMetadata(article, settings)
}

/**
 * The article archive's per-slug route: `/articles/<slug>`.
 *
 * @remarks Serves every **unplaced** article — which is every article until an
 * editor deliberately places one — and permanently redirects the placed ones to
 * the section URL they now live at (#153).
 */
export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params
  // #76 B2: prerender the signed-out published shell. `getArticleBySlug` with a
  // signed-out viewer reads the cached published post (no `auth()` on this
  // path), so the shell, metadata, and the published body (or the gated teaser)
  // prerender static. The per-request member unlock is Suspense-isolated in
  // <AuthGatedArticleBody>, so only gated articles stream and only their body —
  // the signed-out output is byte-identical to today's.
  const [article, settings] = await Promise.all([
    getArticleBySlug(slug, { isAuthenticated: false }),
    getCmsSiteSettings(),
  ])

  if (!article) {
    // #120: a slug that no longer resolves may be a renamed article. The lookup
    // lives INSIDE this already-dynamic not-found branch on purpose — every
    // slug from `generateStaticParams` resolves and never reaches here, so the
    // route's partial-prerender profile is unchanged.
    //
    // The path comes from `publicPathForSlug`, the same function
    // `createSlugRedirect` used to WRITE the redirect row's `from`. Hand-building
    // `/articles/${slug}` here meant the reader and the writer each owned a copy
    // of the prefix, so moving the route would silently stop matching rows the
    // hook is still writing.
    const from = routePathFor(slug)
    const match = from ? await getRedirectForPath(from) : null
    // #130: the row's permanence decides the API. `permanentRedirect` emits
    // 308 and `redirect` 307; a row with no stored type answers permanent, so
    // every pre-#130 row keeps the behaviour it had.
    if (match?.permanent) permanentRedirect(match.destination)
    if (match) redirect(match.destination)
    notFound()
  }

  // Placed-article check (#153). The article resolved, but it may no longer
  // LIVE here: a placed article's public path is `/work/brytecore`, and this
  // route can only ever be `/articles/<slug>`. Comparing the two is what moves
  // the URL.
  //
  // Deliberately an explicit check rather than a reliance on the redirect row
  // the #120 machinery would write. Two reasons, and the second is the one that
  // matters: (1) it self-heals — delete every redirect row and placement still
  // resolves correctly, because the truth is the document's own `path`; and
  // (2) **placement writes no row at all today.** `createSlugRedirect` fires on
  // a slug change, and placing an article changes its `parent`, not its slug —
  // so without this branch a placed article would serve at BOTH URLs, which is
  // exactly the duplicate-content failure the ticket exists to prevent. Making
  // the row the mechanism instead is #150's ground (`capturePublishedPath` /
  // `createPathRedirect`); this check is correct with or without it.
  const placedPath = publicPathFor('posts', article)
  const routePath = routePathFor(slug)
  if (placedPath && routePath && placedPath !== routePath) {
    permanentRedirect(placedPath)
  }

  return (
    <ArticleView
      article={article}
      settings={settings}
      ancestors={await articleAncestors(article)}
    />
  )
}
