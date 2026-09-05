import { publicPathFor } from '@/fields/slug/slugPaths'
import type { CmsTopic } from '@/lib/cms/types'

/**
 * Where a topic chip on an article page should link (#151).
 *
 * @param topic - The topic, as {@link CmsTopic}.
 * @returns The topic's section home when it has a published one, otherwise the
 * pre-filtered `/articles` view.
 *
 * @remarks The fallback is the point of the function, not its edge case: most
 * topics have no home and are never meant to (#136 Direction extended, item
 * 5), and a topic whose home was unpublished or deleted arrives here with no
 * `sectionPath` at all — so degrading to the filtered view is the ordinary
 * path, and the resolver has no failing branch to get wrong.
 *
 * Routed through `publicPathFor` rather than string concatenation so a section
 * home spells its URL the way the catch-all, the sitemap and `CMSLink` do —
 * including the root page, which is `/` and not `/home`.
 *
 * **Why this is its own module rather than a function in `articlesRepo`.**
 * `ArticleMeta` renders the chips and therefore has to call this, and
 * `ArticleMeta` has Storybook stories that run in the browser-mode Vitest
 * project. `articlesRepo` imports `getPayload` and `@payload-config`; reaching
 * this resolver through it would drag the Payload Local API into a browser
 * bundle. The resolver is pure — a `CmsTopic` in, a string out — so it belongs
 * on the safe side of that boundary. `articlesRepo` re-exports it, so the
 * server side still has one import site for the topic vocabulary.
 */
export function resolveTopicHref(topic: CmsTopic): string {
  const sectionHref = topic.sectionPath
    ? publicPathFor('pages', { path: topic.sectionPath })
    : null
  return sectionHref ?? `/articles?topic=${encodeURIComponent(topic.title)}`
}
