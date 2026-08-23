import type { Block } from 'payload'

/**
 * Single media upload block — the canonical way to place a Media-collection
 * asset in layout-builder content, so sizing/optimization stay centralized
 * in the renderer instead of per-page markup.
 *
 * @remarks Legacy as of #33: the `image` block does everything this one does
 * plus tilt, rounding, aspect, hover scale, an LCP `priority` hint and a
 * caption. Kept registered — and unchanged in shape — so the content already
 * using it keeps rendering; the labels below are what point new content at
 * `image` instead. Nothing here touches the schema.
 */
export const MediaBlock: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlock',
  imageURL: '/images/cms/media-block.svg',
  imageAltText: 'Line-art preview of the Media block',
  labels: {
    singular: 'Media (legacy — use Image)',
    plural: 'Media (legacy — use Image)',
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'Existing content only. New images belong in the Image block, which adds cropping, corners, tilt, hover and the above-the-fold loading hint.',
      },
    },
  ],
}
