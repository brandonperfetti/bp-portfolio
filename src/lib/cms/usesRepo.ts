import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { CmsUseSection } from '@/lib/cms/types'

const CATEGORY_LABELS: Record<string, string> = {
  workstation: 'Workstation',
  development: 'Development',
  design: 'Design',
  productivity: 'Productivity',
  ai: 'AI',
}

/**
 * Uses entries from the Payload `uses` collection (was Notion in v3),
 * grouped into the v3 `CmsUseSection[]` shape by category.
 *
 * @returns `null` when empty so /uses falls back to hard-coded v3 content.
 */
export const getCmsUses = unstable_cache(
  async (): Promise<CmsUseSection[] | null> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'uses',
      depth: 0,
      limit: 500,
      overrideAccess: false,
      sort: 'createdAt',
    })
    if (!docs.length) return null

    const sections = new Map<string, CmsUseSection>()
    docs.forEach((u, index) => {
      const key = u.category || 'other'
      if (!sections.has(key)) {
        sections.set(key, { title: CATEGORY_LABELS[key] || 'Other', items: [] })
      }
      sections.get(key)!.items.push({
        slug: String(u.id),
        name: u.title,
        description: u.description || '',
        link: u.link ? { href: u.link, label: u.title } : undefined,
        order: index,
        updatedAt: u.updatedAt,
      })
    })
    return Array.from(sections.values())
  },
  ['uses'],
  { tags: ['uses'] },
)
