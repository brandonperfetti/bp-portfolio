import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { CmsEntityItem } from '@/lib/cms/types'
import type { Media } from '@/payload-types'

const mediaUrl = (m: unknown): string | undefined =>
  m && typeof m === 'object' ? (m as Media).url || undefined : undefined

/**
 * Tech stack from the Payload `tech-stack` collection (was Notion in v3),
 * mapped to the v3 `CmsEntityItem` shape shared by /tech and /uses.
 *
 * @returns `null` when empty so pages fall back to hard-coded v3 content.
 */
export const getCmsTech = unstable_cache(
  async (): Promise<CmsEntityItem[] | null> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'tech-stack',
      depth: 1,
      limit: 500,
      overrideAccess: false,
      sort: 'name',
    })
    if (!docs.length) return null
    return docs.map((t, index) => ({
      slug: String(t.id),
      name: t.name,
      description: t.notes || '',
      logo: mediaUrl(t.logo),
      link: t.url ? { href: t.url, label: t.name } : undefined,
      category: t.category || undefined,
      order: index,
      updatedAt: t.updatedAt,
    }))
  },
  ['tech-stack'],
  { tags: ['tech-stack'] },
)
