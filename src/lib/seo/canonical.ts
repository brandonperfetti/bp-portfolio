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

  const trimmed = candidate.trim()

  if (trimmed.startsWith('/')) {
    return `${normalizedSiteUrl}${trimmed}`
  }

  try {
    const site = new URL(normalizedSiteUrl)
    const parsed = new URL(trimmed)
    if (parsed.host !== site.host) {
      return fallback
    }

    // Canonical should represent the stable article URL and never include hash.
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return fallback
  }
}
