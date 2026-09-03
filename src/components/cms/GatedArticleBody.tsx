import { ArticleBody } from '@/components/cms/ArticleBody'
import { MemberMarkdownOverride } from '@/components/cms/ArticleCopyMarkdown'
import { MembersTeaser } from '@/components/cms/MembersTeaser'
import { SyncErrorState } from '@/components/cms/SyncErrorState'
import { getArticleBySlug, type ArticleDetailWithSlug } from '@/lib/articles'
import { getViewer } from '@/lib/auth/getViewer'
import { articleBlocksToMarkdown } from '@/lib/cms/markdown'

/**
 * The article body region: the members-only teaser when the (viewer-scoped)
 * article is gated, else the rendered body, else the sync-error state.
 *
 * @remarks Pure in its `article` arg, so it renders identically as the
 * signed-out prerender fallback and as the auth-resolved streamed body
 * (#76 B2 auth isolation).
 */
export function ArticleBodyRegion({
  article,
}: {
  article: ArticleDetailWithSlug
}) {
  const bodyBlocks = Array.isArray(article.bodyBlocks) ? article.bodyBlocks : []
  // #113: the teaser (and its Button-primitive CTA) is its own presentational
  // leaf so it can carry a Storybook story — this module's request-time
  // `AuthGatedArticleBody` imports make it unbundlable for the browser.
  // `path` too (#153): a placed article's post-sign-in return URL must be its
  // placed path, or the reader is bounced to `/articles/<slug>` and 308ed.
  if (article.gated)
    return <MembersTeaser slug={article.slug} path={article.path} />
  return bodyBlocks.length > 0 ? (
    <ArticleBody blocks={bodyBlocks} />
  ) : (
    <SyncErrorState />
  )
}

/**
 * Per-request unlock for a gated article, isolated behind `<Suspense>` so the
 * signed-out shell + teaser prerender while this streams (#76 B2, diagnosis
 * probe 8).
 *
 * @remarks Reads `getViewer()` (→ `auth()`, a prerender-blocking cookie read) at
 * request time: an authenticated, permitted viewer gets the refetched full body;
 * anyone else gets the same teaser the Suspense fallback shows, so the dominant
 * anonymous case has no visible layout shift. Gating enforcement stays in the
 * data layer (`getArticleBySlug` → `canAccess`); this only decides whether to
 * refetch with the viewer.
 *
 * For an authenticated viewer it also renders `<MemberMarkdownOverride>` with
 * the Markdown of the body actually rendered, publishing it to the copy button
 * in the prerendered shell. This keeps the copy-to-markdown source behind the
 * same auth-gated child — no `auth()` at the page level — so a signed-in member
 * copies the unlocked body while signed-out visitors copy the teaser (#106).
 */
export async function AuthGatedArticleBody({
  slug,
  fallback,
}: {
  slug: string
  fallback: ArticleDetailWithSlug
}) {
  const viewer = await getViewer()
  if (!viewer.isAuthenticated) {
    return <ArticleBodyRegion article={fallback} />
  }
  const unlocked = await getArticleBySlug(slug, viewer)
  const resolved = unlocked ?? fallback
  const resolvedBlocks = Array.isArray(resolved.bodyBlocks)
    ? resolved.bodyBlocks
    : []
  return (
    <>
      <ArticleBodyRegion article={resolved} />
      <MemberMarkdownOverride
        markdown={articleBlocksToMarkdown(resolvedBlocks)}
      />
    </>
  )
}
