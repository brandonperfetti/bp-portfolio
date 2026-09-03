import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { publicPathFor } from '@/fields/slug/slugPaths'
import { getExternalLinkProps } from '@/lib/link-utils'
import type { Page, Post } from '@/payload-types'

type LinkShape = {
  type?: 'reference' | 'custom' | null
  newTab?: boolean | null
  reference?: {
    relationTo: 'pages' | 'posts'
    value: Page | Post | number
  } | null
  url?: string | null
  label?: string | null
  appearance?: 'default' | 'outline' | null
}

/**
 * Resolves a Payload link group (internal reference or custom URL) into an
 * href. Internal posts render under `/articles` (v3 URL contract).
 *
 * @remarks Resolves through `publicPathFor`, which is load-bearing under
 * hierarchy: every CMS-authored link to a placed page would otherwise point at
 * `/`+slug and 404, and a link to the root page would point at `/home` rather
 * than `/` (#148).
 *
 * The reference must be **populated** for a nested link to resolve — an
 * unpopulated `value` is a bare id with no slug and still yields `'#'`, exactly
 * as before.
 */
export function resolveCmsHref(link: LinkShape | null | undefined): string {
  if (!link) return '#'
  if (link.type === 'reference' && link.reference) {
    const { relationTo, value } = link.reference
    if (typeof value !== 'object' || value === null) return '#'
    return publicPathFor(relationTo, value) ?? '#'
  }
  return link.url || '#'
}

/**
 * Link renderer for CMS link fields (heros, CTA blocks, content columns).
 * `appearance` maps to shadcn Button variants; without one it renders a
 * plain accent link.
 */
export function CMSLink({
  link,
  className,
}: {
  link: LinkShape | null | undefined
  className?: string
}) {
  if (!link?.label) return null
  const href = resolveCmsHref(link)
  const external = link.type === 'custom' || link.newTab
  const externalProps = external ? getExternalLinkProps(href) : {}
  const target = link.newTab ? { target: '_blank', rel: 'noopener' } : {}

  if (link.appearance) {
    return (
      <Button
        asChild
        variant={link.appearance === 'outline' ? 'outline' : 'default'}
        className={className}
      >
        <Link href={href} {...externalProps} {...target}>
          {link.label}
        </Link>
      </Button>
    )
  }

  return (
    <Link
      href={href}
      {...externalProps}
      {...target}
      className={
        className ||
        'font-medium text-teal-700 transition hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300'
      }
    >
      {link.label}
    </Link>
  )
}
