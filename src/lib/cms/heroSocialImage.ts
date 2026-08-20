import { mediaUrl } from '@/lib/cms/mediaUrl'

/**
 * A page's hero image is a valid social/OG fallback only when the hero actually
 * renders one — the `standard` type. Shader, blank, and none heroes display no
 * image, so any `hero.media` they carry (typically stale/seeded, and hidden in
 * the admin where the Media field shows only for `standard`) must not become the
 * share card. Those pages fall through to the site-default OG image instead of
 * surfacing an image the page never shows.
 *
 * @see src/lib/cms/pageMetadata.ts — `resolvePageSocialImage` consumes this
 *   through `CmsPageContent.heroImage`.
 */
export const heroSocialImageUrl = (
  hero: { media?: unknown; type?: string | null } | null | undefined,
): string | undefined =>
  hero?.type === 'standard' ? mediaUrl(hero.media) : undefined
