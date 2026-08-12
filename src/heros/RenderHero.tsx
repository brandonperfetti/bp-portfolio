import {
  type ResolvedSocialLink,
  resolveSocialLink,
} from '@/blocks/SocialLinks/platforms'
import { HeroView } from '@/heros/HeroView'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import type { Page } from '@/payload-types'

/**
 * Page hero for CMS-built pages (catch-all route). Server component: it
 * resolves the one thing a hero can't read from its own document — the
 * Identity global's social profiles — and hands plain data to
 * {@link HeroView}, which owns every pixel and every story.
 *
 * @param page - The page document to render a hero for.
 * @remarks The icon row is Identity-sourced by design, not a per-hero list:
 * one canonical set of profiles for the whole site, edited in one place. A
 * page that needs its own list uses the `socialLinks` block with
 * `source: custom` instead.
 *
 * `getCmsIdentity` is only called when the hero asks for the row, so a hero
 * without it costs no query — and when it is called, the hero inherits that
 * repo's `global_identity` cache tag, so editing `sameAs` in admin
 * revalidates every page carrying the row without a deploy.
 */
export async function RenderHero({ page }: { page: Page }) {
  const socialLinks: ResolvedSocialLink[] = page.hero?.showSocialLinks
    ? (await getCmsIdentity()).sameAs
        .map((url) => resolveSocialLink(url))
        .filter((link): link is ResolvedSocialLink => link !== null)
    : []

  return <HeroView page={page} socialLinks={socialLinks} />
}
