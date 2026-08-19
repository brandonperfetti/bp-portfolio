import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import {
  CarouselClient,
  type CarouselSlideData,
} from '@/blocks/Carousel/CarouselClient'
import { DEFAULT_CAROUSEL_VARIANT } from '@/blocks/Carousel/options'
import type { CarouselBlock, Media } from '@/payload-types'

const media = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Carousel block (CMS page builder), server side.
 *
 * @remarks The server half of the split: it resolves each slide's uploaded
 * media to a plain URL and hands the client Swiper leaf only serializable
 * props — the mapping-layer boundary #41 establishes for every later variant.
 * A slide with no resolvable image is dropped (the `media` variant is nothing
 * without one), and an empty carousel renders nothing rather than an empty
 * track.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering. In a
 * column the stack owns the rhythm, so the section drops its own margin (the
 * `hostContext` convention every block follows).
 */
export function CarouselComponent(
  props: CarouselBlock & { hosted?: BlockHostContext },
) {
  const { variant, slides } = props

  const resolved: CarouselSlideData[] = (slides ?? [])
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

  if (!resolved.length) return null

  return (
    <section className={blockRhythmClass(props.hosted)}>
      <CarouselClient
        variant={variant ?? DEFAULT_CAROUSEL_VARIANT}
        slides={resolved}
        slidesPerView={props.slidesPerView}
        slidesPerViewMobile={props.slidesPerViewMobile}
        autoplay={props.autoplay}
        interval={props.interval}
        loop={props.loop}
        effect={props.effect}
        navigation={props.navigation}
        pagination={props.pagination}
        direction={props.direction}
        rotate={props.rotate}
        grayscale={props.grayscale}
        fullBleed={props.fullBleed}
      />
    </section>
  )
}
