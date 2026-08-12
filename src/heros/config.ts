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
import {
  DEFAULT_HERO_PRESENTATION,
  HERO_PRESENTATION_ENUM_NAME,
  HERO_PRESENTATION_OPTIONS,
} from '@/heros/presentation'
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
 * | field | none | standard | shader |
 * | --- | --- | --- | --- |
 * | `presentation` | – | – | ✓ |
 * | `shaderPreset` | – | – | ✓ |
 * | `media` | – | ✓ | – |
 * | `headlineVariant` | ✓ | ✓ | ✓ |
 * | `showSocialLinks` | ✓ | ✓ | ✓ |
 *
 * The last two rows are unconditional because **all three types render the
 * content stack** — `type: none` is "no hero *decoration*", not "no hero":
 * it renders the page title, subtitle, hero rich text and links in the
 * SimpleLayout look (see `HeroView`). Gating them off `none` would hide a
 * control that visibly does something. If `none` ever stops rendering a
 * headline, the matrix test is the place that says so.
 *
 * The hero group has **no `subtitle`** on purpose: `Pages.subtitle` already
 * exists and already feeds this hero, the homepage and the meta description.
 * See {@link HERO_SUBTITLE_CLASS}.
 */
export const hero: Field = {
  name: 'hero',
  type: 'group',
  fields: [
    {
      name: 'type',
      type: 'select',
      defaultValue: 'standard',
      label: 'Type',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Standard', value: 'standard' },
        { label: 'Shader', value: 'shader' },
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
      name: 'headlineVariant',
      type: 'select',
      admin: {
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
        description:
          'Show the profile icon row under the hero, from the Identity global’s social links. Edit the list in Globals → Identity; per-page lists live in the Social links block instead.',
      },
      defaultValue: false,
      label: 'Show social links',
    },
    {
      name: 'richText',
      type: 'richText',
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
      label: false,
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
