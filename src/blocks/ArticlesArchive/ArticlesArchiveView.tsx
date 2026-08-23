import Link from 'next/link'

import { Card } from '@/components/Card'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { formatDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

/** The two article-list treatments that exist on the site today. */
export type ArticlesArchiveVariant = 'grid' | 'stacked'

/**
 * The homepage's stacked-list scroll-reveal params, lifted from the route's
 * `ScrollReveal targets="article" y={20} stagger={0.08}` around its article
 * list. `homeParity.test.ts` reads these back out of the homepage source so
 * they can't drift from the treatment they reproduce.
 *
 * @remarks Fixed capability, not editor-tunable: the numbers are Home's. The
 * wrapper the `StackedArticle` doc comment says #42 has to decide on lives
 * here now, opt-in and off by default.
 */
export const STACKED_REVEAL_PARAMS = {
  targets: 'article',
  y: 20,
  stagger: 0.08,
} as const

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
 * @param revealOnScroll - When true, wrap the stacked list in the homepage's
 * `ScrollReveal` (see {@link STACKED_REVEAL_PARAMS}) so the articles stagger
 * into view. Off by default, and only the stacked variant honors it — the
 * grid has its own reveal story. Default-off emits no `ScrollReveal` at all.
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
  revealOnScroll = false,
}: {
  articles: ArticleCardItem[]
  heading?: string | null
  variant?: ArticlesArchiveVariant | null
  hosted?: BlockHostContext
  revealOnScroll?: boolean | null
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
        <StackedList
          articles={articles}
          heading={heading}
          revealOnScroll={Boolean(revealOnScroll)}
        />
      ) : (
        <>
          <div className="@container mt-8">
            <div className="grid grid-cols-1 gap-10 @md:grid-cols-2 @3xl:grid-cols-3">
              {articles.map((article) => (
                <ArticleCard key={article.slug} article={article} />
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
 * The stacked list itself: one article per row at the homepage's `gap-16`,
 * flush to the top of its column unless a heading precedes it. Optionally
 * wrapped in the homepage's `ScrollReveal` so the rows stagger into view.
 *
 * @remarks The wrapper is opt-in and, when off, absent entirely — no
 * `ScrollReveal` div in the tree — so the default stays byte-identical to the
 * list this block has always rendered. When on, the reveal targets the
 * `article` elements the rows render, exactly as the route does.
 */
function StackedList({
  articles,
  heading,
  revealOnScroll,
}: {
  articles: ArticleCardItem[]
  heading?: string | null
  revealOnScroll: boolean
}) {
  // No `mt-8` without a heading: the home page's list starts flush at the top
  // of its column, and that flushness is the parity criterion.
  const list = (
    <div className={cn(heading && 'mt-8', 'flex flex-col gap-16')}>
      {articles.map((article) => (
        <ArticleCard key={article.slug} article={article} />
      ))}
    </div>
  )

  if (!revealOnScroll) return list

  return (
    <ScrollReveal
      targets={STACKED_REVEAL_PARAMS.targets}
      y={STACKED_REVEAL_PARAMS.y}
      stagger={STACKED_REVEAL_PARAMS.stagger}
    >
      {list}
    </ScrollReveal>
  )
}

/**
 * One article card — the whole-card hover treatment (hover overlay, full-card
 * link, and the "Read article" icon that shifts on hover). Shared by BOTH the
 * grid and stacked variants so every article card on the site reads and
 * behaves identically; the variants differ only in their container (a
 * responsive grid vs. a `gap-16` column) and the grid's "Browse all articles"
 * link. The whole card is the link — the title is a plain heading — matching
 * the page-builder home page's list, whose hover markers `homeParity.test.ts`
 * pins.
 */
function ArticleCard({ article }: { article: ArticleCardItem }) {
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
