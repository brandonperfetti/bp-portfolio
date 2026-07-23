import Link from 'next/link'

import { Button } from '@/components/ui/button'
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
 */
export function resolveCmsHref(link: LinkShape | null | undefined): string {
  if (!link) return '#'
  if (link.type === 'reference' && link.reference) {
    const { relationTo, value } = link.reference
    const slug = typeof value === 'object' ? value.slug : null
    if (!slug) return '#'
    return relationTo === 'posts' ? `/articles/${slug}` : `/${slug}`
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
