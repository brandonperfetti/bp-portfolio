import type { LinkProps } from 'next/link'

import { getSiteUrl } from '@/lib/site'

type HrefLike = LinkProps['href'] | null | undefined

/**
 * Hosts that are this site whatever host is currently being served.
 *
 * @remarks `127.0.0.1:3000` is here because that is the origin the Playwright
 * suite actually drives (`use.baseURL` is `http://127.0.0.1:3000` —
 * `docs/TESTING.md`, and `next.config.mjs` carries the matching
 * `allowedDevOrigins: ['127.0.0.1']`, #119). Before this set was shared it
 * was missing, so an absolute e2e link read as external.
 */
const STATIC_INTERNAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  'localhost:3000',
  '127.0.0.1',
  '127.0.0.1:3000',
])

/**
 * Is this host part of this site?
 *
 * @remarks THE one place "this site" is decided. Both link consumers read it:
 * this module's {@link isExternalHref} (site chrome, cards, CMS links) and
 * `src/lib/ai/linkSafety.ts` (#144, streamdown's link-safety guard in Corvus
 * replies). They had drifted — the Corvus copy lacked the `:3000` e2e port —
 * which is exactly the failure mode one shared set removes.
 *
 * The configured host comes from {@link getSiteUrl}, the same source of truth
 * behind canonical/OG URLs, so a deploy that moves the site moves this with
 * it and no host is hard-coded twice.
 *
 * Rebuilt per call rather than memoised at module scope: `getSiteUrl()` reads
 * `process.env.NEXT_PUBLIC_SITE_URL`, and memoising froze whatever value
 * happened to exist at module load, which made the behaviour untestable and
 * would silently ignore a late-resolved env. The set is four short strings;
 * this is not a hot path.
 *
 * @param host - A URL `host` (hostname plus port when non-default).
 * @returns True when the host is this site.
 */
export function isInternalHost(host: string): boolean {
  if (STATIC_INTERNAL_HOSTS.has(host)) {
    return true
  }

  try {
    return new URL(getSiteUrl()).host === host
  } catch {
    // Malformed NEXT_PUBLIC_SITE_URL: keep the local defaults above rather
    // than throwing inside a render or a click handler.
    return false
  }
}

function toHrefString(href: HrefLike) {
  if (!href) {
    return undefined
  }

  if (typeof href === 'string') {
    return href
  }

  if (href instanceof URL) {
    return href.toString()
  }

  return typeof href.pathname === 'string' ? href.pathname : undefined
}

export function isExternalHref(href: HrefLike) {
  const value = toHrefString(href)
  if (!value) {
    return false
  }

  if (
    value.startsWith('/') ||
    value.startsWith('#') ||
    value.startsWith('?') ||
    value.startsWith('mailto:') ||
    value.startsWith('tel:')
  ) {
    return false
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false
    }

    return !isInternalHost(url.host)
  } catch {
    return false
  }
}

export function getExternalLinkProps(href: HrefLike) {
  if (!isExternalHref(href)) {
    return {}
  }

  return {
    target: '_blank',
    rel: 'noopener noreferrer',
  } as const
}
