import {
  GitHubIcon,
  InstagramIcon,
  LinkIcon,
  LinkedInIcon,
  MailIcon,
  XIcon,
} from '@/icons'

/**
 * The social platforms the block can draw an icon and a default label for.
 *
 * @remarks Deliberately a closed set rather than a per-link icon picker: the
 * Identity global stores bare URLs (`sameAs`), so anything an editor sources
 * from Identity arrives with no icon field to read. Deriving from the host
 * keeps both sources — Identity and custom — on one code path, and `link` is
 * the honest fallback for a URL this list doesn't know.
 */
export type SocialPlatform =
  'x' | 'github' | 'linkedin' | 'instagram' | 'email' | 'link'

/**
 * A social link after resolution: the plain, serializable shape the
 * presentational layer takes, with the platform reduced to a key rather than
 * a component so stories and tests can build one by hand.
 */
export interface ResolvedSocialLink {
  /** `href` as rendered — an absolute URL or a `mailto:` address. */
  href: string
  /** Visible text in the labeled list; the accessible name in the icon row. */
  label: string
  /** Which icon to draw (see {@link SOCIAL_PLATFORM_ICONS}). */
  platform: SocialPlatform
}

/** Icon per platform — the same components Home and About import today. */
export const SOCIAL_PLATFORM_ICONS: Record<
  SocialPlatform,
  React.ComponentType<{ className?: string }>
> = {
  x: XIcon,
  github: GitHubIcon,
  linkedin: LinkedInIcon,
  instagram: InstagramIcon,
  email: MailIcon,
  link: LinkIcon,
}

/** Human name per platform, used to build the default "Follow on …" label. */
const PLATFORM_NAMES: Record<
  Exclude<SocialPlatform, 'email' | 'link'>,
  string
> = {
  x: 'X',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
}

/** Registrable domain → platform, matched against the URL host. */
const HOST_PLATFORMS: Array<[RegExp, SocialPlatform]> = [
  [/(^|\.)x\.com$/, 'x'],
  [/(^|\.)twitter\.com$/, 'x'],
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)instagram\.com$/, 'instagram'],
]

/**
 * Which platform a URL belongs to.
 *
 * @param href - A URL or `mailto:` address, as stored.
 * @returns The matching platform, or `link` when the host is unknown or the
 * value doesn't parse as a URL at all.
 * @remarks `twitter.com` maps to `x` on purpose — the Identity global may
 * still hold an old-style profile URL, and an editor shouldn't have to
 * rewrite it to get the right glyph.
 */
export function resolveSocialPlatform(href: string): SocialPlatform {
  const value = href.trim()
  if (value.toLowerCase().startsWith('mailto:')) return 'email'

  let host: string
  try {
    host = new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return value.includes('@') && !value.includes('/') ? 'email' : 'link'
  }

  for (const [pattern, platform] of HOST_PLATFORMS) {
    if (pattern.test(host)) return platform
  }
  return 'link'
}

/**
 * The label a link falls back to when the editor supplied none.
 *
 * @param href - The link's href, already normalized.
 * @param platform - Its resolved platform.
 * @returns `Follow on X` for known platforms — the exact strings Home's
 * `aria-label`s and About's list rows use today — the bare address for email,
 * and the host for anything else.
 */
export function defaultSocialLabel(
  href: string,
  platform: SocialPlatform,
): string {
  if (platform === 'email') return href.replace(/^mailto:/i, '')
  if (platform !== 'link') return `Follow on ${PLATFORM_NAMES[platform]}`
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}

/**
 * Turns a stored URL (plus an optional editor label) into the shape the view
 * renders.
 *
 * @param href - URL or bare email address; a bare address gains `mailto:`.
 * @param label - Editor-supplied override, if any. Blank falls back.
 * @returns The resolved link, or `null` when `href` is empty — Identity's
 * `sameAs` and the block's own array can both hold blank rows.
 */
export function resolveSocialLink(
  href: string | null | undefined,
  label?: string | null,
): ResolvedSocialLink | null {
  const trimmed = href?.trim()
  if (!trimmed) return null

  const platform = resolveSocialPlatform(trimmed)
  const normalized =
    platform === 'email' && !/^mailto:/i.test(trimmed)
      ? `mailto:${trimmed}`
      : trimmed

  return {
    href: normalized,
    label: label?.trim() || defaultSocialLabel(normalized, platform),
    platform,
  }
}
