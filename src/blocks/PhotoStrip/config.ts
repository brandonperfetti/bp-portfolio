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
  ],
}
