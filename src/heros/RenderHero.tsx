import Image from 'next/image'

import { CMSLink } from '@/components/cms/CMSLink'
import { RichTextContent } from '@/components/cms/RichTextContent'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { ShaderHero } from '@/components/heros/ShaderHero'
import {
  DEFAULT_SHADER_PRESET,
  type ShaderPresetKey,
} from '@/components/heros/presets'
import type { Media, Page } from '@/payload-types'

const mediaUrl = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Page-hero renderer for CMS-built pages (catch-all route).
 *
 * - `none` — AnimatedHeadline title + subtitle (SimpleLayout look).
 * - `standard` — title/subtitle (or hero richText) beside the hero media.
 * - `shader` — full-bleed shaders.com preset behind the headline, same
 *   §23 fallbacks as the home hero.
 */
export function RenderHero({ page }: { page: Page }) {
  const hero = page.hero
  const type = hero?.type ?? 'none'
  const media = mediaUrl(hero?.media)
  const links = hero?.links

  return (
    <header className="relative">
      {type === 'shader' ? (
        <ShaderHero
          preset={
            (hero?.shaderPreset ?? DEFAULT_SHADER_PRESET) as ShaderPresetKey
          }
        />
      ) : null}

      <div className="max-w-2xl">
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
        {hero?.richText ? (
          <div className="mt-6">
            <RichTextContent content={hero.richText} />
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
