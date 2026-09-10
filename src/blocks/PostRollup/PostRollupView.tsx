import Link from 'next/link'

import {
  type ArticleCardItem,
  ArticlesArchiveView,
} from '@/blocks/ArticlesArchive/ArticlesArchiveView'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { formatDate } from '@/lib/formatDate'
import { publicPathFor } from '@/fields/slug/slugPaths'
import { cn } from '@/lib/utils'

/** The three treatments a rollup can render (#152). */
export type PostRollupLayout = 'grid' | 'stacked' | 'compact-list'

/**
 * The compact list's scroll-reveal params — the same `y`/`stagger` the site's
 * other opt-in reveals use, kept as a named constant so the story can read them
 * back rather than re-typing numbers.
 */
export const COMPACT_LIST_REVEAL_PARAMS = {
  targets: 'li',
  y: 12,
  stagger: 0.06,
} as const

/**
 * Post rollup, presentational — owns every pixel and every piece of state the
 * block has (which is none: it is static markup over a resolved list).
 *
 * @param articles - The rolled-up articles, in display order, already limited
 * and sorted by the server component.
 * @param heading - Optional section heading.
 * @param layout - Which treatment to render.
 * @param hosted - Where the block is rendering (see `hostContext.ts`).
 * @param revealOnScroll - Fade the articles in as they scroll into view.
 * Honours reduced motion through the shared `ScrollReveal`.
 *
 * @remarks **`grid` and `stacked` are not reimplemented here.** They render
 * through {@link ArticlesArchiveView}, so a rollup card on a section page and
 * an archive card on the home page are the same element — one card vocabulary,
 * one hover treatment, one focus ring, and no way for the two to drift. Only
 * `compact-list` is this file's own markup, because the site had no dense,
 * dated index before.
 *
 * The compact list is a real `<ul>`/`<li>`: unlike the card treatments, whose
 * items are `<article>` landmarks a screen reader already enumerates, this is a
 * bare row of links and the list semantics are what tell a reader how many
 * there are. Each row is one link with one accessible name (the title plus its
 * date), so the list reads once, not twice.
 */
export function PostRollupView({
  articles,
  heading,
  layout = 'grid',
  hosted,
  revealOnScroll = false,
}: {
  articles: ArticleCardItem[]
  heading?: string | null
  layout?: PostRollupLayout | null
  hosted?: BlockHostContext
  revealOnScroll?: boolean | null
}) {
  // The empty state is the block's own, not a layout's: nothing renders at all,
  // matching `ArticlesArchiveComponent`. A section page whose topic has no
  // published articles yet shows no heading and no empty-list message.
  if (!articles.length) return null

  if (layout !== 'compact-list') {
    return (
      <ArticlesArchiveView
        articles={articles}
        heading={heading}
        variant={layout ?? 'grid'}
        hosted={hosted}
        revealOnScroll={revealOnScroll}
      />
    )
  }

  const list = (
    <ul className={cn(heading && 'mt-6', 'flex flex-col')}>
      {articles.map((article) => (
        <li
          key={article.slug}
          className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-700/40"
        >
          <Link
            href={publicPathFor('posts', article) ?? '#'}
            className="group flex flex-col gap-1 rounded-lg py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 dark:focus-visible:ring-teal-400/70"
          >
            <span className="text-sm font-medium text-zinc-800 group-hover:text-link-accent dark:text-zinc-100">
              {article.title}
            </span>
            <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              {formatDate(article.date)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <section className={blockRhythmClass(hosted)}>
      {heading ? (
        <h2 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          {heading}
        </h2>
      ) : null}
      {revealOnScroll ? (
        <ScrollReveal
          targets={COMPACT_LIST_REVEAL_PARAMS.targets}
          y={COMPACT_LIST_REVEAL_PARAMS.y}
          stagger={COMPACT_LIST_REVEAL_PARAMS.stagger}
        >
          {list}
        </ScrollReveal>
      ) : (
        list
      )}
    </section>
  )
}
