import {
  type BlockHostContext,
  type BlockHostDocument,
} from '@/blocks/hostContext'
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
 * @param props - The stored block, plus `hosted`: where it is rendering, and
 * `hostDoc`: the document it was composed on.
 *
 * @remarks **This file decides the query and nothing else** — the
 * `ArticlesArchive` division of labour. It resolves one of the two sources to a
 * plain array of card summaries and hands it to {@link PostRollupView}, which
 * owns every pixel and every story.
 *
 * Both sources render `null` when nothing resolves, and that is deliberate at
 * *two* levels: an unresolvable source never reaches the database at all (there
 * is no id to query with, and a rollup with no source is not a rollup over
 * everything), and an empty result set renders nothing rather than an empty
 * heading — the same empty-state contract `ArticlesArchiveComponent` has.
 *
 * ## The empty page picker (#177)
 *
 * #152's design said an empty `page` picker should roll up "the posts placed
 * under the page this block is on". That is now what it does, on a **page**
 * host: `hostDoc` carries the hosting document's collection and id, so the
 * block falls back to `hostDoc.id` when no page is chosen. A chosen page
 * always wins — the picker is an override, not a hint.
 *
 * **On a Post host the empty picker still rolls up nothing**, which is a
 * decision and not a gap. The block is registered on Posts as well as Pages,
 * and "the posts placed under the page this block is on" has no meaning when
 * the host is a post: a post is not a parent of posts. Two other readings were
 * considered and declined as larger than the design's own wording — rolling up
 * the *siblings* under the post's parent (a different feature, and one that
 * would surprise an editor who wrote "the page this block is on"), and hiding
 * the `by-placement` source on Posts entirely (a schema-level change, with a
 * migration, to remove a source that already works there when a page *is*
 * picked). What a Post host gets instead is what it got before: an unset
 * picker resolves to nothing, the same empty branch an unset category takes.
 *
 * The fallback is read from a prop, never from `headers()` — a rollup stays
 * prerenderable, and the page it rolls up is fixed at composition time rather
 * than at request time.
 */
export async function PostRollupComponent(
  props: PostRollupBlock & {
    hosted?: BlockHostContext
    hostDoc?: BlockHostDocument
  },
) {
  const sort = (props.sort ?? 'newest') as PostRollupSort
  const limit = props.limit ?? 6

  const articles = await resolveArticles(props, props.hostDoc, sort, limit)
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

/**
 * The page a `by-placement` rollup should query: the one the editor picked,
 * or — when the picker is empty — the page the block is placed on.
 *
 * @remarks Returns `null` for a Post host with an empty picker, which is what
 * keeps a rollup on an article rendering nothing rather than guessing at a
 * page id from the wrong collection. The collection check is the whole reason
 * `BlockHostDocument` carries a collection at all: `pages` id 7 and `posts`
 * id 7 are different documents, and `getPostRollupByPlacement` would happily
 * query either.
 */
function placementPageId(
  page: PostRollupBlock['page'],
  hostDoc: BlockHostDocument | undefined,
): number | null {
  const chosen = relationId(page)
  if (chosen !== null) return chosen
  return hostDoc?.collection === 'pages' ? hostDoc.id : null
}

/** Resolve the block's source to the articles it names, or nothing. */
async function resolveArticles(
  props: PostRollupBlock,
  hostDoc: BlockHostDocument | undefined,
  sort: PostRollupSort,
  limit: number,
) {
  if (props.source === 'by-placement') {
    const pageId = placementPageId(props.page, hostDoc)
    return pageId === null ? [] : getPostRollupByPlacement(pageId, sort, limit)
  }
  const categoryId = relationId(props.category)
  return categoryId === null
    ? []
    : getPostRollupByCategory(categoryId, sort, limit)
}
