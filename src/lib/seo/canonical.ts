import { publicPathFor, type PathableDoc } from '@/fields/slug/slugPaths'

/**
 * The canonical URL for an article: the editor's candidate when it is a
 * same-origin URL, else the article's own public URL.
 *
 * @param siteUrl - The site's canonical origin.
 * @param article - The article, or any projection carrying `slug` and (for a
 *   placed article) `path`.
 * @param candidate - An editor-supplied canonical, which may be absolute,
 *   root-relative, off-origin, or absent.
 *
 * @remarks The fallback is built by `publicPathFor`, not by a local
 * `/articles/${slug}` template — one of the eleven hand-built copies #148
 * collapsed. Behaviour is unchanged for every unplaced post:
 * `publicPathFor('posts', { slug })` is exactly `/articles/<slug>`, the
 * preserved v3 shape.
 *
 * **This takes the document, not a slug (#153).** A placed article's canonical
 * is its placed path, and a slug alone cannot name `/work/brytecore` — so a
 * `slug: string` parameter would have made the one URL a search engine is told
 * to index the one URL that 308s. The narrower signature is what makes that a
 * type error instead of a silent SEO regression.
 */
export function canonicalizeArticleUrl(
  siteUrl: string,
  article: PathableDoc,
  candidate?: string,
) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')
  const fallback = `${normalizedSiteUrl}${publicPathFor('posts', article)}`
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
