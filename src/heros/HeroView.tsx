import Image from 'next/image'
import { type ReactNode } from 'react'

import { SocialLinksView } from '@/blocks/SocialLinks/SocialLinksView'
import type { ResolvedSocialLink } from '@/blocks/SocialLinks/platforms'
import { CMSLink } from '@/components/cms/CMSLink'
import { RichTextContent } from '@/components/cms/RichTextContent'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { ShaderHero } from '@/components/heros/ShaderHero'
import {
  DEFAULT_SHADER_PRESET,
  type ShaderPresetKey,
} from '@/components/heros/presets'
import {
  HERO_HEADLINE_CLASS,
  HERO_SOCIAL_REVEAL,
  HERO_SOCIAL_ROW_SPACING_CLASS,
  HERO_SUBTITLE_CLASS,
  HERO_SUBTITLE_REVEAL,
  heroHeadlineVariant,
} from '@/heros/content'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_PANEL_CLASS,
  HERO_CARD_SHELL_CLASS,
  HERO_FULL_BLEED_FRAME_CLASS,
  HERO_FULL_BLEED_PANEL_CLASS,
  heroPresentation,
} from '@/heros/presentation'
import type { Media, Page } from '@/payload-types'

const mediaUrl = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Wraps its children in a `ScrollReveal` with fixed params when `enabled`,
 * and renders them bare otherwise — no wrapper element at all.
 *
 * @remarks "Bare when off" is the parity contract: a hero with
 * `revealContent` off must emit exactly the DOM it did before the control
 * existed, so the reveal is either the homepage's wrapper or nothing.
 */
function MaybeReveal({
  enabled,
  params,
  children,
}: {
  enabled: boolean
  params: { y: number; duration: number; delay: number }
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <ScrollReveal y={params.y} duration={params.duration} delay={params.delay}>
      {children}
    </ScrollReveal>
  )
}

/**
 * Title, subtitle, hero rich text, links and the social icon row — the same
 * stack for every hero type, so a page reads identically whatever runs
 * behind it.
 *
 * Order is the homepage's: headline, then the page's `subtitle`, then
 * (for a CMS page that has them) the hero's own prose and call-to-action
 * links, then the icon row as the tail of the stack. On a page shaped like
 * Home — title, subtitle, socials, no prose and no CTAs — that is literally
 * Home's stack.
 *
 * @param page - The page being rendered (title/subtitle/hero).
 * @param socialLinks - Identity profile links, already resolved by
 * {@link RenderHero}. Empty when the hero's `showSocialLinks` is off, which
 * is what removes the row.
 * @param className - Extra classes for the text column: the card
 * presentation adds a text shadow, since its text sits directly on the canvas.
 */
function HeroContent({
  page,
  socialLinks,
  className,
}: {
  page: Page
  socialLinks: ResolvedSocialLink[]
  className?: string
}) {
  const links = page.hero?.links
  // Opt-in, off by default: when off, `MaybeReveal` renders its children bare,
  // so the hero emits exactly the DOM it did before the control existed.
  const revealContent = Boolean(page.hero?.revealContent)

  return (
    <div className={className ? `max-w-2xl ${className}` : 'max-w-2xl'}>
      <AnimatedHeadline
        text={page.title}
        variant={heroHeadlineVariant(page.hero?.headlineVariant)}
        className={HERO_HEADLINE_CLASS}
      />
      {page.subtitle ? (
        <MaybeReveal enabled={revealContent} params={HERO_SUBTITLE_REVEAL}>
          <p className={HERO_SUBTITLE_CLASS}>{page.subtitle}</p>
        </MaybeReveal>
      ) : null}
      {page.hero?.richText ? (
        <div className="mt-6">
          <RichTextContent content={page.hero.richText} />
        </div>
      ) : null}
      {links?.length ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {links.map((row, index) => (
            <CMSLink key={row.id ?? index} link={row.link} />
          ))}
        </div>
      ) : null}
      {socialLinks.length ? (
        <MaybeReveal enabled={revealContent} params={HERO_SOCIAL_REVEAL}>
          <div className={HERO_SOCIAL_ROW_SPACING_CLASS}>
            {/*
             * The `socialLinks` block's own icon row, imported rather than
             * rebuilt — one set of icons, one focus ring, one hover treatment
             * for both surfaces. `hosted="column"` is how that view is told the
             * host owns the vertical rhythm: at `root` it emits the blocks'
             * `my-12`, which is a block's page rhythm and not a hero's.
             * The `mt-6` above is the homepage's gap.
             */}
            <SocialLinksView
              links={socialLinks}
              variant="iconRow"
              hosted="column"
            />
          </div>
        </MaybeReveal>
      ) : null}
    </div>
  )
}

/**
 * The CMS page hero, presentational: every pixel a hero can draw, from plain
 * props. {@link RenderHero} is the server component that feeds it.
 *
 * - `none` — headline + subtitle (SimpleLayout look), no background.
 * - `standard` — the same stack above the uploaded hero media.
 * - `shader` + `fullBleed` — the homepage treatment: the shared `ShaderHero`
 *   pulled behind the site header and out to the content panel's edges, with
 *   scrim, bottom fade, offscreen GPU pause and the light-mode preset swap
 *   (all four live in that component, so this route inherits them by reuse).
 *   The `<header>` must **not** isolate: the canvas's `-z-10` has to resolve
 *   against a stacking context that also contains the page's blocks, or the
 *   canvas paints over every block inside its 36rem span. That context is the
 *   route's own — see {@link HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS}.
 * - `shader` + `card` — the bounded rounded panel the `shaderHero` block
 *   renders, with the hero text on the canvas; no scrim, no bottom fade.
 *
 * @param page - The page document to render a hero for.
 * @param socialLinks - Resolved Identity profile links, or `[]` for no row.
 */
export function HeroView({
  page,
  socialLinks = [],
}: {
  page: Page
  socialLinks?: ResolvedSocialLink[]
}) {
  const hero = page.hero
  const type = hero?.type ?? 'none'
  const media = mediaUrl(hero?.media)
  const preset = (hero?.shaderPreset ??
    DEFAULT_SHADER_PRESET) as ShaderPresetKey

  if (type === 'shader' && heroPresentation(hero?.presentation) === 'card') {
    return (
      <header className={HERO_CARD_SHELL_CLASS}>
        <ShaderHero
          preset={preset}
          className={HERO_CARD_FRAME_CLASS}
          panelClassName={HERO_CARD_PANEL_CLASS}
          scrim={false}
          bottomFade={false}
        />
        <div className="relative z-10 flex min-h-[20rem] items-center p-8 sm:p-12">
          <HeroContent
            page={page}
            socialLinks={socialLinks}
            className="[text-shadow:0_1px_8px_rgba(0,0,0,0.25)]"
          />
        </div>
      </header>
    )
  }

  return (
    <header className="relative">
      {type === 'shader' ? (
        <ShaderHero
          preset={preset}
          className={HERO_FULL_BLEED_FRAME_CLASS}
          panelClassName={HERO_FULL_BLEED_PANEL_CLASS}
        />
      ) : null}

      <HeroContent page={page} socialLinks={socialLinks} />

      {type === 'standard' && media?.url ? (
        <div className="mt-10">
          <Image
            src={media.url}
            alt={media.alt || page.title}
            width={media.width || 1600}
            height={media.height || 900}
            sizes="(min-width: 1280px) 56rem, 100vw"
            className="h-auto w-full rounded-2xl bg-zinc-100 dark:bg-zinc-800"
            priority
          />
        </div>
      ) : null}
    </header>
  )
}
