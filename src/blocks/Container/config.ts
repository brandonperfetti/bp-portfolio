import type { Block } from 'payload'

import { Column } from '@/blocks/Column/config'
import {
  DEFAULT_SECTION_BACKGROUND_DIRECTION,
  DEFAULT_SECTION_BACKGROUND_GRADIENT,
  DEFAULT_SECTION_BACKGROUND_STYLE,
  DEFAULT_SECTION_BACKGROUND_TINT,
  SECTION_BACKGROUND_DIRECTION_OPTIONS,
  SECTION_BACKGROUND_GRADIENT_OPTIONS,
  SECTION_BACKGROUND_STYLE_OPTIONS,
  SECTION_BACKGROUND_TINT_OPTIONS,
} from '@/blocks/Container/background'
import {
  CONTAINER_GAP_OPTIONS,
  CONTAINER_VERTICAL_ALIGN_OPTIONS,
  DEFAULT_CONTAINER_GAP,
  DEFAULT_CONTAINER_VERTICAL_ALIGN,
} from '@/blocks/Container/layout'
import {
  DEFAULT_SECTION_PADDING_Y,
  DEFAULT_SECTION_RHYTHM,
  DEFAULT_SECTION_WIDTH,
  SECTION_PADDING_Y_OPTIONS,
  SECTION_RHYTHM_OPTIONS,
  SECTION_WIDTH_OPTIONS,
  validateAnchorId,
} from '@/blocks/Container/section'

/**
 * Multi-column layout shell — the block that makes columns hold *blocks*
 * rather than rich text, so a page can pair (say) an article list with a
 * contact rail.
 *
 * @remarks Registered at layout root only, and holds nothing but `column`
 * blocks; the columns hold the leaf blocks. The grid controls (`gap`,
 * `verticalAlign`) and the section shell (`section.width`, `paddingY`,
 * `anchorId`, `hidden`, `background`) all default to the behaviour the block
 * had before they existed, so pages built against the plain grid render
 * unchanged.
 */
export const Container: Block = {
  slug: 'container',
  interfaceName: 'ContainerBlock',
  imageURL: '/images/cms/container.svg',
  imageAltText: 'Line-art preview of the Container block',
  labels: {
    singular: 'Container',
    plural: 'Containers',
  },
  fields: [
    {
      name: 'columns',
      type: 'blocks',
      blocks: [Column],
      minRows: 1,
      label: 'Columns',
      admin: {
        initCollapsed: true,
        description:
          'Columns share a 12-column grid from the lg breakpoint up — two thirds plus one third fills a row, for example. They stack on smaller screens.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'gap',
          type: 'select',
          required: true,
          defaultValue: DEFAULT_CONTAINER_GAP,
          enumName: 'enum_container_gap',
          options: [...CONTAINER_GAP_OPTIONS],
          admin: {
            width: '50%',
            description:
              'Space between columns (and between them when stacked). Large widens from the lg breakpoint up to match the homepage’s two-column gutter.',
          },
        },
        {
          name: 'verticalAlign',
          type: 'select',
          required: true,
          defaultValue: DEFAULT_CONTAINER_VERTICAL_ALIGN,
          enumName: 'enum_container_vertical_align',
          options: [...CONTAINER_VERTICAL_ALIGN_OPTIONS],
          admin: {
            width: '50%',
            description:
              'How columns of different heights line up beside each other. A sticky column always aligns to the top.',
          },
        },
      ],
    },
    {
      name: 'section',
      type: 'group',
      label: 'Section',
      admin: {
        description:
          'How this section sits on the page: how wide it runs, how much air it carries, whether it can be linked to, and whether it renders at all.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'width',
              type: 'select',
              required: true,
              defaultValue: DEFAULT_SECTION_WIDTH,
              enumName: 'enum_container_section_width',
              options: [...SECTION_WIDTH_OPTIONS],
              admin: {
                width: '50%',
                description:
                  'Container keeps the page’s reading width. Full bleed escapes it edge to edge — the homepage photo-strip look.',
              },
            },
            {
              name: 'paddingY',
              type: 'select',
              required: true,
              defaultValue: DEFAULT_SECTION_PADDING_Y,
              enumName: 'enum_container_section_padding_y',
              options: [...SECTION_PADDING_Y_OPTIONS],
              admin: {
                width: '50%',
                description:
                  'Extra space above and below the section, on top of the spacing its blocks already carry.',
              },
            },
          ],
        },
        {
          name: 'rhythm',
          type: 'select',
          defaultValue: DEFAULT_SECTION_RHYTHM,
          enumName: 'enum_container_section_rhythm',
          options: [...SECTION_RHYTHM_OPTIONS],
          admin: {
            description:
              'Outer spacing above and below the section. Default keeps the compact rhythm every container has always had; Home matches the two-column rhythm of the hard-coded homepage grid.',
          },
        },
        {
          name: 'anchorId',
          type: 'text',
          label: 'Anchor',
          validate: (value: string | null | undefined) =>
            validateAnchorId(value),
          admin: {
            description:
              'Optional. Makes the section linkable as #anchor — lowercase letters, numbers, hyphens and underscores, starting with a letter.',
          },
        },
        {
          name: 'hidden',
          type: 'checkbox',
          label: 'Hide this section',
          defaultValue: false,
          admin: {
            description:
              'Leaves the section out of the page entirely — not hidden with CSS, so its content never reaches the browser.',
          },
        },
        {
          name: 'background',
          type: 'group',
          label: 'Background',
          admin: {
            description:
              'A curated zinc palette rather than a colour picker, so every section stays inside the design system and reads correctly in both light and dark. Backgrounds usually want some vertical padding above.',
          },
          fields: [
            {
              name: 'style',
              type: 'select',
              required: true,
              defaultValue: DEFAULT_SECTION_BACKGROUND_STYLE,
              enumName: 'enum_container_section_bg_style',
              options: [...SECTION_BACKGROUND_STYLE_OPTIONS],
              admin: {
                description:
                  'Paint the section with a flat tint or a two-stop gradient. None leaves the page background showing, as before.',
              },
            },
            {
              name: 'tint',
              type: 'select',
              required: true,
              defaultValue: DEFAULT_SECTION_BACKGROUND_TINT,
              enumName: 'enum_container_section_bg_tint',
              options: [...SECTION_BACKGROUND_TINT_OPTIONS],
              admin: {
                condition: (_data, siblingData) =>
                  siblingData?.style === 'tint',
                description:
                  'Each tint carries its own light and dark value — pick by how much separation the section needs, not by colour.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'gradient',
                  type: 'select',
                  required: true,
                  defaultValue: DEFAULT_SECTION_BACKGROUND_GRADIENT,
                  enumName: 'enum_container_section_bg_gradient',
                  options: [...SECTION_BACKGROUND_GRADIENT_OPTIONS],
                  admin: {
                    width: '50%',
                    condition: (_data, siblingData) =>
                      siblingData?.style === 'gradient',
                    description:
                      'Two zinc stops. Fade ends transparent, so the page background finishes the ramp.',
                  },
                },
                {
                  name: 'direction',
                  type: 'select',
                  required: true,
                  defaultValue: DEFAULT_SECTION_BACKGROUND_DIRECTION,
                  enumName: 'enum_container_section_bg_gradient_direction',
                  options: [...SECTION_BACKGROUND_DIRECTION_OPTIONS],
                  admin: {
                    width: '50%',
                    condition: (_data, siblingData) =>
                      siblingData?.style === 'gradient',
                    description:
                      'Which way the gradient runs. Upwards reverses a ramp without needing a mirrored palette entry.',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
