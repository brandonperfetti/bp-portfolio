'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  A11y,
  Autoplay,
  EffectFade,
  Keyboard,
  Pagination,
} from 'swiper/modules'
import { Swiper, SwiperSlide, type SwiperClass } from 'swiper/react'

import 'swiper/css'
import 'swiper/css/pagination'
import 'swiper/css/effect-fade'

import EffectExpo from '@/blocks/Carousel/effectExpo'
import '@/blocks/Carousel/effectExpo.css'
import {
  type CarouselBehaviorInput,
  type CarouselVariant,
  resolveCarouselBehavior,
} from '@/blocks/Carousel/options'
import { getExternalLinkProps } from '@/lib/link-utils'
import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

/** One slide, already resolved by the server Component to plain, serializable data. */
export interface CarouselSlideData {
  /** Stable key from the stored array row, if any. */
  id?: string | null
  /** Resolved media URL. */
  src: string
  /** Alt text (empty string decorates rather than describes). */
  alt: string
  width?: number | null
  height?: number | null
  /** Card title (the `cards` variant). */
  title?: string | null
  /** Card body (the `cards` variant). */
  text?: string | null
  /** Optional link the whole slide points to. */
  href?: string | null
}

/**
 * Props for the client Swiper leaf. Extends the serializable
 * {@link CarouselBehaviorInput} the mapping layer reads, plus the resolved
 * slides and variant. All serializable — the one thing that crosses the
 * server→client boundary — except {@link onSwiper}, which only Storybook and
 * tests pass to reach in and drive the live instance.
 */
export interface CarouselClientProps extends CarouselBehaviorInput {
  variant: CarouselVariant
  slides: CarouselSlideData[]
  /** Test/Storybook hook to capture the Swiper instance; never passed by the server render. */
  onSwiper?: (swiper: SwiperClass) => void
}

/** Wrap a slide in a link when it points somewhere, else a plain container. */
function SlideLink({
  href,
  className,
  children,
}: {
  href?: string | null
  className?: string
  children: React.ReactNode
}) {
  if (!href) return <div className={className}>{children}</div>
  return (
    <Link href={href} {...getExternalLinkProps(href)} className={className}>
      {children}
    </Link>
  )
}

/**
 * The Swiper leaf (CMS page builder). A client component because Swiper needs
 * the browser; it reads the reader's reduced-motion preference reactively and
 * feeds it, with the stored knobs, through the shared
 * {@link resolveCarouselBehavior} mapping — so autoplay stays off unless asked
 * and allowed, and `fade` collapses to `slide` under reduced motion.
 *
 * @remarks Navigation is **instance-ref**, not the deprecated
 * `navigation={{ prevEl, nextEl }}` selector coupling: the custom arrows call
 * `swiper.slidePrev()` / `slideNext()` on the instance captured by `onSwiper`,
 * so there is no DOM-selector handshake to get wrong. Keyboard and A11y modules
 * are always loaded (arrows/tab reach slides); Autoplay, EffectFade, the ported
 * {@link EffectExpo} (parallax + scale, #62) and Pagination load only when the
 * resolved behaviour asks for them, keeping the shipped Swiper surface minimal.
 * Because `expo` collapses to `slide` under reduced motion in the mapper, the
 * Expo module and its transformed DOM never mount for a reduced-motion reader.
 *
 * @param props - Resolved slides + variant + the serializable behaviour knobs.
 */
export function CarouselClient(props: CarouselClientProps) {
  const { variant, slides, onSwiper } = props
  const reducedMotion = usePrefersReducedMotion()
  const swiperRef = useRef<SwiperClass | null>(null)
  const [ready, setReady] = useState(false)

  if (!slides.length) return null

  const behavior = resolveCarouselBehavior(props, { reducedMotion })

  // Key everything off the RESOLVED effect: reduced motion has already
  // collapsed `expo` (and `fade`) to `slide` in the mapper, so under reduced
  // motion `isExpo` is false and neither the Expo module nor its DOM/transforms
  // mount — the media slide renders as a plain, static image instead.
  const isExpo = behavior.effect === 'expo'
  // Vertical is reachable only through expo (the mapper resolves every other
  // effect — and any reduced-motion collapse — to `horizontal`).
  const isVertical = behavior.direction === 'vertical'

  const modules = [Keyboard, A11y]
  if (behavior.pagination) modules.push(Pagination)
  if (behavior.effect === 'fade') modules.push(EffectFade)
  if (isExpo) modules.push(EffectExpo)
  if (behavior.autoplay) modules.push(Autoplay)

  const renderSlide = (slide: CarouselSlideData) => {
    // Expo requires its own per-slide DOM (`.expo-container` > `.expo-image` +
    // optional `.expo-content`) on the actual transformed elements. A plain
    // `<img className="expo-image">` is used deliberately: `next/image` with
    // `fill` injects inline `position:absolute; inset:0; width/height:100%`
    // styles onto the `<img>`, which would override the effect's required
    // `--expo-image-offset` width/left calc (inline beats the stylesheet) and
    // break the parallax. The centred showcase pairs with the `media` framing.
    if (isExpo) {
      return (
        <SlideLink href={slide.href} className="block h-full">
          <div
            className={cn(
              'expo-container w-full bg-zinc-100 dark:bg-zinc-800',
              // Horizontal: the slide takes its height from the photo's aspect
              // ratio. Vertical: Swiper sizes each slide's height from the
              // bounded track height, so the container just fills it.
              isVertical ? 'h-full' : 'aspect-[3/4]',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see note above: next/image fill breaks the Expo positioning */}
            <img
              className="expo-image"
              src={slide.src}
              alt={slide.alt}
              loading="lazy"
              decoding="async"
            />
            {slide.title || slide.text ? (
              <div className="expo-content absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/70 to-transparent p-4 sm:p-6">
                {slide.title ? (
                  <h3 className="text-base font-semibold text-white">
                    {slide.title}
                  </h3>
                ) : null}
                {slide.text ? (
                  <p className="mt-1 text-sm text-zinc-200">{slide.text}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </SlideLink>
      )
    }
    if (variant === 'media') {
      return (
        <SlideLink href={slide.href} className="block h-full">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(min-width: 768px) 60vw, 100vw"
              className="object-cover"
            />
          </div>
        </SlideLink>
      )
    }
    return (
      <SlideLink
        href={slide.href}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover"
          />
        </div>
        {slide.title || slide.text ? (
          <div className="flex flex-1 flex-col gap-2 p-6">
            {slide.title ? (
              <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {slide.title}
              </h3>
            ) : null}
            {slide.text ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {slide.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </SlideLink>
    )
  }

  const arrowClass =
    'flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm transition hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200'

  // Reconcile Swiper's pagination to the brand palette (#66): the active
  // bullet takes the site's teal accent (the `ring-teal-500` the arrows use),
  // inactive bullets the muted zinc the site uses for secondary text
  // (`zinc-500 dark:zinc-400`), and `--swiper-theme-color` is overridden so
  // none of Swiper's default blue (`#007aff`) leaks through. Set as Tailwind
  // arbitrary-property classes so the `dark:` variant handles light/dark and
  // the referenced theme tokens resolve from `tailwind.css`.
  const paginationTokenClass = cn(
    '[--swiper-pagination-color:var(--color-teal-500)]',
    '[--swiper-theme-color:var(--color-teal-500)]',
    '[--swiper-pagination-bullet-inactive-color:var(--color-zinc-500)]',
    '[--swiper-pagination-bullet-inactive-opacity:0.6]',
    'dark:[--swiper-pagination-bullet-inactive-color:var(--color-zinc-400)]',
  )

  return (
    <div
      className={cn('relative', paginationTokenClass)}
      data-testid="carousel"
    >
      <Swiper
        // Remount across the expo boundary so a runtime collapse to `slide`
        // (reduced motion turning on after a first expo paint) starts from a
        // clean instance: Swiper adds its `swiper-expo` modifier class and
        // `--expo-padding` imperatively at init and does not reconcile them when
        // the effect later changes, so without a fresh key the degraded track
        // would keep expo's chrome. Non-expo effects share one key, so `fade`↔
        // `slide` still transition in place as before.
        key={isExpo ? 'carousel-expo' : 'carousel-plain'}
        onSwiper={(swiper) => {
          swiperRef.current = swiper
          setReady(true)
          onSwiper?.(swiper)
        }}
        onBeforeInit={(swiper) => {
          // Expo's params are a custom (non-core) Swiper param, so they can't
          // ride a `<Swiper>` prop without leaking as an unknown DOM attribute.
          // The ported module installs these exact defaults via `extendParams`;
          // assigning here keeps the resolved value the single source and lets
          // any future CMS override flow through. Runs before `init` (where the
          // effect reads `expoEffect`), so the first paint is already correct.
          if (behavior.expoEffect) {
            ;(
              swiper.params as typeof swiper.params & {
                expoEffect?: typeof behavior.expoEffect
              }
            ).expoEffect = behavior.expoEffect
          }
        }}
        slidesPerView={behavior.slidesPerViewMobile}
        direction={behavior.direction}
        centeredSlides={behavior.centeredSlides}
        spaceBetween={16}
        breakpoints={{
          [behavior.desktopBreakpoint]: {
            slidesPerView: behavior.slidesPerView,
          },
        }}
        loop={behavior.loop}
        effect={behavior.effect}
        fadeEffect={
          behavior.effect === 'fade' ? { crossFade: true } : undefined
        }
        autoplay={behavior.autoplay}
        pagination={behavior.pagination ? { clickable: true } : false}
        keyboard={{ enabled: true }}
        a11y={{ enabled: true }}
        modules={modules}
        // Vertical expo needs a bounded track height or Swiper collapses its
        // slides to zero (the Pro demo sets a height on `.swiper` for vertical);
        // a viewport-relative height, capped, keeps 0 overflow at every width
        // (the effect's cross-axis padding lives inside `box-sizing: border-box`).
        // Horizontal keeps the bottom padding that seats the pagination dots.
        className={cn(
          isVertical ? 'h-[70vh] max-h-[640px] min-h-[420px]' : '!pb-10',
        )}
      >
        {slides.map((slide, index) => (
          <SwiperSlide key={slide.id ?? index} className="h-auto">
            {renderSlide(slide)}
          </SwiperSlide>
        ))}
      </Swiper>

      {behavior.navigation ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous slide"
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
            aria-label="Next slide"
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
