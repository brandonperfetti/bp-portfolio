import {
  FacebookIcon,
  HackerNewsIcon,
  LinkedInIcon,
  LinkIcon,
  MailIcon,
  RedditIcon,
  XIcon,
} from '@/icons'
import { SHARE_TARGET_IDS, SHARE_TARGET_OPTIONS } from '@/globals/SiteSettings'

/**
 * One of the pinned share-destination ids (`x`, `linkedin`, `facebook`,
 * `reddit`, `hackernews`, `email`, `copylink`).
 *
 * @remarks Derived from {@link SHARE_TARGET_IDS} rather than re-listed so the
 * vocabulary stays defined in exactly one place — the SiteSettings global.
 */
export type ShareTargetId = (typeof SHARE_TARGET_IDS)[number]

/**
 * The minimum a share action needs to build an intent URL: the canonical URL
 * of the thing being shared and its title. There is no per-post share text —
 * the copy is derived here, keeping callers from inventing their own.
 */
export interface ShareIntentPayload {
  /** Absolute canonical URL of the page being shared. */
  url: string
  /** Human title of the page — used as tweet text, email subject, etc. */
  title: string
}

/**
 * Builds a share-intent URL for one destination.
 *
 * @param payload - The URL and title to share.
 * @returns The destination's intent URL, or `null` for `copylink`, whose
 * behavior is copy-to-clipboard rather than a navigation.
 */
export type ShareIntentBuilder = (payload: ShareIntentPayload) => string | null

/**
 * A share destination reduced to a plain, serializable-ish shape: an id, a
 * label, an icon component, and an intent-URL builder.
 *
 * @remarks Mirrors `ResolvedSocialLink` in the SocialLinks block — the icon is
 * a component reference so presentational stories and tests can construct one
 * by hand without touching the CMS.
 */
export interface ResolvedShareTarget {
  /** The pinned id (see {@link ShareTargetId}). */
  id: ShareTargetId
  /** Visible/accessible label, from {@link SHARE_TARGET_OPTIONS}. */
  label: string
  /** Which icon to draw. */
  icon: React.ComponentType<React.ComponentPropsWithoutRef<'svg'>>
  /** Builds this destination's intent URL (or `null` for copy-link). */
  buildIntentUrl: ShareIntentBuilder
}

/** Label per id, sourced from the single SiteSettings vocabulary. */
const SHARE_TARGET_LABELS = Object.fromEntries(
  SHARE_TARGET_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ShareTargetId, string>

/** Icon component per id — X / LinkedIn / Mail / Link already exist. */
const SHARE_TARGET_ICONS: Record<
  ShareTargetId,
  React.ComponentType<React.ComponentPropsWithoutRef<'svg'>>
> = {
  x: XIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  reddit: RedditIcon,
  hackernews: HackerNewsIcon,
  email: MailIcon,
  copylink: LinkIcon,
}

/**
 * Intent-URL builder per id. Every interpolated value is passed through
 * `encodeURIComponent`; formats are pinned to match each destination's
 * documented share endpoint.
 */
const SHARE_TARGET_BUILDERS: Record<ShareTargetId, ShareIntentBuilder> = {
  x: ({ url, title }) =>
    `https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
  linkedin: ({ url }) =>
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  facebook: ({ url }) =>
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  reddit: ({ url, title }) =>
    `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  hackernews: ({ url, title }) =>
    `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(title)}`,
  email: ({ url, title }) =>
    `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  copylink: () => null,
}

/**
 * Every share destination in canonical order, keyed by id.
 *
 * @remarks The single registry the UI, stories, and resolver all read from —
 * `SHARE_TARGETS[id]` yields the full {@link ResolvedShareTarget}.
 */
export const SHARE_TARGETS: Record<ShareTargetId, ResolvedShareTarget> =
  Object.fromEntries(
    SHARE_TARGET_IDS.map((id) => [
      id,
      {
        id,
        label: SHARE_TARGET_LABELS[id],
        icon: SHARE_TARGET_ICONS[id],
        buildIntentUrl: SHARE_TARGET_BUILDERS[id],
      },
    ]),
  ) as Record<ShareTargetId, ResolvedShareTarget>

/** Type guard: is `value` one of the pinned share-target ids? */
function isShareTargetId(value: string): value is ShareTargetId {
  return (SHARE_TARGET_IDS as readonly string[]).includes(value)
}

/**
 * Resolves the effective set of share targets for a page.
 *
 * @param global - The site-wide enabled ids (the SiteSettings default list).
 * @param add - Per-entry additions layered on top of the global set.
 * @param remove - Per-entry removals subtracted from the union.
 * @returns The `(global ∪ add) \ remove` set as full
 * {@link ResolvedShareTarget}s, deduped and ordered by {@link SHARE_TARGET_IDS}
 * (canonical order), with any unknown ids ignored.
 * @remarks Order is imposed by the canonical vocabulary, not by input order,
 * so the row reads the same regardless of how editors sequenced their picks.
 */
export function resolveShareTargets(
  global: readonly string[] = [],
  add: readonly string[] = [],
  remove: readonly string[] = [],
): ResolvedShareTarget[] {
  const removed = new Set(remove)
  const enabled = new Set<ShareTargetId>()

  for (const id of [...global, ...add]) {
    if (isShareTargetId(id) && !removed.has(id)) enabled.add(id)
  }

  return SHARE_TARGET_IDS.filter((id) => enabled.has(id)).map(
    (id) => SHARE_TARGETS[id],
  )
}
