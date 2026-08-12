import { ArticlesArchiveView } from '@/blocks/ArticlesArchive/ArticlesArchiveView'
import { type BlockHostContext } from '@/blocks/hostContext'
import { dedupeArticlesBySlug } from '@/lib/articleUtils'
import { getAllArticles } from '@/lib/articles'
import type { ArticlesArchiveBlock } from '@/payload-types'

/**
 * Recent-articles section (CMS page builder): queries published posts at
 * render time — the website-template Archive pattern. Server component.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks Resolves the article list and hands it to
 * {@link ArticlesArchiveView}, which owns every pixel of both treatments and
 * every story. The query is the only thing this file decides.
 */
export async function ArticlesArchiveComponent(
  props: ArticlesArchiveBlock & { hosted?: BlockHostContext },
) {
  const limit = props.limit ?? 3
  const articles = dedupeArticlesBySlug(await getAllArticles()).slice(0, limit)
  if (!articles.length) return null

  return (
    <ArticlesArchiveView
      articles={articles.map((article) => ({
        slug: article.slug,
        title: article.title,
        date: article.date,
        description: article.description,
      }))}
      heading={props.heading}
      variant={props.variant}
      hosted={props.hosted}
    />
  )
}
