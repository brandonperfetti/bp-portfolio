import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import type { CmsEntityItem } from '@/lib/cms/types'

/** Display labels for the collection's lowercase `category` select values. */
const CATEGORY_LABELS: Record<string, string> = {
  frontend: 'Frontend',
  framework: 'Framework',
  backend: 'Backend',
  testing: 'Testing',
  data: 'Data',
  tooling: 'Tooling',
  ai: 'AI',
}

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
      sort: 'sortOrder',
    })
    if (!docs.length) return null
    return docs.map((t, index) => ({
      slug: String(t.id),
      name: t.name,
      description: t.notes || '',
      logo: mediaUrl(t.logo),
      link: t.url ? { href: t.url, label: t.name } : undefined,
      category: t.category
        ? CATEGORY_LABELS[t.category] || t.category
        : undefined,
      proficiency: t.proficiency || undefined,
      githubRepo: t.githubRepo || undefined,
      order: index,
      updatedAt: t.updatedAt,
    }))
  },
  ['tech-stack'],
  { tags: ['tech-stack'] },
)
