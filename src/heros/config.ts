import type { Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { CAROUSEL_EFFECT_OPTIONS } from '@/blocks/Carousel/options'
import { linkGroup } from '@/fields/linkGroup'
import {
  DEFAULT_HERO_HEADLINE_VARIANT,
  HERO_HEADLINE_VARIANT_ENUM_NAME,
  HERO_HEADLINE_VARIANT_OPTIONS,
} from '@/heros/content'
import { normalizeHeroHook } from '@/heros/normalizeHeroByType'
import {
  DEFAULT_HERO_CAROUSEL_EFFECT,
  DEFAULT_HERO_PRESENTATION,
  HERO_CAROUSEL_EFFECT_ENUM_NAME,
  HERO_PRESENTATION_ENUM_NAME,
  HERO_PRESENTATION_OPTIONS,
} from '@/heros/presentation'
import {
  DEFAULT_ROUTE_RHYTHM,
  ROUTE_RHYTHM_ENUM_NAME,
  ROUTE_RHYTHM_OPTIONS,
} from '@/heros/routeRhythm'
import {
  DEFAULT_SHADER_PRESET,
  SHADER_PRESET_OPTIONS,
} from '@/heros/shaderPresets'

/**
 * Hero field group for layout-builder Pages.
 *
 * @remarks `shader` renders the shaders.com preset background behind
 * server-rendered hero text (Phase 6 wires the component; the config ships
 * first so content modeling is stable). `preset` selects the swappable
 * shaders.com preset; hero text stays in the HTML for LCP/SEO.
 *
 * **Visibility matrix** (`admin.condition`, asserted in `content.test.ts`):
 *
 * | field | blank | none | standard | shader | image | carousel |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | `presentation` | – | – | – | ✓ | – | – |
 * | `shaderPreset` | – | – | – | ✓ | – | – |
 * | `media` | – | – | ✓ | – | ✓ | – |
 * | `slides` | – | – | – | – | – | ✓ |
 * | `effect` | – | – | – | – | – | ✓ |
 * | `headlineVariant` | – | ✓ | ✓ | ✓ | ✓ | ✓ |
 * | `showSocialLinks` | – | ✓ | ✓ | ✓ | ✓ | ✓ |
 * | `revealContent` | – | ✓ | ✓ | ✓ | ✓ | ✓ |
 *
 * The `headlineVariant`/`showSocialLinks`/`revealContent` rows are true for
 * every type except `blank` because **all of them render the content stack** —
 * `type: none` is "no hero *decoration*", not "no hero": it renders the page
 * title, subtitle, hero rich text and links in the SimpleLayout look, and
 * `image`/`carousel` overlay that same stack on a full-bleed surface (see
 * `HeroView`). Gating them off would hide a control that visibly does
 * something. If any of those types ever stops rendering a headline, the matrix
 * test is the place that says so.
 *
 * `media` widens to `image`, which reuses the one upload as a full-bleed banner
 * rather than an inset image; `slides` and `effect` are carousel-only (the
 * `carousel` type's slide source and its transition).
 *
 * `blank` is the exception, and the reason every content-field row shows `–`
 * for it: `blank` renders **nothing at all** (no `<header>`, no content
 * stack — see `HeroView`), so a page whose headline lives in an in-column
 * `heading` block, the way the about page composes it, is not doubled by a
 * hero drawing its own. Every field is therefore meaningless under `blank`
 * and gated off it. `blank` is opt-in: the default is `standard`, and no
 * stored page selects it until an edit does.
 *
 * The hero group has **no `subtitle`** on purpose: `Pages.subtitle` already
 * exists and already feeds this hero, the homepage and the meta description.
 * See {@link HERO_SUBTITLE_CLASS}.
 */
export const hero: Field = {
  name: 'hero',
  type: 'group',
  hooks: {
    // Keep the stored hero consistent with its type — clear content the type
    // does not render so it can't linger hidden and resurface (see #58).
    beforeChange: [normalizeHeroHook],
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      defaultValue: 'standard',
      label: 'Type',
      admin: {
        description:
          'Controls what the hero renders above the page body. Blank draws nothing — use it when the headline lives in the Content tab (e.g. the About page). None, Standard, Shader, Image, and Carousel all render the Title, Subtitle, and the Hero text field; Standard adds an inset image below, Shader an animated background, and Image and Carousel bleed a full-width image (or image carousel) with the content overlaid. If your headline/intro already live in the Content tab, choose Blank so they do not render twice.',
      },
      options: [
        {
          label: 'Blank — no hero at all (headline lives in the page body)',
          value: 'blank',
        },
        {
          label: 'None — title + subtitle + hero text, no background image',
          value: 'none',
        },
        {
          label: 'Standard — title + subtitle + hero text, with an image',
          value: 'standard',
        },
        {
          label:
            'Shader — title + subtitle + hero text, over an animated background',
          value: 'shader',
        },
        {
          label: 'Image — full-bleed image with the title overlaid',
          value: 'image',
        },
        {
          label: 'Carousel — full-bleed image carousel with the title overlaid',
          value: 'carousel',
        },
      ],
      required: true,
    },
    {
      name: 'presentation',
      type: 'select',
      admin: {
        condition: (_, { type } = {}) => type === 'shader',
        description:
          'Full bleed runs the shader behind the header like the homepage; card keeps it inside a bounded panel.',
      },
      defaultValue: DEFAULT_HERO_PRESENTATION,
      enumName: HERO_PRESENTATION_ENUM_NAME,
      options: [...HERO_PRESENTATION_OPTIONS],
    },
    {
      name: 'shaderPreset',
      type: 'select',
      admin: {
        condition: (_, { type } = {}) => type === 'shader',
        description: 'shaders.com preset rendered behind the hero text.',
      },
      defaultValue: DEFAULT_SHADER_PRESET,
      options: [...SHADER_PRESET_OPTIONS],
    },
    {
      name: 'rhythm',
      type: 'select',
      admin: {
        condition: (_, { type } = {}) => type === 'shader',
        description:
          'Home parity pulls the hero flush to the top with the homepage’s vertical rhythm (for a page meant to read like the homepage); standard keeps the page-builder default. Only affects the full-bleed treatment.',
      },
      defaultValue: DEFAULT_ROUTE_RHYTHM,
      enumName: ROUTE_RHYTHM_ENUM_NAME,
      label: 'Route rhythm',
      options: [...ROUTE_RHYTHM_OPTIONS],
    },
    {
      name: 'headlineVariant',
      type: 'select',
      admin: {
        // Every content field is hidden under `blank`, which renders no hero
        // at all (see the visibility matrix above and `HeroView`).
        condition: (_, { type } = {}) => type !== 'blank',
        description:
          'How the page title animates in. Typewriter is the Home/About treatment; both fall back to static text under reduced motion.',
      },
      defaultValue: DEFAULT_HERO_HEADLINE_VARIANT,
      enumName: HERO_HEADLINE_VARIANT_ENUM_NAME,
      label: 'Headline animation',
      options: [...HERO_HEADLINE_VARIANT_OPTIONS],
    },
    {
      name: 'showSocialLinks',
      type: 'checkbox',
      admin: {
        condition: (_, { type } = {}) => type !== 'blank',
        description:
          'Show the profile icon row under the hero, from the Identity global’s social links. Edit the list in Globals → Identity; per-page lists live in the Social links block instead.',
      },
      defaultValue: false,
      label: 'Show social links',
    },
    {
      name: 'revealContent',
      type: 'checkbox',
      admin: {
        condition: (_, { type } = {}) => type !== 'blank',
        description:
          'Fade the subtitle and social row up on scroll, the way the homepage hero does. Off by default. Honors reduced motion (renders static). The headline keeps its own animation either way.',
      },
      defaultValue: false,
      label: 'Reveal subtitle and socials on scroll',
    },
    {
      name: 'richText',
      type: 'richText',
      admin: {
        // Hidden under `blank` like every other hero content field: a blank
        // hero renders nothing, so a hero-text editor there only invites the
        // duplication it caused on the about page (see HeroView / #58).
        condition: (_, { type } = {}) => type !== 'blank',
        description:
          'Rich text shown inside the hero, below the subtitle. Rendered for None, Standard, and Shader; ignored when Type is Blank. Keep this distinct from the page body in the Content tab — putting the same copy in both renders it twice.',
      },
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [
            ...rootFeatures,
            HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ]
        },
      }),
      label: 'Hero text',
    },

    linkGroup({
      overrides: {
        maxRows: 2,
      },
    }),
    {
      name: 'media',
      type: 'upload',
      admin: {
        // `standard` insets the image below the content stack; `image` bleeds it
        // full-width with the content overlaid. Both draw the single upload.
        condition: (_, { type } = {}) =>
          type === 'standard' || type === 'image',
      },
      relationTo: 'media',
    },
    {
      // The `carousel` hero's slides — the carousel block's own slide shape
      // (`image` + `title` + `text` + `href`), so `RenderHero` resolves them
      // exactly as `CarouselComponent` does and the reused `CarouselClient`
      // reads a familiar row. `minRows: 1` with no `required` is a soft floor:
      // Payload skips array-length validation for an empty, non-required array,
      // so a non-carousel page (which carries no slides) still saves, while an
      // editor building a carousel is nudged to add a slide.
      name: 'slides',
      type: 'array',
      minRows: 1,
      labels: { singular: 'Slide', plural: 'Slides' },
      admin: {
        condition: (_, { type } = {}) => type === 'carousel',
        initCollapsed: true,
        description:
          'Slides for the full-bleed carousel hero. Each needs an image; the title and text overlay the slide, and an optional link points the whole slide somewhere.',
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
      // The carousel hero's transition, drawn from the same five-effect
      // vocabulary the block offers — but on its OWN hero-scoped enum
      // (`HERO_CAROUSEL_EFFECT_ENUM_NAME`), a distinct Postgres type from the
      // block's `enum_carousel_effect`. Not required (a type-gated field), with
      // a default, mirroring the shader-gated selects above. Full-bleed,
      // autoplay-off and nav/pagination are FIXED for the hero carousel and
      // resolved in `HeroView`, so they are not surfaced as editor knobs.
      name: 'effect',
      type: 'select',
      admin: {
        condition: (_, { type } = {}) => type === 'carousel',
        description:
          'How the carousel transitions between slides. Reduced motion collapses Fade, Expo, Carousel 3D, and Spring to Slide.',
      },
      defaultValue: DEFAULT_HERO_CAROUSEL_EFFECT,
      enumName: HERO_CAROUSEL_EFFECT_ENUM_NAME,
      label: 'Carousel effect',
      options: [...CAROUSEL_EFFECT_OPTIONS],
    },
  ],
  label: false,
}
