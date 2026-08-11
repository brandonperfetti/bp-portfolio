import type { Block } from 'payload'

/**
 * Single media upload block — the canonical way to place a Media-collection
 * asset in layout-builder content, so sizing/optimization stay centralized
 * in the renderer instead of per-page markup.
 */
export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlock',
  imageURL: '/images/cms/media-block.svg',
  imageAltText: 'Line-art preview of the Media block',
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
  ],
}
