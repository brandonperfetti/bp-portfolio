import { publicPathFor } from '@/fields/slug/slugPaths'

/**
 * The canonical URL for an article: the editor's candidate when it is a
 * same-origin URL, else the article's own public URL.
 *
 * @param siteUrl - The site's canonical origin.
 * @param slug - The article's slug.
 * @param candidate - An editor-supplied canonical, which may be absolute,
 *   root-relative, off-origin, or absent.
 *
 * @remarks The fallback is built by `publicPathFor`, not by a local
 * `/articles/${slug}` template — one of the eleven hand-built copies #148
 * collapsed. Behaviour is unchanged for every post: `publicPathFor('posts', …)`
 * is exactly `/articles/<slug>`, the preserved v3 shape.
 */
export function canonicalizeArticleUrl(
  siteUrl: string,
  slug: string,
  candidate?: string,
) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')
  const fallback = `${normalizedSiteUrl}${publicPathFor('posts', { slug })}`
  if (!candidate?.trim()) {
    return fallback
  }

  let site: URL
  try {
    site = new URL(normalizedSiteUrl)
  } catch {
    return fallback
  }
  const trimmed = candidate.trim()

  try {
    const parsed = trimmed.startsWith('/')
      ? new URL(trimmed, site)
      : new URL(trimmed)

    if (parsed.host !== site.host || parsed.protocol !== site.protocol) {
      return fallback
    }

    // Canonical should represent the stable article URL and never include hash.
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return fallback
  }
}
