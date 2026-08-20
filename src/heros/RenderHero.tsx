import type { CarouselSlideData } from '@/blocks/Carousel/CarouselClient'
import {
  type ResolvedSocialLink,
  resolveSocialLink,
} from '@/blocks/SocialLinks/platforms'
import { HeroView } from '@/heros/HeroView'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import type { Media, Page } from '@/payload-types'

const media = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Resolve a `carousel` hero's stored slides to plain, serializable slide data,
 * mirroring `CarouselComponent`'s resolution: each slide's uploaded image
 * becomes a URL, and a slide with no resolvable image is dropped (the `media`
 * variant is nothing without one). The upload→URL resolution stays server-side
 * so {@link HeroView} — and the client `CarouselClient` it mounts — receive only
 * serializable props, the split the carousel foundation established.
 *
 * @param hero - The page's hero group, whatever its type.
 * @returns Resolved slides for a `carousel` hero, else an empty array.
 */
function resolveHeroSlides(hero: Page['hero']): CarouselSlideData[] {
  if (hero?.type !== 'carousel') return []
  return (hero.slides ?? [])
    .map((slide): CarouselSlideData | null => {
      const image = media(slide.image)
      if (!image?.url) return null
      return {
        id: slide.id ?? undefined,
        src: image.url,
        alt: image.alt || '',
        width: image.width,
        height: image.height,
        title: slide.title,
        text: slide.text,
        href: slide.href,
      }
    })
    .filter((slide): slide is CarouselSlideData => slide !== null)
}

/**
 * Page hero for CMS-built pages (catch-all route). Server component: it
 * resolves the two things a hero can't read as plain data from its own
 * document — the Identity global's social profiles, and (for a `carousel`
 * hero) its slide uploads — and hands plain data to {@link HeroView}, which
 * owns every pixel and every story.
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

  return (
    <HeroView
      page={page}
      socialLinks={socialLinks}
      heroSlides={resolveHeroSlides(page.hero)}
    />
  )
}
