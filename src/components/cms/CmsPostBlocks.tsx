import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { Container } from '@/components/Container'
import type { Post } from '@/payload-types'

const getPostLayout = unstable_cache(
  async (slug: string): Promise<Post['layout'] | null> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'posts',
      draft: false,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      where: { slug: { equals: slug } },
    })
    return docs[0]?.layout ?? null
  },
  ['post-layout'],
  { tags: ['posts'] },
)

/**
 * Below-article CMS block region for `/articles/[slug]`: renders the post's
 * optional `layout` blocks after the article body, so per-article CTAs,
 * newsletter signups, or FAQ sections can be composed in the admin.
 *
 * @remarks Renders at page width (not the prose column) because blocks are
 * full sections. These are layout furniture, not gated body content, so they
 * render for gated posts too — the article body itself stays server-gated.
 *
 * @param slug Post slug (the article page's own slug).
 */
export async function CmsPostBlocks({ slug }: { slug: string }) {
  const layout = await getPostLayout(slug)
  if (!layout?.length) return null
  const meaningful = layout.some((block) => block.blockType !== 'spacer')
  if (!meaningful) return null
  return (
    <Container className="mt-16 sm:mt-20">
      <RenderBlocks blocks={layout} />
    </Container>
  )
}
