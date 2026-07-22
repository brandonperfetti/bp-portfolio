import type { CmsWorkHistoryItem } from '@/lib/cms/types'

/**
 * Work history for the home-page résumé.
 *
 * @remarks v3 sourced this from Notion; v4 renders the component's built-in
 * list. TODO(brandon): add a WorkHistory collection (or model as Pages
 * blocks) if editing this from the CMS becomes worth it.
 */
export async function getCmsWorkHistory(): Promise<
  CmsWorkHistoryItem[] | null
> {
  return null
}
