import Link from 'next/link'
import type { ReactElement } from 'react'

import {
  resolveSocialLink,
  SOCIAL_PLATFORM_ICONS,
  type ResolvedSocialLink,
} from '@/blocks/SocialLinks/platforms'
import { getExternalLinkProps } from '@/lib/link-utils'

function isSiteOwnerAuthor(name: string) {
  // TODO(backlog): centralize site-owner identity constant across CMS rendering.
  // Notion: https://www.notion.so/Centralize-site-owner-identity-constant-across-CMS-rendering-31cbe01e1e06818ea6f4f1c037fc8ef3
  return name.trim().toLowerCase() === 'brandon perfetti'
}

/**
 * Renders article metadata chips and author/actions row when metadata exists.
 *
 * @param author - Author identity, either a string label or object with optional
 * `name`, `role`, `href`, `image` (avatar URL), and `sameAs` (social links).
 * @param actions - Optional right-aligned action slot.
 * @param readingTimeMinutes - Optional reading-time value.
 * @param category - Optional fallback category when topic chips are absent.
 * @param topics - Optional topics list (deduped + trimmed, max 3).
 * @param tech - Optional tech list (deduped + trimmed, max 3, excluding topic duplicates).
 * @returns Rendered metadata block, or `null` when no metadata is present.
 * @remarks If `author.href` is present it is preferred. Otherwise, site-owner
 * author names route to `/about`; external links use `getExternalLinkProps`.
 */
export function ArticleMeta({
  author,
  actions,
  readingTimeMinutes,
  category,
  topics,
  tech,
}: {
  author?:
    | string
    | {
        href?: string
        name?: string
        role?: string
        image?: string
        sameAs?: string[]
      }
  actions?: React.ReactNode
  readingTimeMinutes?: number
  category?: string
  topics?: string[]
  tech?: string[]
}): ReactElement | null {
  const rawAuthorName =
    typeof author === 'string' ? author.trim() : (author?.name ?? '').trim()
  const provisionalAuthorMeta =
    typeof author === 'string'
      ? {
          name: rawAuthorName,
          role: '',
          href: undefined,
          image: undefined as string | undefined,
          sameAs: [] as string[],
        }
      : author
        ? {
            name: rawAuthorName || (author.href || author.role ? 'Author' : ''),
            role: author.role ?? '',
            href: author.href,
            image: author.image,
            sameAs: author.sameAs ?? [],
          }
        : null

  const hasMeaningfulAuthorMeta =
    Boolean(provisionalAuthorMeta?.name?.trim()) ||
    Boolean(provisionalAuthorMeta?.role?.trim()) ||
    Boolean(provisionalAuthorMeta?.href)
  const authorMeta = hasMeaningfulAuthorMeta ? provisionalAuthorMeta : null

  const authorHref = authorMeta
    ? authorMeta.href ||
      (rawAuthorName
        ? isSiteOwnerAuthor(rawAuthorName)
          ? '/about'
          : undefined
        : undefined)
    : undefined

  // Reuse the site's shared social system (same resolver + icon set as the
  // home hero's SocialLinksView `iconRow`): each `sameAs` URL resolves to a
  // platform + accessible label, and unknown hosts fall back to `link` → the
  // generic LinkIcon, so every URL renders an icon.
  const socialLinks = Array.from(
    new Set(
      (authorMeta?.sameAs ?? []).map((url) => url.trim()).filter(Boolean),
    ),
  )
    .map((url) => resolveSocialLink(url))
    .filter((link): link is ResolvedSocialLink => link !== null)

  const topicChips = Array.from(
    new Set((topics ?? []).map((item) => item.trim()).filter(Boolean)),
  ).slice(0, 3)
  const topicLookup = new Set(topicChips.map((item) => item.toLowerCase()))
  const techChips = Array.from(
    new Set(
      (tech ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !topicLookup.has(item.toLowerCase())),
    ),
  ).slice(0, 3)

  if (
    !authorMeta &&
    !readingTimeMinutes &&
    !category &&
    topicChips.length === 0 &&
    techChips.length === 0
  ) {
    return null
  }

  return (
    // `not-prose`: the byline renders inside the article `<Prose>` wrapper
    // (ArticleLayout). Opting the whole block out of typography drops the
    // paragraph margins that pushed the social row away from name/role, and
    // removes the `ul > li` disc markers — spacing is set explicitly below.
    // The topic/tech/reading-time rows use utilities, so they're unaffected.
    <div className="not-prose mt-5 space-y-3 text-xs text-zinc-500 dark:text-zinc-400">
      {authorMeta || actions ? (
        <div className="flex items-start justify-between gap-3">
          {authorMeta ? (
            <div className="flex items-start gap-3">
              {authorMeta.image ? (
                // Decorative: the adjacent name/link carries the accessible
                // identity, so the avatar is hidden from assistive tech.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={authorMeta.image}
                  alt=""
                  aria-hidden="true"
                  width={40}
                  height={40}
                  className="mt-0.5 h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : null}
              <div>
                {authorHref ? (
                  <Link
                    href={authorHref}
                    {...getExternalLinkProps(authorHref)}
                    className="text-sm font-semibold text-zinc-800 no-underline transition hover:text-teal-500 hover:underline hover:underline-offset-2 dark:text-zinc-100 dark:hover:text-teal-400"
                  >
                    {authorMeta.name}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {authorMeta.name}
                  </p>
                )}
                {authorMeta.role ? (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {authorMeta.role}
                  </p>
                ) : null}
                {socialLinks.length > 0 ? (
                  // Icon-only row grouped tightly under name/role (mt-2), so it
                  // reads as part of the author unit — not the Topics/Tech block
                  // below. Reuses the shared icon set; compact (h-5) with the
                  // byline's zinc→teal hover and SocialLinksView's focus ring.
                  <ul className="mt-2 flex flex-wrap items-center gap-4">
                    {socialLinks.map((link) => {
                      const Icon = SOCIAL_PLATFORM_ICONS[link.platform]
                      return (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            {...getExternalLinkProps(link.href)}
                            aria-label={link.label}
                            className="group -m-1 block rounded-md p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:focus-visible:ring-teal-400/80"
                          >
                            <Icon className="h-5 w-5 fill-zinc-500 transition group-hover:fill-teal-500 dark:fill-zinc-400 dark:group-hover:fill-teal-400" />
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : (
            <span />
          )}
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {readingTimeMinutes ? <div>{readingTimeMinutes} min read</div> : null}
      {!topicChips.length && category ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 dark:text-zinc-500">Topic:</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {category}
          </span>
        </div>
      ) : null}
      {topicChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 dark:text-zinc-500">Topics:</span>
          {topicChips.map((item, index) => (
            <span
              key={`topic-${item}-${index}`}
              className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {techChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 dark:text-zinc-500">Tech:</span>
          {techChips.map((item, index) => (
            <span
              key={`tech-${item}-${index}`}
              className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
