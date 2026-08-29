import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import type { CmsWorkHistoryItem } from '@/lib/cms/types'

const toYearLabel = (iso: string) => new Date(iso).getUTCFullYear().toString()

/**
 * Work history for the home-page résumé, from the Payload `work-history`
 * collection (seeded from the Notion planning DB; edited in admin since).
 *
 * @remarks `'use cache: remote'` so a `work-history` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 * @returns `null` when the collection is empty so the home page falls back
 * to its built-in list. Current roles render an evergreen "Present" end.
 */
export const getCmsWorkHistory = async (): Promise<
  CmsWorkHistoryItem[] | null
> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.workHistory)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'work-history',
    depth: 1,
    limit: 50,
    overrideAccess: false,
    sort: 'sortOrder',
  })
  if (!docs.length) return null
  return docs.map((entry, index) => {
    const isCurrent = Boolean(entry.current) || !entry.endDate
    return {
      company: entry.company,
      title: entry.title,
      logo: mediaUrl(entry.logo),
      start: toYearLabel(entry.startDate),
      end: isCurrent
        ? {
            label: 'Present',
            dateTime: new Date().getFullYear().toString(),
          }
        : toYearLabel(entry.endDate as string),
      current: isCurrent,
      order: index,
    }
  })
}
