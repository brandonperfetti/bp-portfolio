import type { Page } from '@/payload-types'
import {
  resolveShareTargetIds,
  type ShareTargetId,
} from '@/lib/share/shareTargets'

/**
 * Resolves the effective share-target ids for a Pages-collection document,
 * mirroring `resolveArticleShareTargetIds` for the page-builder side.
 *
 * @param page - The page's per-entry share configuration (`disableSharing` kill
 * switch plus the `add`/`remove` overrides), read straight off the payload
 * `Page` (nullable payload fields are coalesced to empty here).
 * @param globalShareTargets - The site-wide enabled ids (SiteSettings default).
 * @returns The effective {@link ShareTargetId} set, empty when the page's
 * `disableSharing` kill switch is set.
 *
 * @remarks A pure, client-safe function so the RSC content-page routes resolve
 * ids on the server and hand the plain `string[]` across the server→client
 * boundary to `ShareButton` — the icons/intent builders never cross it.
 */
export function resolvePageShareTargetIds(
  page: Pick<Page, 'disableSharing' | 'shareTargetsAdd' | 'shareTargetsRemove'>,
  globalShareTargets: readonly string[],
): ShareTargetId[] {
  if (page.disableSharing) return []
  return resolveShareTargetIds(
    globalShareTargets,
    page.shareTargetsAdd ?? [],
    page.shareTargetsRemove ?? [],
  )
}
