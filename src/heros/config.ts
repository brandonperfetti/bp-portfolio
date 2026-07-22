import type { Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { linkGroup } from '@/fields/linkGroup'

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
      name: 'shaderPreset',
      type: 'select',
      admin: {
        condition: (_, { type } = {}) => type === 'shader',
        description: 'shaders.com preset rendered behind the hero text.',
      },
      defaultValue: 'northern-lights-2',
      options: [
        { label: 'Northern Lights 2 (aurora)', value: 'northern-lights-2' },
        { label: 'Ribbon Flows 4', value: 'ribbon-flows-4' },
        { label: 'Synthesis 14', value: 'synthesis-14' },
        { label: 'Drifting Lights 8', value: 'drifting-lights-8' },
        { label: 'Static Noise 4 (light)', value: 'static-noise-4' },
      ],
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
