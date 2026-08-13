import Link from 'next/link'
import type { ReactElement } from 'react'

import { getExternalLinkProps } from '@/lib/link-utils'

function isSiteOwnerAuthor(name: string) {
  // TODO(backlog): centralize site-owner identity constant across CMS rendering.
  // Notion: https://www.notion.so/Centralize-site-owner-identity-constant-across-CMS-rendering-31cbe01e1e06818ea6f4f1c037fc8ef3
  return name.trim().toLowerCase() === 'brandon perfetti'
}

const SOCIAL_LABELS: Record<string, string> = {
  'x.com': 'X',
  'twitter.com': 'X',
  'github.com': 'GitHub',
  'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube',
  'instagram.com': 'Instagram',
  'mastodon.social': 'Mastodon',
  'bsky.app': 'Bluesky',
}

/** Friendly label for a social profile URL, falling back to its hostname. */
function socialLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return SOCIAL_LABELS[host] ?? host
  } catch {
    return url
  }
}

/**
 * Renders article metadata chips and author/actions row when metadata exists.
 *
 * @param author Author identity, either a string label or object with optional
 * `name`, `role`, `href`, `image` (avatar URL), and `sameAs` (social links).
 * @param actions Optional right-aligned action slot.
 * @param readingTimeMinutes Optional reading-time value.
 * @param category Optional fallback category when topic chips are absent.
 * @param topics Optional topics list (deduped + trimmed, max 3).
 * @param tech Optional tech list (deduped + trimmed, max 3, excluding topic duplicates).
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

  const socialLinks = Array.from(
    new Set(
      (authorMeta?.sameAs ?? []).map((url) => url.trim()).filter(Boolean),
    ),
  ).map((href) => ({ href, label: socialLabel(href) }))

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
    <div className="mt-5 space-y-3 text-xs text-zinc-500 dark:text-zinc-400">
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
                  // `not-prose`: the byline renders inside the article `<Prose>`
                  // wrapper, whose typography styles give `ul > li` a disc
                  // marker before EVERY item (the stray leading "•"). Opt out of
                  // prose here and place separators explicitly — a bullet before
                  // each item except the first, so they sit only BETWEEN links.
                  <ul className="not-prose mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {socialLinks.map((link, index) => (
                      <li key={link.href} className="flex items-center gap-x-2">
                        {index > 0 ? (
                          <span
                            aria-hidden="true"
                            className="text-zinc-300 select-none dark:text-zinc-600"
                          >
                            &bull;
                          </span>
                        ) : null}
                        <a
                          href={link.href}
                          {...getExternalLinkProps(link.href)}
                          className="text-xs font-medium text-zinc-500 transition hover:text-teal-500 dark:text-zinc-400 dark:hover:text-teal-400"
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
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
