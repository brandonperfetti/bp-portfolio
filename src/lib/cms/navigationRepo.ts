import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import type { CmsNavigationItem } from '@/lib/cms/types'
import { HEADER_NAV_LINKS } from '@/lib/navigation'

const DEFAULT_NAVIGATION: CmsNavigationItem[] = HEADER_NAV_LINKS.map(
  (link, index) => ({
    href: link.href,
    label: link.label,
    order: index,
    showInNav: true,
  }),
)

/**
 * Header navigation from the Payload `navigation` global (was Notion in v3),
 * falling back to the v3 hard-coded nav so an empty CMS still renders.
 */
export const getCmsNavigation = unstable_cache(
  async (): Promise<CmsNavigationItem[]> => {
    const payload = await getPayload({ config: configPromise })
    const nav = await payload.findGlobal({ slug: 'navigation', depth: 0 })
    const links = nav?.headerLinks || []
    if (!links.length) return DEFAULT_NAVIGATION
    return links.map((link, index) => ({
      href: link.href,
      label: link.label,
      order: index,
      showInNav: true,
    }))
  },
  ['navigation'],
  { tags: ['global_navigation'] },
)
