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
 */
export async function SocialLinksBlockComponent(
  props: SocialLinksBlock & { hosted?: BlockHostContext },
) {
  const { variant } = props
  const links: ResolvedSocialLink[] =
    props.source === 'custom'
      ? (props.links ?? [])
          .map((row) => resolveSocialLink(row.url, row.label))
          .filter((link): link is ResolvedSocialLink => link !== null)
      : (await getCmsIdentity()).sameAs
          .map((url) => resolveSocialLink(url))
          .filter((link): link is ResolvedSocialLink => link !== null)

  return (
    <SocialLinksView
      links={links}
      variant={variant}
      email={
        variant === 'labeledList' && props.showEmailDivider
          ? props.email
          : undefined
      }
      hosted={props.hosted}
    />
  )
}
