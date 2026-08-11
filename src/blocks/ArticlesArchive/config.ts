import type { Block } from 'payload'

/**
 * Recent-articles section (website-template "Archive" pattern): a server
 * block that queries published posts at render time — content stays live
 * with zero admin upkeep.
 */
export const ArticlesArchive: Block = {
  slug: 'articlesArchive',
  interfaceName: 'ArticlesArchiveBlock',
  imageURL: '/images/cms/articles-archive.svg',
  imageAltText: 'Line-art preview of the Articles Archive block',
  labels: { singular: 'Articles Archive', plural: 'Articles Archives' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 12,
      admin: { description: 'How many recent articles to show.' },
    },
  ],
}
