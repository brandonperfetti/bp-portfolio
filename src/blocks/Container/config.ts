import type { Block } from 'payload'

import { Column } from '@/blocks/Column/config'

/**
 * Multi-column layout shell — the block that makes columns hold *blocks*
 * rather than rich text, so a page can pair (say) an article list with a
 * contact rail.
 *
 * @remarks Registered at layout root only, and holds nothing but `column`
 * blocks; the columns hold the leaf blocks. Width, background, padding and
 * sticky behaviour deliberately live elsewhere (#29/#30/#37) — this block
 * renders a plain 12-column grid inside the route's existing container
 * width and nothing more.
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
  ],
}
