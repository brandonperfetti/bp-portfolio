import Image from 'next/image'
import { type ReactNode } from 'react'

import {
  CarouselClient,
  type CarouselSlideData,
} from '@/blocks/Carousel/CarouselClient'
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
  HERO_HEADLINE_ON_MEDIA_CLASS,
  HERO_SOCIAL_REVEAL,
  HERO_SOCIAL_ROW_SPACING_CLASS,
  HERO_SUBTITLE_CLASS,
  HERO_SUBTITLE_ON_MEDIA_CLASS,
  HERO_SUBTITLE_REVEAL,
  heroHeadlineVariant,
} from '@/heros/content'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_PANEL_CLASS,
  HERO_CARD_SHELL_CLASS,
  HERO_FULL_BLEED_PANEL_CLASS,
  HERO_MEDIA_FULLSCREEN_FRAME_CLASS,
  HERO_MEDIA_SCRIM_CLASS,
  HERO_MEDIA_TEXT_SHADOW_CLASS,
  heroPresentation,
} from '@/heros/presentation'
import { routeRhythmProfile } from '@/heros/routeRhythm'
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
 * @param showText - Whether to render the text block (title + subtitle + hero
 * rich text + CTA links). Default `true`. The banner heroes (`image`,
 * `carousel`) pass `false` when their `showContent` toggle is off, which hides
 * the whole text block while the social row still renders independently (gated
 * only by `showSocialLinks`, which upstream already emptied `socialLinks`).
 * @param onMedia - Whether the stack is overlaid on a photo/carousel banner.
 * Default `false`. When `true`, the whole stack — headline, subtitle, hero rich
 * text, CTA links and the social icon row — renders **light in both app
 * themes** (over the dark {@link HERO_MEDIA_SCRIM_CLASS}) instead of the
 * theme-aware zinc it uses on a page background, so text on a dark photo stays
 * legible in light *and* dark app mode (staging QA B6.1). Passed only by the
 * banner overlay; every other caller omits it, so their DOM is byte-identical.
 */
function HeroContent({
  page,
  socialLinks,
  className,
  showText = true,
  onMedia = false,
}: {
  page: Page
  socialLinks: ResolvedSocialLink[]
  className?: string
  showText?: boolean
  onMedia?: boolean
}) {
  const links = page.hero?.links
  // Opt-in, off by default: when off, `MaybeReveal` renders its children bare,
  // so the hero emits exactly the DOM it did before the control existed.
  const revealContent = Boolean(page.hero?.revealContent)

  return (
    <div className={className ? `max-w-2xl ${className}` : 'max-w-2xl'}>
      {showText ? (
        <>
          <AnimatedHeadline
            text={page.title}
            variant={heroHeadlineVariant(page.hero?.headlineVariant)}
            className={
              onMedia ? HERO_HEADLINE_ON_MEDIA_CLASS : HERO_HEADLINE_CLASS
            }
          />
          {page.subtitle ? (
            <MaybeReveal enabled={revealContent} params={HERO_SUBTITLE_REVEAL}>
              <p
                className={
                  onMedia ? HERO_SUBTITLE_ON_MEDIA_CLASS : HERO_SUBTITLE_CLASS
                }
              >
                {page.subtitle}
              </p>
            </MaybeReveal>
          ) : null}
          {page.hero?.richText ? (
            // `prose-invert` forces the prose palette light over the dark scrim
            // in both themes (Prose is otherwise `prose dark:prose-invert`); a
            // no-op class off media.
            <div className="mt-6">
              <RichTextContent
                content={page.hero.richText}
                className={onMedia ? 'prose-invert' : undefined}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {showText && links?.length ? (
        // `pointer-events-auto` opts the CTA row back in when this stack is
        // overlaid inside the carousel hero's `pointer-events-none` frame, so
        // the links stay clickable while a drag on empty overlay area still
        // reaches the carousel. A no-op everywhere else — `pointer-events-auto`
        // is the default — so the other hero types render unchanged. On media,
        // plain (non-button) links render white for legibility over the photo.
        <div className="pointer-events-auto mt-8 flex flex-wrap gap-3">
          {links.map((row, index) => (
            <CMSLink
              key={row.id ?? index}
              link={row.link}
              className={
                onMedia && !row.link.appearance
                  ? 'font-medium text-white transition hover:text-zinc-200'
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
      {socialLinks.length ? (
        <MaybeReveal enabled={revealContent} params={HERO_SOCIAL_REVEAL}>
          {/* `pointer-events-auto` for the same reason as the CTA row above:
              keep the icon row clickable when overlaid on the carousel hero,
              a no-op outside that `pointer-events-none` ancestor. On media,
              `[&_svg]:fill-white` forces the imported icons (which paint with
              `fill-zinc-*`, not `currentColor`) light over the dark scrim. */}
          <div
            className={
              onMedia
                ? `${HERO_SOCIAL_ROW_SPACING_CLASS} pointer-events-auto [&_svg]:fill-white`
                : `${HERO_SOCIAL_ROW_SPACING_CLASS} pointer-events-auto`
            }
          >
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
 * - `blank` — nothing at all: no `<header>`, no content stack. The one type
 *   that does not render the headline, for a page (the about page) whose H1
 *   lives inside its body as a `heading` block, so the hero must not draw a
 *   second one. Opt-in; every other type renders the content stack.
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
 * - `image` — a full-bleed image banner: the uploaded `media` fills the same
 *   `shader`+fullBleed frame edge-to-edge, with a legibility scrim and the
 *   content stack overlaid on top (a magazine-cover look, distinct from
 *   `standard`'s inset image below the stack).
 * - `carousel` — a full-bleed image carousel banner: the reused
 *   {@link CarouselClient} (`variant='media'`, autoplay off, keyboard/nav/
 *   pagination on) fills a hero-owned horizontal breakout, with the content
 *   stack overlaid `pointer-events-none` so the carousel stays interactive.
 *   The hero owns the breakout and passes `fullBleed={false}` to the leaf,
 *   whose own breakout is effect-gated (only expo/carousel3d/spring), so the
 *   frame is applied once.
 *
 * @param page - The page document to render a hero for.
 * @param socialLinks - Resolved Identity profile links, or `[]` for no row.
 * @param heroSlides - The `carousel` hero's slides, already resolved from
 * uploads to plain URLs by {@link RenderHero} (the server/presentational split
 * the carousel block established). Empty for every other type.
 */
export function HeroView({
  page,
  socialLinks = [],
  heroSlides = [],
}: {
  page: Page
  socialLinks?: ResolvedSocialLink[]
  heroSlides?: CarouselSlideData[]
}) {
  const hero = page.hero
  const type = hero?.type ?? 'none'

  // `blank` draws no hero at all — no `<header>`, no content stack — so a page
  // that carries its headline in an in-column `heading` block (the about page)
  // is not doubled by a hero rendering its own. Opt-in and additive: no stored
  // page selects it until an edit does, so every existing page is unaffected.
  if (type === 'blank') return null

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

  // The full-bleed canvas pull depends on the route rhythm the page opts into:
  // `standard` keeps the historical frame (byte-identical for every existing
  // page, whose `rhythm` is null → `standard`); `homeParity` uses the
  // flush-hero frame. See {@link routeRhythmProfile}.
  const fullBleedFrameClass = routeRhythmProfile(
    hero?.rhythm,
  ).heroFullBleedFrameClass

  // The banner heroes' overlaid-content toggle (B6.1), default ON: when off,
  // `HeroContent` renders no text block (title/subtitle/richText/links) — the
  // social row still renders independently, gated only by `showSocialLinks`
  // (which upstream already emptied `socialLinks` when off).
  const showContent = hero?.showContent ?? true

  // The overlaid stack for a banner hero (`image`/`carousel`): the content
  // column, vertically centred over the media, `pointer-events-none` so a drag
  // on empty overlay area still reaches the carousel beneath (the CTA/social
  // rows opt back in). Omitted entirely when there is nothing to overlay —
  // `showContent` off and no social row — so a clean banner has no empty layer.
  const bannerOverlay =
    showContent || socialLinks.length ? (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center px-4 sm:px-8">
        <HeroContent
          page={page}
          socialLinks={socialLinks}
          className={HERO_MEDIA_TEXT_SHADOW_CLASS}
          showText={showContent}
          onMedia
        />
      </div>
    ) : null

  // `image` — a full-screen (100dvh) image banner (B6.1): the uploaded media
  // fills exactly one dynamic viewport height, pulled up behind the site header
  // (edge-to-edge top and bottom, nothing below the fold), with a legibility
  // scrim and the content stack overlaid on top. Both themes are covered by the
  // scrim's `dark:` stops. An image is static — nothing to degrade under reduced
  // motion. With no media it falls back to the bare content stack (`none` look).
  if (type === 'image') {
    if (!media?.url) {
      return (
        <header className="relative">
          <HeroContent page={page} socialLinks={socialLinks} />
        </header>
      )
    }
    return (
      <header className={HERO_MEDIA_FULLSCREEN_FRAME_CLASS}>
        <Image
          src={media.url}
          alt={media.alt || ''}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <div className={HERO_MEDIA_SCRIM_CLASS} />
        {bannerOverlay}
      </header>
    )
  }

  // `carousel` — a full-screen (100dvh) image carousel banner (B6.1). Like the
  // image hero it fills one dynamic viewport height pulled behind the header,
  // but the carousel must stay interactive (its slides drag, its arrows click),
  // so the frame is a *positive-flow* box (not a `-z-10` decoration) and the
  // reused `CarouselClient` renders inside it in `presentation="hero"` mode —
  // slides fill the frame and the nav/pagination overlay at the bottom edge.
  // `fullBleed={false}` because the leaf's own breakout is effect-gated (only
  // expo/carousel3d/spring) and the hero already owns the frame — passing it on
  // would double the breakout. `navigation`/`pagination` are per-hero toggles
  // (default on); autoplay is fixed off. The scrim and the content stack overlay
  // the carousel `pointer-events-none`, so a drag, an arrow click, keyboard nav
  // and pagination all reach the leaf beneath. A carousel with no resolvable
  // slides falls back to the bare content stack (the `none` look) rather than a
  // broken zero-height overlay.
  if (type === 'carousel') {
    if (!heroSlides.length) {
      return (
        <header className="relative">
          <HeroContent page={page} socialLinks={socialLinks} />
        </header>
      )
    }
    return (
      <header className={HERO_MEDIA_FULLSCREEN_FRAME_CLASS}>
        <CarouselClient
          variant="media"
          presentation="hero"
          slides={heroSlides}
          effect={hero?.effect}
          autoplay={false}
          navigation={hero?.navigation ?? true}
          pagination={hero?.pagination ?? true}
          fullBleed={false}
        />
        <div className={HERO_MEDIA_SCRIM_CLASS} />
        {bannerOverlay}
      </header>
    )
  }

  return (
    <header className="relative">
      {type === 'shader' ? (
        <ShaderHero
          preset={preset}
          className={fullBleedFrameClass}
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
