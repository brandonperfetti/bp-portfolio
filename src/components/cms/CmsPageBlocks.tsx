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
  const layout = await getPageLayoutBySlug(slug)
  if (!layout?.length) return null
  const blocks = exclude?.length
    ? layout.filter((block) => !exclude.includes(block.blockType))
    : layout
  const meaningful = blocks.some((block) => block.blockType !== 'spacer')
  if (!meaningful) return null
  return <RenderBlocks blocks={blocks} />
}
