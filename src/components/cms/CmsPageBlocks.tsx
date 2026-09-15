import { RenderBlocks } from '@/blocks/RenderBlocks'
import { getPageLayoutBySlug } from '@/lib/cms/layoutsRepo'

/**
 * CMS block region for code-owned routes (hybrid pages): renders the
 * route's Pages doc `layout` blocks, so admin-composed sections can be
 * appended to bespoke pages without touching code.
 *
 * @remarks Spacer-only layouts (the seed default) are treated as empty so
 * routes don't grow stray whitespace before any real blocks are added.
 *
 * This is one of the three readers that already hold the hosting document, so
 * it is one of the three that can name it: the Pages doc's id goes down with
 * the blocks as `hostDoc`, which is how a block placed on `/uses` can ask
 * about `/uses` without reading the request (#177). The local is `hostPage`
 * and deliberately not `hosted`: `hosted` is taken, and means the *position*
 * half of block context (`'root' | 'column'`, `src/blocks/hostContext.ts`),
 * not the document (#199).
 *
 * @param slug - Pages collection slug for this route (`home` for `/`).
 * @param exclude - Block types the route consumes in a dedicated slot instead
 * (home renders its `photoStrip` block under the hero, not down here).
 */
export async function CmsPageBlocks({
  slug,
  exclude,
}: {
  slug: string
  exclude?: string[]
}) {
  const hostPage = await getPageLayoutBySlug(slug)
  const layout = hostPage?.layout
  if (!hostPage || !layout?.length) return null
  const blocks = exclude?.length
    ? layout.filter((block) => !exclude.includes(block.blockType))
    : layout
  const meaningful = blocks.some((block) => block.blockType !== 'spacer')
  if (!meaningful) return null
  return (
    <RenderBlocks
      blocks={blocks}
      hostDoc={{ collection: 'pages', id: hostPage.id }}
    />
  )
}
