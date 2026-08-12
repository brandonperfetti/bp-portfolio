import Image from 'next/image'

import { CMSLink } from '@/components/cms/CMSLink'
import { RichTextContent } from '@/components/cms/RichTextContent'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { ShaderHero } from '@/components/heros/ShaderHero'
import {
  DEFAULT_SHADER_PRESET,
  type ShaderPresetKey,
} from '@/components/heros/presets'
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
 * Title, subtitle, hero rich text and links — the same stack for every hero
 * type, so a page reads identically whatever runs behind it.
 *
 * @param page - The page being rendered (title/subtitle/hero).
 * @param className - Extra classes for the text column: the card
 * presentation adds a text shadow, since its text sits directly on the canvas.
 */
function HeroContent({ page, className }: { page: Page; className?: string }) {
  const links = page.hero?.links

  return (
    <div className={className ? `max-w-2xl ${className}` : 'max-w-2xl'}>
      <AnimatedHeadline
        text={page.title}
        variant="line"
        className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100"
      />
      {page.subtitle ? (
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          {page.subtitle}
        </p>
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
    </div>
  )
}

/**
 * Page-hero renderer for CMS-built pages (catch-all route).
 *
 * - `none` — AnimatedHeadline title + subtitle (SimpleLayout look).
 * - `standard` — title/subtitle (or hero richText) beside the hero media.
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
 */
export function RenderHero({ page }: { page: Page }) {
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

      <HeroContent page={page} />

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
