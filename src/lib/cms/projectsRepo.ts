import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { CmsEntityItem } from '@/lib/cms/types'
import type { Media } from '@/payload-types'

const mediaUrl = (m: unknown): string | undefined =>
  m && typeof m === 'object' ? (m as Media).url || undefined : undefined

/**
 * Projects from the Payload `projects` collection (was Notion in v3),
 * mapped to the v3 `CmsEntityItem` shape the /projects page renders.
 *
 * @returns `null` when the collection is empty so the page falls back to its
 * hard-coded v3 project list until content is populated.
 */
export const getCmsProjects = unstable_cache(
  async (): Promise<CmsEntityItem[] | null> => {
    const payload = await getPayload({ config: configPromise })
    const { docs } = await payload.find({
      collection: 'projects',
      depth: 1,
      limit: 200,
      overrideAccess: false,
      sort: 'sortOrder',
    })
    if (!docs.length) return null
    return docs.map((p, index) => ({
      slug: p.slug || String(p.id),
      name: p.title,
      description: p.description || '',
      logo: mediaUrl(p.logo),
      link: p.link
        ? { href: p.link, label: p.linkLabel || new URL(p.link).hostname }
        : undefined,
      order: index,
      updatedAt: p.updatedAt,
    }))
  },
  ['projects'],
  { tags: ['projects'] },
)
