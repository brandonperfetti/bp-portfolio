import type { Block } from 'payload'

import {
  DEFAULT_AUTOPLAY_INTERVAL_MS,
  DEFAULT_EXPO_ROTATE,
  DEFAULT_SLIDES_PER_VIEW,
  DEFAULT_SLIDES_PER_VIEW_MOBILE,
  EXPO_MAX_ROTATE,
  MAX_SLIDES_PER_VIEW,
  MIN_AUTOPLAY_INTERVAL_MS,
  carouselDirectionField,
  carouselEffectField,
  carouselVariantField,
  isExpoEffectSelected,
  isHeroEffectSelected,
} from '@/blocks/Carousel/options'

/**
 * Generic carousel (CMS page builder) — the foundation Wave 6 stands on.
 *
 * @remarks A repeatable set of slides plus the behaviour knobs that map onto
 * Swiper React (`slidesPerView` + a mobile override, `autoplay` + interval,
 * `loop`, `effect`, `navigation`, `pagination`). The block's Component resolves
 * the stored data to plain props and hands them to a `'use client'` Swiper leaf
 * — the repo's server/presentational split, with the leaf a client component
 * because Swiper needs the browser. Every later Wave-6 variant (#61–#64) and
 * the carousel hero (#65) reuse this mapping rather than re-deriving it.
 *
 * The slides model mirrors the existing repeatable-media blocks (`photoStrip`,
 * `logoCarousel`, `testimonials`): an array of `{ image, title, text, href }`,
 * simple and additive. `cards` renders the whole card; `media` renders just the
 * image.
 *
 * Every select carries an explicit `enumName` — the block is column-eligible,
 * so it nests three levels deep (`pages.layout` → `container` → `column` →
 * here), where the generated identifier crowds Postgres's 63-character limit
 * and would change the moment the block moves (the `image`/`heading` scar).
 */
export const Carousel: Block = {
  slug: 'carousel',
  interfaceName: 'CarouselBlock',
  imageURL: '/images/cms/carousel.svg',
  imageAltText: 'Line-art preview of the Carousel block',
  labels: { singular: 'Carousel', plural: 'Carousels' },
  fields: [
    carouselVariantField(),
    {
      name: 'slides',
      type: 'array',
      minRows: 1,
      labels: { singular: 'Slide', plural: 'Slides' },
      admin: {
        initCollapsed: true,
        // Editor-facing half of #68.3. The Expo effect renders its photo
        // through a plain `<img>` (next/image `fill` breaks the effect's
        // `--expo-image-offset` positioning), so a multi-MB original is
        // decoded on every slide change — the nav-INP long task staging QA
        // measured. Cloudinary media gets a width-transformed `srcset`
        // automatically (see `expoImageSource` in `CarouselClient.tsx`), but
        // anything else is served at its original size, so the guidance is
        // worth surfacing where the upload actually happens.
        description:
          'Use reasonably-sized images, especially for the Expo effect: Expo shows each photo at full bleed and cannot use Next.js image optimization, so a multi-megabyte original is re-decoded on every slide change and shows up as sluggish arrows. Around 1600px wide is plenty.',
      },
      fields: [
        { name: 'image', type: 'upload', relationTo: 'media', required: true },
        { name: 'title', type: 'text' },
        { name: 'text', type: 'textarea' },
        {
          name: 'href',
          type: 'text',
          admin: { description: 'Optional link the whole slide points to.' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Behaviour',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'slidesPerView',
              type: 'number',
              defaultValue: DEFAULT_SLIDES_PER_VIEW,
              min: 1,
              max: MAX_SLIDES_PER_VIEW,
              admin: {
                width: '50%',
                description: `Slides shown at once on desktop (1–${MAX_SLIDES_PER_VIEW}). Fade always shows one.`,
              },
            },
            {
              name: 'slidesPerViewMobile',
              type: 'number',
              defaultValue: DEFAULT_SLIDES_PER_VIEW_MOBILE,
              min: 1,
              max: MAX_SLIDES_PER_VIEW,
              admin: {
                width: '50%',
                description: 'Slides shown at once on small screens.',
              },
            },
          ],
        },
        carouselEffectField(),
        // Expo-only controls (#62 addendum), gated on `effect === 'expo'` so the
        // generic slide/fade carousels stay uncluttered. All nullable-with-
        // default, so existing CarouselBlock rows/fixtures stay valid.
        {
          type: 'row',
          fields: [
            carouselDirectionField(),
            {
              name: 'rotate',
              type: 'number',
              defaultValue: DEFAULT_EXPO_ROTATE,
              min: 0,
              max: EXPO_MAX_ROTATE,
              admin: {
                width: '50%',
                condition: isExpoEffectSelected,
                description: `Expo only: side-slide tilt in degrees (0–${EXPO_MAX_ROTATE}). 0 keeps them flat.`,
              },
            },
          ],
        },
        {
          name: 'grayscale',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            condition: isExpoEffectSelected,
            description:
              'Expo only: desaturate the off-centre slides so the centred photo stays the focus. On by default.',
          },
        },
        {
          name: 'fullBleed',
          type: 'checkbox',
          defaultValue: true,
          label: 'Full bleed (edge to edge)',
          admin: {
            condition: isHeroEffectSelected,
            description:
              'Expo (horizontal), Carousel 3D, and Spring only: break the carousel out to the full viewport width so the side panels reach the screen edges. On by default; ignored for the Expo vertical direction.',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'loop',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description: 'Wrap from the last slide back to the first.',
              },
            },
            {
              name: 'navigation',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Show previous / next arrows.',
              },
            },
            {
              name: 'pagination',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Show the pagination dots.' },
            },
            {
              name: 'autoplay',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Advance slides automatically. Off by default, and always disabled for readers who prefer reduced motion.',
              },
            },
          ],
        },
        {
          name: 'interval',
          type: 'number',
          defaultValue: DEFAULT_AUTOPLAY_INTERVAL_MS,
          min: MIN_AUTOPLAY_INTERVAL_MS,
          admin: {
            condition: (_data, siblingData) => Boolean(siblingData?.autoplay),
            description: `Milliseconds each slide dwells before autoplay advances (min ${MIN_AUTOPLAY_INTERVAL_MS}).`,
          },
        },
      ],
    },
  ],
}
