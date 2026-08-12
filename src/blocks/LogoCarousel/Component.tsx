'use client'

import Image from 'next/image'
import Link from 'next/link'

import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { getExternalLinkProps } from '@/lib/link-utils'
import { cn } from '@/lib/utils'
import type { LogoCarouselBlock, Media } from '@/payload-types'

const media = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Logo strip (CMS page builder): seamless CSS marquee, or a static wrapped
 * row. The marquee duplicates the row for the loop and is fully disabled
 * under reduced motion (§13) — logos then render as the wrap layout.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering. In
 * a column the stack owns the rhythm, so the strip drops its own margin
 * (#40 / visual-QA F2 — see `hostContext.ts`).
 */
export function LogoCarouselComponent(
  props: LogoCarouselBlock & { hosted?: BlockHostContext },
) {
  const reducedMotion = usePrefersReducedMotion()
  const { logos, logoHeight, layout, scrollSpeed } = props
  if (!logos?.length) return null

  const height = logoHeight || 40
  const scroll = layout !== 'wrap' && (scrollSpeed ?? 40) > 0 && !reducedMotion
  // Rough loop duration: assume ~3:1 logo aspect + gap per item.
  const rowWidth = logos.length * (height * 3 + 48)
  const duration = rowWidth / (scrollSpeed || 40)

  const renderLogo = (
    logo: NonNullable<LogoCarouselBlock['logos']>[number],
    key: string,
  ) => {
    const image = media(logo.image)
    if (!image?.url) return null
    const img = (
      <Image
        src={image.url}
        alt={image.alt || 'Logo'}
        width={Math.round(height * ((image.width || 3) / (image.height || 1)))}
        height={height}
        className="w-auto object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
        style={{ height }}
      />
    )
    return logo.url ? (
      <Link
        key={key}
        href={logo.url}
        {...getExternalLinkProps(logo.url)}
        className="shrink-0"
      >
        {img}
      </Link>
    ) : (
      <span key={key} className="shrink-0">
        {img}
      </span>
    )
  }

  if (!scroll) {
    return (
      <section className={blockRhythmClass(props.hosted)}>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {logos.map((logo, index) => renderLogo(logo, `${logo.id ?? index}`))}
        </div>
      </section>
    )
  }

  return (
    <section
      className={cn(blockRhythmClass(props.hosted), 'overflow-hidden')}
      aria-label="Logos"
    >
      <div
        className="flex w-max will-change-transform motion-safe:animate-[logo-marquee_linear_infinite]"
        style={{ animationDuration: `${duration}s` }}
      >
        {/* Two identical sets, each padded by the gap, so translateX(-50%)
            loops seamlessly. The duplicate is aria-hidden. */}
        <div className="flex items-center gap-12 pr-12">
          {logos.map((logo, index) =>
            renderLogo(logo, `a-${logo.id ?? index}`),
          )}
        </div>
        <div aria-hidden className="flex items-center gap-12 pr-12">
          {logos.map((logo, index) =>
            renderLogo(logo, `b-${logo.id ?? index}`),
          )}
        </div>
      </div>
    </section>
  )
}
