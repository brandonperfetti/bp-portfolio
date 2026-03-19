export function canonicalizeArticleUrl(
  siteUrl: string,
  slug: string,
  candidate?: string,
) {
  const normalizedSiteUrl = siteUrl.endsWith('/')
    ? siteUrl.slice(0, -1)
    : siteUrl
  const fallback = `${normalizedSiteUrl}/articles/${slug}`
  if (!candidate?.trim()) {
    return fallback
  }

  const site = new URL(normalizedSiteUrl)
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
