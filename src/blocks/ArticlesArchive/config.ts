import type { Block } from 'payload'

/**
 * Recent-articles section (website-template "Archive" pattern): a server
 * block that queries published posts at render time — content stays live
 * with zero admin upkeep.
 *
 * @remarks The `variant` select carries an explicit `enumName`: the block
 * nests three levels deep (`pages.layout` → `container` → `column` → here),
 * where the generated identifier crowds Postgres's 63-character limit and
 * would change the moment the block moves.
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
      name: 'variant',
      type: 'select',
      required: true,
      defaultValue: 'grid',
      enumName: 'enum_articles_archive_variant',
      options: [
        { label: 'Card grid', value: 'grid' },
        { label: 'Stacked list (home page)', value: 'stacked' },
      ],
      admin: {
        description:
          'Card grid is up to three cards across, ending in a “Browse all articles” link. Stacked list is the home page treatment: one article per row with the hover overlay and the whole card clickable, and no browse link — pair it with a column for the home-page layout.',
      },
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 12,
      admin: { description: 'How many recent articles to show.' },
    },
    {
      name: 'revealOnScroll',
      type: 'checkbox',
      label: 'Reveal articles on scroll',
      defaultValue: false,
      admin: {
        description:
          'Fade the articles up one after another as they scroll into view — the home-page treatment for the stacked list. Off by default. Honors reduced motion (renders static).',
      },
    },
  ],
}
