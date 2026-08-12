import Link from 'next/link'

import { Card } from '@/components/Card'
import { formatDate } from '@/lib/formatDate'
import { dedupeArticlesBySlug } from '@/lib/articleUtils'
import { getAllArticles } from '@/lib/articles'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import type { ArticlesArchiveBlock } from '@/payload-types'

/**
 * Recent-articles section (CMS page builder): queries published posts at
 * render time — the website-template Archive pattern. Server component.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks The card grid sizes itself against its own container rather than
 * the viewport, so the same block reads as three columns in the route's
 * content column and one in a half column — see `hostContext.ts` for the
 * threshold map. The query container is the wrapper that already carries the
 * grid's `mt-8`, so nothing about margin collapsing changes.
 */
export async function ArticlesArchiveComponent(
  props: ArticlesArchiveBlock & { hosted?: BlockHostContext },
) {
  const limit = props.limit ?? 3
  const articles = dedupeArticlesBySlug(await getAllArticles()).slice(0, limit)
  if (!articles.length) return null

  return (
    <section className={blockRhythmClass(props.hosted)}>
      {props.heading ? (
        <h2 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          {props.heading}
        </h2>
      ) : null}
      <div className="@container mt-8">
        <div className="grid grid-cols-1 gap-10 @md:grid-cols-2 @3xl:grid-cols-3">
          {articles.map((article) => (
            <Card as="article" key={article.slug}>
              <Card.Title href={`/articles/${article.slug}`}>
                {article.title}
              </Card.Title>
              <Card.Eyebrow as="time" dateTime={article.date} decorate>
                {formatDate(article.date)}
              </Card.Eyebrow>
              <Card.Description>{article.description}</Card.Description>
              <Card.Cta>Read article</Card.Cta>
            </Card>
          ))}
        </div>
      </div>
      <div className="mt-8">
        <Link
          href="/articles"
          className="text-sm font-medium text-teal-700 transition hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
        >
          Browse all articles →
        </Link>
      </div>
    </section>
  )
}
