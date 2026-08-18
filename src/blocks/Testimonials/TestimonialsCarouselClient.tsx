'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import {
  A11y,
  Autoplay,
  EffectCards,
  Keyboard,
  Pagination,
} from 'swiper/modules'
import { Swiper, SwiperSlide, type SwiperClass } from 'swiper/react'

import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/effect-cards'

import { resolveTestimonialsDeck } from '@/blocks/Testimonials/deck'
import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

/** One testimonial, already resolved by the server Component to plain data. */
export interface TestimonialSlideData {
  /** Stable key from the stored array row, if any. */
  id?: string | null
  /** The testimonial text. */
  quote: string
  /** Who said it. */
  name: string
  /** Their role/company, if given. */
  role?: string | null
  /** Resolved avatar URL, if the row has one. */
  avatarUrl?: string | null
}

/**
 * Props for the testimonials Swiper leaf. The fixed behaviour knobs the deck
 * uses are resolved through the shared {@link resolveCarouselBehavior} mapping
 * (the one source for autoplay-off / reduced-motion / keyboard / nav /
 * pagination), so this leaf never re-derives that contract — it only owns the
 * stacked-deck (`EffectCards`) wiring the generic #41 track leaf has no use for.
 */
export interface TestimonialsCarouselClientProps {
  items: TestimonialSlideData[]
  /** Test/Storybook hook to capture the Swiper instance; never passed by the server render. */
  onSwiper?: (swiper: SwiperClass) => void
}

/**
 * The testimonials "Cards Stack" leaf (CMS page builder) — the #61 adoption of
 * the UI-Initiative "Cards Stack" flavour, approximated with Swiper's native
 * `EffectCards` (no new dependency) and reconciled to the site's zinc/teal
 * figure chrome.
 *
 * @remarks A client component because Swiper needs the browser. It reads the
 * reader's reduced-motion preference and feeds the fixed deck behaviour through
 * the shared {@link resolveCarouselBehavior} mapping, so autoplay stays off and
 * keyboard nav is always wired. Under reduced motion the stacked `EffectCards`
 * transform is dropped for a plain one-at-a-time slide list — the deck degrades
 * to a static-ish card rather than animating a 3D stack. Navigation is
 * instance-ref (custom arrows call `slideNext()`/`slidePrev()` on the captured
 * instance), and the pagination bullets inherit the brand teal (#66) via the
 * same token overrides the generic carousel uses.
 *
 * @param props - Resolved testimonial slides + the Storybook/test `onSwiper` hook.
 */
export function TestimonialsCarouselClient(
  props: TestimonialsCarouselClientProps,
) {
  const { items, onSwiper } = props
  const reducedMotion = usePrefersReducedMotion()
  const swiperRef = useRef<SwiperClass | null>(null)
  const [ready, setReady] = useState(false)

  if (!items.length) return null

  // The stacked deck is a motion flourish: `EffectCards` mounts only when motion
  // is allowed. Under reduced motion the deck collapses to a plain slide list,
  // matching the mapper's rule that reduced motion neutralizes the effect. Both
  // the behaviour and that decision come from the shared, unit-tested resolver.
  const { behavior, stacked } = resolveTestimonialsDeck(reducedMotion)

  const modules = [Keyboard, A11y]
  if (behavior.pagination) modules.push(Pagination)
  if (stacked) modules.push(EffectCards)
  if (behavior.autoplay) modules.push(Autoplay)

  const arrowClass =
    'flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm transition hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200'

  // Mirror the brand-token pagination the generic carousel established (#66):
  // the active bullet takes the site's teal accent, inactive bullets the muted
  // zinc, and `--swiper-theme-color` is overridden so none of Swiper's default
  // blue (`#007aff`) leaks through. Declared here rather than imported so this
  // leaf stays self-contained and #41's tested leaf is untouched.
  const paginationTokenClass = cn(
    '[--swiper-pagination-color:var(--color-teal-500)]',
    '[--swiper-theme-color:var(--color-teal-500)]',
    '[--swiper-pagination-bullet-inactive-color:var(--color-zinc-500)]',
    '[--swiper-pagination-bullet-inactive-opacity:0.6]',
    'dark:[--swiper-pagination-bullet-inactive-color:var(--color-zinc-400)]',
  )

  return (
    // `overflow-x-clip` contains the Cards Stack deck (#67): Swiper's
    // `effect-cards` CSS makes `.swiper-cards` `overflow: visible`, so the
    // rotated/offset back-cards spill horizontally and, on a ~390px viewport,
    // push a real ~42px horizontal page scroll. Clipping only the x-axis on the
    // full-width deck root stops the page overflow at mobile while leaving the
    // stacked look and the peek intact at wider widths (the spill stays well
    // inside the column there); `clip` (not `hidden`) avoids making this a
    // scroll container, matching the root layout's own `overflow-x-clip`.
    <div
      className={cn('relative overflow-x-clip', paginationTokenClass)}
      data-testid="testimonials-carousel"
    >
      <div className="mx-auto max-w-md">
        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper
            setReady(true)
            onSwiper?.(swiper)
          }}
          slidesPerView={1}
          effect={stacked ? 'cards' : 'slide'}
          cardsEffect={stacked ? { slideShadows: false } : undefined}
          grabCursor={stacked}
          loop={behavior.loop}
          autoplay={behavior.autoplay}
          pagination={behavior.pagination ? { clickable: true } : false}
          keyboard={{ enabled: true }}
          a11y={{ enabled: true }}
          modules={modules}
          className="!pb-10"
        >
          {items.map((item, index) => (
            <SwiperSlide key={item.id ?? index} className="h-auto">
              <figure className="flex h-full flex-col justify-between rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900">
                <blockquote className="text-sm text-zinc-600 dark:text-zinc-400">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  {item.avatarUrl ? (
                    <Image
                      src={item.avatarUrl}
                      alt=""
                      aria-hidden
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {item.name}
                    </p>
                    {item.role ? (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.role}
                      </p>
                    ) : null}
                  </div>
                </figcaption>
              </figure>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {behavior.navigation ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous testimonial"
            className={cn(arrowClass)}
            disabled={!ready}
            onClick={() => swiperRef.current?.slidePrev()}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
            >
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next testimonial"
            className={cn(arrowClass)}
            disabled={!ready}
            onClick={() => swiperRef.current?.slideNext()}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  )
}
