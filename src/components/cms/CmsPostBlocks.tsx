import { RenderBlocks } from '@/blocks/RenderBlocks'
import { Container } from '@/components/Container'
import { getPostLayoutBySlug } from '@/lib/cms/layoutsRepo'

/**
 * Below-article CMS block region for `/articles/[slug]`: renders the post's
 * optional `layout` blocks after the article body, so per-article CTAs,
 * newsletter signups, or FAQ sections can be composed in the admin.
 *
 * @remarks Renders at page width (not the prose column) because blocks are
 * full sections. These are layout furniture, not gated body content, so they
 * render for gated posts too — the article body itself stays server-gated.
 *
 * The post's id goes down with the blocks as `hostDoc`, naming the hosting
 * document for any block that asks (#177). It is a `posts` host, and blocks
 * that only make sense on a page are expected to say so rather than to guess:
 * the post rollup, for one, renders nothing here when its page picker is
 * empty, because "the posts placed under the page this block is on" has no
 * meaning under a post. The local is `hostPost` and deliberately not
 * `hosted`: `hosted` is taken, and means the *position* half of block context
 * (`'root' | 'column'`, `src/blocks/hostContext.ts`), not the document (#199).
 *
 * @param slug - Post slug (the article page's own slug).
 */
export async function CmsPostBlocks({ slug }: { slug: string }) {
  const hostPost = await getPostLayoutBySlug(slug)
  const layout = hostPost?.layout
  if (!hostPost || !layout?.length) return null
  const meaningful = layout.some((block) => block.blockType !== 'spacer')
  if (!meaningful) return null
  return (
    <Container className="mt-16 sm:mt-20">
      <RenderBlocks
        blocks={layout}
        hostDoc={{ collection: 'posts', id: hostPost.id }}
      />
    </Container>
  )
}
