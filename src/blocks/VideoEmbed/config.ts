import type { Block } from 'payload'

/**
 * YouTube/Vimeo embed. URLs normalize to privacy-enhanced embed hosts;
 * anything unrecognized renders as a plain link rather than an iframe.
 */
export const VideoEmbed: Block = {
  slug: 'videoEmbed',
  interfaceName: 'VideoEmbedBlock',
  imageURL: '/images/cms/video-embed.svg',
  imageAltText: 'Line-art preview of the Video Embed block',
  labels: { singular: 'Video Embed', plural: 'Video Embeds' },
  fields: [
    {
      name: 'url',
      type: 'text',
      required: true,
      admin: { description: 'YouTube or Vimeo URL.' },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'Accessible title for the embed.' },
    },
  ],
}
