import Link from 'next/link'

import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import {
  SOCIAL_PLATFORM_ICONS,
  type ResolvedSocialLink,
} from '@/blocks/SocialLinks/platforms'
import { getExternalLinkProps } from '@/lib/link-utils'
import { cn } from '@/lib/utils'

/** The two treatments that exist on the site today. */
export type SocialLinksVariant = 'iconRow' | 'labeledList'

/**
 * Extra classes on a labeled-list row, by position — About's list spacing,
 * lifted verbatim: rows are flush, each following row gets `mt-4`, and the
 * mail row is set apart by a rule with generous padding on both sides.
 */
const LABELED_ROW_SPACING = {
  first: '',
  subsequent: 'mt-4',
  divider: 'mt-8 border-t border-zinc-100 pt-8 dark:border-zinc-700/40',
} as const

/**
 * Social links, presentational: takes links already resolved to plain data
 * (see `platforms.ts`) so the whole visual surface is reachable from a story
 * without a database.
 *
 * @param links - Profile links in display order.
 * @param variant - `iconRow` reproduces the row under the home hero;
 * `labeledList` reproduces the about-page rail.
 * @param email - Address for the divider row; only the labeled list has one.
 * @param hosted - Where the block is rendering (see `hostContext.ts`).
 * @remarks No grid, so no query container: both treatments are a single
 * flow — a wrapping flex row and a stacked list — that fill whatever width
 * they are given at every size, in a column or at layout root.
 */
export function SocialLinksView({
  links,
  variant,
  email,
  hosted,
}: {
  links: ResolvedSocialLink[]
  variant: SocialLinksVariant
  email?: string | null
  hosted?: BlockHostContext
}) {
  const emailLink: ResolvedSocialLink | null =
    variant === 'labeledList' && email
      ? { href: `mailto:${email}`, label: email, platform: 'email' }
      : null

  if (!links.length && !emailLink) return null

  if (variant === 'iconRow') {
    return (
      <section className={blockRhythmClass(hosted)}>
        <div className="flex flex-wrap gap-6">
          {links.map((link) => {
            const Icon = SOCIAL_PLATFORM_ICONS[link.platform]
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-label={link.label}
                className="group -m-1 rounded-md p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:focus-visible:ring-teal-400/80"
                {...getExternalLinkProps(link.href)}
              >
                <Icon className="h-6 w-6 fill-zinc-500 transition group-hover:fill-zinc-600 dark:fill-zinc-400 dark:group-hover:fill-zinc-300" />
              </Link>
            )
          })}
        </div>
      </section>
    )
  }

  const rows: Array<{ link: ResolvedSocialLink; spacing: string }> = [
    ...links.map((link, index) => ({
      link,
      spacing:
        index === 0
          ? LABELED_ROW_SPACING.first
          : LABELED_ROW_SPACING.subsequent,
    })),
    ...(emailLink
      ? [
          {
            link: emailLink,
            // A rule with nothing above it is just a stray line, so the mail
            // row only becomes a divider when it actually divides something.
            spacing: links.length
              ? LABELED_ROW_SPACING.divider
              : LABELED_ROW_SPACING.first,
          },
        ]
      : []),
  ]

  return (
    <section className={blockRhythmClass(hosted)}>
      <ul role="list">
        {rows.map(({ link, spacing }) => {
          const Icon = SOCIAL_PLATFORM_ICONS[link.platform]
          return (
            <li key={link.href} className={cn(spacing, 'flex')}>
              <Link
                href={link.href}
                className="group flex text-sm font-medium text-zinc-800 transition hover:text-teal-500 dark:text-zinc-200 dark:hover:text-teal-500"
                {...getExternalLinkProps(link.href)}
              >
                <Icon className="h-6 w-6 flex-none fill-zinc-500 transition group-hover:fill-teal-500" />
                <span className="ml-4">{link.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
