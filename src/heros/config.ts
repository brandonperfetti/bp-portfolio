import type { Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { linkGroup } from '@/fields/linkGroup'
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
