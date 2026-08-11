import type { Block } from 'payload'

import { Column } from '@/blocks/Column/config'
import {
  CONTAINER_GAP_OPTIONS,
  CONTAINER_VERTICAL_ALIGN_OPTIONS,
  DEFAULT_CONTAINER_GAP,
  DEFAULT_CONTAINER_VERTICAL_ALIGN,
} from '@/blocks/Container/layout'
import {
  DEFAULT_SECTION_PADDING_Y,
  DEFAULT_SECTION_WIDTH,
  SECTION_PADDING_Y_OPTIONS,
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
 * `anchorId`, `hidden`) all default to the behaviour the block had before
 * they existed, so pages built against the plain grid render unchanged.
 * Backgrounds still live elsewhere (#37).
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
      ],
    },
  ],
}
