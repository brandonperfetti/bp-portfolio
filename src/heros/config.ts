import type { Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { linkGroup } from '@/fields/linkGroup'
import {
  DEFAULT_HERO_HEADLINE_VARIANT,
  HERO_HEADLINE_VARIANT_ENUM_NAME,
  HERO_HEADLINE_VARIANT_OPTIONS,
} from '@/heros/content'
import { normalizeHeroHook } from '@/heros/normalizeHeroByType'
import {
  DEFAULT_HERO_PRESENTATION,
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
 * | field | blank | none | standard | shader |
 * | --- | --- | --- | --- | --- |
 * | `presentation` | – | – | – | ✓ |
 * | `shaderPreset` | – | – | – | ✓ |
 * | `media` | – | – | ✓ | – |
 * | `headlineVariant` | – | ✓ | ✓ | ✓ |
 * | `showSocialLinks` | – | ✓ | ✓ | ✓ |
 * | `revealContent` | – | ✓ | ✓ | ✓ |
 *
 * The `headlineVariant`/`showSocialLinks`/`revealContent` rows are true for
 * `none`, `standard` and `shader` because **those three types render the
 * content stack** — `type: none` is "no hero *decoration*", not "no hero":
 * it renders the page title, subtitle, hero rich text and links in the
 * SimpleLayout look (see `HeroView`). Gating them off `none` would hide a
 * control that visibly does something. If `none` ever stops rendering a
 * headline, the matrix test is the place that says so.
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
          'Controls what the hero renders above the page body. Blank draws nothing — use it when the headline lives in the Content tab (e.g. the About page). None, Standard, and Shader all render the Title, Subtitle, and the Hero text field below; Standard adds an image and Shader adds an animated background. If your headline/intro already live in the Content tab, choose Blank so they do not render twice.',
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
        condition: (_, { type } = {}) => type === 'standard',
      },
      relationTo: 'media',
    },
  ],
  label: false,
}
