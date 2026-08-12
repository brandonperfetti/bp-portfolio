import type { BlockHostContext } from '@/blocks/hostContext'
import { SocialLinksView } from '@/blocks/SocialLinks/SocialLinksView'
import {
  type ResolvedSocialLink,
  resolveSocialLink,
} from '@/blocks/SocialLinks/platforms'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import type { SocialLinksBlock } from '@/payload-types'

/**
 * Social links (CMS page builder). Server component: resolves the block's
 * source to plain link data and hands it to {@link SocialLinksView}, which
 * owns every pixel and every story.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks `source: identity` reads the Identity global through
 * `getCmsIdentity`, so it inherits that repo's cache tag — an admin edit to
 * `sameAs` revalidates every page carrying this block without a deploy.
 *
 * The divider row's address resolves in one order (decided 2026-08-12,
 * recorded on #32): the block's own `email` field wins as a per-page
 * override, the Identity global's `email` is the site-wide answer, and with
 * neither the row is hidden. There is no hard-coded address anywhere on the
 * path — a stale one would route real mail nowhere, which is worse than a
 * missing row.
 */
export async function SocialLinksBlockComponent(
  props: SocialLinksBlock & { hosted?: BlockHostContext },
) {
  const { variant } = props
  const override = props.email?.trim()
  const wantsDivider =
    variant === 'labeledList' && Boolean(props.showEmailDivider)
  // One fetch, or none: the global is needed for the links, for the address
  // fallback, or for both.
  const needsIdentity = props.source !== 'custom' || (wantsDivider && !override)
  const identity = needsIdentity ? await getCmsIdentity() : null

  const links: ResolvedSocialLink[] =
    props.source === 'custom'
      ? (props.links ?? [])
          .map((row) => resolveSocialLink(row.url, row.label))
          .filter((link): link is ResolvedSocialLink => link !== null)
      : (identity?.sameAs ?? [])
          .map((url) => resolveSocialLink(url))
          .filter((link): link is ResolvedSocialLink => link !== null)

  return (
    <SocialLinksView
      links={links}
      variant={variant}
      email={wantsDivider ? override || identity?.email : undefined}
      hosted={props.hosted}
    />
  )
}
