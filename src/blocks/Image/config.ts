import type { Block } from 'payload'

import { visibilityField } from '@/blocks/visibility'

/**
 * Single image (CMS page builder) with the treatment controls the hand-built
 * pages already use: the about-page portrait's tilt, rounding, square crop
 * and hover scale, plus an LCP `priority` hint and an optional caption.
 *
 * @remarks Supersedes `mediaBlock`, which has exactly one field (`media`)
 * and so can reach none of those. `mediaBlock` stays registered for the
 * content that already uses it (#33 is explicit about that), but the picker
 * copy here is what steers new content to this block.
 *
 * Not a gallery: multi-image layouts belong to `photoStrip`.
 *
 * Every select carries an explicit `enumName` — the block nests three levels
 * deep (`pages.layout` → `container` → `column` → here), where the generated
 * identifier crowds Postgres's 63-character limit and would change the
 * moment the block moves.
 */
export const ImageBlock: Block = {
  slug: 'image',
  interfaceName: 'ImageBlock',
  imageURL: '/images/cms/image.svg',
  imageAltText: 'Line-art preview of the Image block',
  labels: {
    singular: 'Image',
    plural: 'Images',
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'Alt text comes from the Media document, so it stays correct everywhere the asset is used.',
      },
    },
    {
      name: 'aspect',
      type: 'select',
      required: true,
      defaultValue: 'auto',
      enumName: 'enum_image_aspect',
      options: [
        { label: 'Original proportions', value: 'auto' },
        { label: 'Square (1:1)', value: 'square' },
        { label: 'Portrait (3:4)', value: 'portrait' },
        { label: 'Video (16:9)', value: 'video' },
        { label: 'Wide (21:9)', value: 'wide' },
      ],
      admin: {
        description:
          'Anything but "original" crops the image to fill the shape (object-cover).',
      },
    },
    {
      name: 'rounded',
      type: 'select',
      required: true,
      defaultValue: '2xl',
      enumName: 'enum_image_rounded',
      options: [
        { label: 'Square corners', value: 'none' },
        { label: 'Small', value: 'lg' },
        { label: 'Card (matches the site cards)', value: '2xl' },
        { label: 'Circle', value: 'full' },
      ],
    },
    {
      name: 'tilt',
      type: 'select',
      required: true,
      defaultValue: 'none',
      enumName: 'enum_image_tilt',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Tilt left', value: 'left' },
        { label: 'Tilt right (about-page portrait)', value: 'right' },
      ],
      admin: {
        description: 'A 3° rotation, the way the about-page portrait sits.',
      },
    },
    {
      name: 'inset',
      type: 'select',
      required: true,
      defaultValue: 'none',
      enumName: 'enum_image_inset',
      options: [
        { label: 'None (fills its column)', value: 'none' },
        { label: 'Extra small (about-page rail portrait)', value: 'xs' },
      ],
      admin: {
        description:
          'Pad the image in from the left and right edges of the space it was given. "Extra small" (px-2.5, 10px a side) reproduces the breathing room the about-page portrait keeps inside its narrow rail.',
      },
    },
    {
      name: 'hoverScale',
      type: 'checkbox',
      label: 'Scale gently on hover',
      defaultValue: false,
      admin: {
        description:
          'Uses the site hover treatment. Disabled automatically for visitors who prefer reduced motion, and on touch devices.',
      },
    },
    {
      name: 'priority',
      type: 'checkbox',
      label: 'Load eagerly (largest contentful paint)',
      defaultValue: false,
      admin: {
        description:
          'Turn on for the one image above the fold on this page — it is preloaded instead of lazy-loaded. More than one per page makes every one of them slower.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        description: 'Optional. Renders as a caption beneath the image.',
      },
    },
    // Responsive visibility — additive, optional, defaulting to `always`. A
    // mobile-only copy of the portrait is half of how the about page places
    // one image in the desktop rail and another inline on a phone.
    visibilityField(),
  ],
}
