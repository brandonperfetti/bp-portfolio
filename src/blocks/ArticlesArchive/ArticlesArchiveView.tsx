import Link from 'next/link'

import { Card } from '@/components/Card'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { formatDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

/** The two article-list treatments that exist on the site today. */
export type ArticlesArchiveVariant = 'grid' | 'stacked'

/**
 * One article, reduced to what a card shows. Deliberately narrower than
 * `ArticleWithSlug` so the whole visual surface is reachable from a story
 * without a database.
 */
export interface ArticleCardItem {
  slug: string
  title: string
  date: string
  description: string
}

/**
 * Article cards, presentational — both treatments the site already ships.
 *
 * @param articles - Articles in display order, already limited by the block.
 * @param heading - Optional section heading.
 * @param variant - `grid` is the card grid this block has always rendered;
 * `stacked` is the home page's single-column list (hover overlay, full-card
 * link), lifted from `src/app/(frontend)/page.tsx` — see `homeParity.test.ts`,
 * which reads both files and fails if they drift.
 * @param hosted - Where the block is rendering (see `hostContext.ts`).
 *
 * @remarks The grid sizes itself against its own container rather than the
 * viewport, so the same block reads as three columns in the route's content
 * column and one in a half column. The stacked variant needs no query
 * container: it is one column at every width by construction — which is also
 * why it is the variant to reach for inside a `column`, exactly as the home
 * page uses it (one item of a two-column desktop grid, holding the list).
 */
export function ArticlesArchiveView({
  articles,
  heading,
  variant = 'grid',
  hosted,
}: {
  articles: ArticleCardItem[]
  heading?: string | null
  variant?: ArticlesArchiveVariant | null
  hosted?: BlockHostContext
}) {
  if (!articles.length) return null

  return (
    <section className={blockRhythmClass(hosted)}>
      {heading ? (
        <h2 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          {heading}
        </h2>
      ) : null}
      {variant === 'stacked' ? (
        // No `mt-8` without a heading: the home page's list starts flush at
        // the top of its column, and that flushness is the parity criterion.
        <div className={cn(heading && 'mt-8', 'flex flex-col gap-16')}>
          {articles.map((article) => (
            <StackedArticle key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <>
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
        </>
      )}
    </section>
  )
}

/**
 * One row of the home page's article list: the hover overlay, the full-card
 * link, and the icon that shifts on hover — copied element for element from
 * the route's `Article` function.
 *
 * @remarks Byte-identical duplication is the point, not an accident. The
 * route keeps its own copy until #42 flips the home page onto the page
 * builder, and `homeParity.test.ts` asserts the two stay identical in the
 * meantime. The scroll-reveal stagger the route wraps this list in
 * (`ScrollReveal targets="article"`) is *not* reproduced here — it belongs to
 * the page's reveal choreography, not to the list — so #42 has to decide
 * where that wrapper lives.
 */
function StackedArticle({ article }: { article: ArticleCardItem }) {
  return (
    <HoverMotionCard>
      <Card as="article">
        <div
          data-hover-overlay
          className="absolute -inset-x-4 -inset-y-6 z-0 scale-95 bg-zinc-50 opacity-0 transition sm:-inset-x-6 sm:rounded-2xl dark:bg-zinc-800/50"
        />
        <Link
          href={`/articles/${article.slug}`}
          aria-label={`Read article: ${article.title}`}
          className="absolute -inset-x-4 -inset-y-6 z-20 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 sm:-inset-x-6 sm:rounded-2xl dark:focus-visible:ring-teal-400/70"
        />
        <Card.Title>{article.title}</Card.Title>
        <Card.Eyebrow as="time" dateTime={article.date} decorate>
          {formatDate(article.date)}
        </Card.Eyebrow>
        <Card.Description>{article.description}</Card.Description>
        <Card.Cta>
          <span data-hover-icon className="inline-flex items-center">
            Read article
          </span>
        </Card.Cta>
      </Card>
    </HoverMotionCard>
  )
}
