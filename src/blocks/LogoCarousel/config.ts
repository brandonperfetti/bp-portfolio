import type { Block } from 'payload'

/**
 * Customer/partner/tool logo strip (ported from the Brytecore block set).
 * Scrolls as a seamless marquee or wraps as a static row; the marquee is
 * CSS-driven and disabled under reduced motion (§13).
 */
export const LogoCarousel: Block = {
  slug: 'logoCarousel',
  interfaceName: 'LogoCarouselBlock',
  imageURL: '/images/cms/logo-carousel.svg',
  imageAltText: 'Line-art preview of the Logo Carousel block',
  labels: {
    singular: 'Logo Carousel',
    plural: 'Logo Carousels',
  },
  fields: [
    {
      name: 'logos',
      type: 'array',
      minRows: 1,
      labels: { singular: 'Logo', plural: 'Logos' },
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
          admin: {
            description: 'SVG or transparent PNG; displayed ~40px tall.',
          },
        },
        {
          name: 'url',
          type: 'text',
          admin: {
            description: 'Optional hyperlink. Leave blank for no link.',
          },
        },
      ],
    },
    {
      name: 'logoHeight',
      type: 'number',
      defaultValue: 40,
      min: 16,
      admin: {
        description: 'Display height of each logo in pixels.',
      },
    },
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'scroll',
      options: [
        { label: 'Scroll (marquee)', value: 'scroll' },
        { label: 'Wrap (static rows)', value: 'wrap' },
      ],
    },
    {
      name: 'scrollSpeed',
      type: 'number',
      defaultValue: 40,
      min: 0,
      admin: {
        condition: (_data, siblingData) => siblingData?.layout === 'scroll',
        description: 'Marquee speed in pixels per second (0 disables).',
      },
    },
  ],
}
