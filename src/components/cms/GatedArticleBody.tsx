import { ArticleBody } from '@/components/cms/ArticleBody'
import { MemberMarkdownOverride } from '@/components/cms/ArticleCopyMarkdown'
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
  if (article.gated) {
    return (
      <div className="mt-8 rounded-2xl border border-zinc-200 p-6 text-center dark:border-zinc-700/60">
        <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">
          This article is for members.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in (it&apos;s free) to read the full piece.
        </p>
        <a
          href={`/sign-in?redirect_url=/articles/${article.slug}`}
          className="mt-4 inline-flex items-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
        >
          Sign in to continue
        </a>
      </div>
    )
  }
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
      <MemberMarkdownOverride markdown={articleBlocksToMarkdown(resolvedBlocks)} />
    </>
  )
}
