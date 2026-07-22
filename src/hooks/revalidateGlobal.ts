import type { GlobalAfterChangeHook } from 'payload'

import { revalidateTag } from 'next/cache'

/**
 * Build an afterChange hook that revalidates a global's cache tag.
 *
 * @param slug - The global slug; pages fetch globals with `global_<slug>` tags.
 */
export const revalidateGlobal =
  (slug: string): GlobalAfterChangeHook =>
  ({ doc, req: { payload, context } }) => {
    if (!context.disableRevalidate) {
      payload.logger.info(`Revalidating global: ${slug}`)
      revalidateTag(`global_${slug}`, 'max')
    }
    return doc
  }
