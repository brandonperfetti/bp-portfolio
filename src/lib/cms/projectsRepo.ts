import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import type { CmsEntityItem } from '@/lib/cms/types'

/**
 * Projects from the Payload `projects` collection (was Notion in v3),
 * mapped to the v3 `CmsEntityItem` shape the /projects page renders.
 *
 * @remarks `'use cache: remote'` so a `projects` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 * @returns `null` when the collection is empty so the page falls back to its
 * hard-coded v3 project list until content is populated.
 */
export const getCmsProjects = async (): Promise<CmsEntityItem[] | null> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.projects)
  cacheLife('cmsContent')
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
}
