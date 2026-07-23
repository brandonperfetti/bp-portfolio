import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { Page } from '@/payload-types'

const getPageLayout = unstable_cache(
  async (slug: string): Promise<Page['layout'] | null> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'pages',
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: { slug: { equals: slug } },
    })
    return docs[0]?.layout ?? null
  },
  ['page-layout'],
  { tags: ['pages'] },
)

/**
 * CMS block region for code-owned routes (hybrid pages): renders the
 * route's Pages doc `layout` blocks, so admin-composed sections can be
 * appended to bespoke pages without touching code.
 *
 * @remarks Spacer-only layouts (the seed default) are treated as empty so
 * routes don't grow stray whitespace before any real blocks are added.
 *
 * @param slug Pages collection slug for this route (`home` for `/`).
 */
export async function CmsPageBlocks({ slug }: { slug: string }) {
  const layout = await getPageLayout(slug)
  if (!layout?.length) return null
  const meaningful = layout.some((block) => block.blockType !== 'spacer')
  if (!meaningful) return null
  return <RenderBlocks blocks={layout} />
}
