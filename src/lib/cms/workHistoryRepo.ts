import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { CmsWorkHistoryItem } from '@/lib/cms/types'
import type { Media } from '@/payload-types'

const mediaUrl = (m: unknown): string | undefined =>
  m && typeof m === 'object' ? (m as Media).url || undefined : undefined

const toYearLabel = (iso: string) => new Date(iso).getUTCFullYear().toString()

/**
 * Work history for the home-page résumé, from the Payload `work-history`
 * collection (seeded from the Notion planning DB; edited in admin since).
 *
 * @returns `null` when the collection is empty so the home page falls back
 * to its built-in list. Current roles render an evergreen "Present" end.
 */
export const getCmsWorkHistory = unstable_cache(
  async (): Promise<CmsWorkHistoryItem[] | null> => {
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
  },
  ['work-history'],
  { tags: ['work-history'] },
)
