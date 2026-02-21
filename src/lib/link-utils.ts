import type { LinkProps } from 'next/link'

import { getSiteUrl } from '@/lib/site'

type HrefLike = LinkProps['href'] | null | undefined

const INTERNAL_HOSTS = (() => {
  const hosts = new Set(['localhost:3000', 'localhost', '127.0.0.1'])

  try {
    hosts.add(new URL(getSiteUrl()).host)
  } catch {
    // No-op if NEXT_PUBLIC_SITE_URL is malformed; keep local defaults.
  }

  return hosts
})()

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

    return !INTERNAL_HOSTS.has(url.host)
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
