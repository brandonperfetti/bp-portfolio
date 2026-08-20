import type { Block } from 'payload'

/**
 * Parallax photo strip (the home-page gallery as a reusable block).
 *
 * @remarks The home route renders its Pages doc's first `photoStrip` block in
 * the hero slot (and excludes it from the end-of-page CMS region), so editing
 * this block on the Home page swaps the gallery photos in place.
 */
export const PhotoStrip: Block = {
  slug: 'photoStrip',
  interfaceName: 'PhotoStripBlock',
  imageURL: '/images/cms/photo-strip.svg',
  imageAltText: 'Line-art preview of the Photo Strip block',
  labels: {
    singular: 'Photo Strip',
    plural: 'Photo Strips',
  },
  fields: [
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      required: true,
      admin: {
        description:
          'Photos for the parallax strip — about five fills it best. On the Home page this block replaces the default gallery under the hero.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'fullBleed',
          type: 'checkbox',
          label: 'Full bleed (edge to edge)',
          defaultValue: false,
          admin: {
            width: '50%',
            description:
              'Break the strip out of the reading column to the full viewport width — the homepage gallery placement. Off by default, so the strip stays inside the column like every other block.',
          },
        },
        {
          name: 'priority',
          type: 'checkbox',
          label: 'Load as priority (LCP)',
          defaultValue: false,
          admin: {
            width: '50%',
            description:
              'Mark the first photo as the page’s priority image — use only when this strip is the largest thing above the fold (the homepage hero slot). Off by default so it competes with nothing.',
          },
        },
      ],
    },
  ],
}
