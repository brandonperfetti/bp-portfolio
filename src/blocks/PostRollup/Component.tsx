import { type BlockHostContext } from '@/blocks/hostContext'
import { PostRollupView } from '@/blocks/PostRollup/PostRollupView'
import {
  getPostRollupByCategory,
  getPostRollupByPlacement,
  type PostRollupSort,
} from '@/lib/cms/articlesRepo'
import type { PostRollupBlock } from '@/payload-types'

/**
 * The id behind a `hasMany: false` relationship value, which Payload hands
 * back either as a bare id or as the populated document depending on depth.
 */
const relationId = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const { id } = value as { id?: unknown }
    return typeof id === 'number' ? id : null
  }
  return null
}

/**
 * Post rollup (#152): a section page's own articles. Server component.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 *
 * @remarks **This file decides the query and nothing else** — the
 * `ArticlesArchive` division of labour. It resolves one of the two sources to a
 * plain array of card summaries and hands it to {@link PostRollupView}, which
 * owns every pixel and every story.
 *
 * Both sources render `null` when nothing resolves, and that is deliberate at
 * *two* levels: an unset relationship never reaches the database at all (there
 * is no id to query with, and a rollup with no source is not a rollup over
 * everything), and an empty result set renders nothing rather than an empty
 * heading — the same empty-state contract `ArticlesArchiveComponent` has.
 *
 * The design's "leave the page empty to roll up the page this block is on"
 * fallback is **not** implemented, and the field description says so.
 * `RenderBlocks` dispatches a block with no identity for the hosting document
 * (`hostContext.ts` carries `root` | `column` and nothing more), so answering
 * "which page am I on?" needs new plumbing through the dispatcher and every one
 * of its call sites — out of this change's scope, and worth doing once rather
 * than smuggling a `headers()` read into a block that must stay prerenderable.
 */
export async function PostRollupComponent(
  props: PostRollupBlock & { hosted?: BlockHostContext },
) {
  const sort = (props.sort ?? 'newest') as PostRollupSort
  const limit = props.limit ?? 6

  const articles = await resolveArticles(props, sort, limit)
  if (!articles.length) return null

  return (
    <PostRollupView
      articles={articles.map((article) => ({
        slug: article.slug,
        // Placement (#153) — the card's href is built from it.
        path: article.path,
        title: article.title,
        date: article.date,
        description: article.description,
      }))}
      heading={props.heading}
      layout={props.layout}
      hosted={props.hosted}
      revealOnScroll={props.revealOnScroll}
    />
  )
}

/** Resolve the block's source to the articles it names, or nothing. */
async function resolveArticles(
  props: PostRollupBlock,
  sort: PostRollupSort,
  limit: number,
) {
  if (props.source === 'by-placement') {
    const pageId = relationId(props.page)
    return pageId === null ? [] : getPostRollupByPlacement(pageId, sort, limit)
  }
  const categoryId = relationId(props.category)
  return categoryId === null
    ? []
    : getPostRollupByCategory(categoryId, sort, limit)
}
