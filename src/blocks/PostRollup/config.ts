import type { Block } from 'payload'

/**
 * Post rollup (#152): the block a section or topic landing page uses to show
 * *its* posts, rather than the site's most recent ones.
 *
 * @remarks It generalises `ArticlesArchive` rather than replacing it.
 * `ArticlesArchive` answers "the newest N articles on the site" and needs no
 * configuration; this answers "the articles that belong to *this* section",
 * which is a query an editor has to name. The two share one card vocabulary —
 * `grid` and `stacked` here render through `ArticlesArchiveView`, so a card on
 * a section page and a card on the home page can never drift.
 *
 * ## `source` — two ways to say "belongs here"
 *
 * - `by-category` — published posts carrying the selected `categories` row.
 *   The one that works on day one: every migrated post already has topics, so
 *   a category landing page composes with no further data entry.
 * - `by-placement` — published posts whose `parent` is the selected page
 *   (#153 placement). Empty on a corpus where nothing has been placed, which
 *   is why it is not the default.
 *
 * ## Every select carries an explicit `enumName`
 *
 * Not optional here, for the reason `ArticlesArchive/config.ts:6-12` records:
 * the block nests three levels deep (`pages.layout` → `container` → `column` →
 * here), where Payload's generated enum identifier crowds Postgres's
 * 63-character limit and would change the moment the block is moved.
 */
export const PostRollup: Block = {
  slug: 'postRollup',
  interfaceName: 'PostRollupBlock',
  imageURL: '/images/cms/post-rollup.svg',
  imageAltText: 'Line-art preview of the Post Rollup block',
  labels: { singular: 'Post Rollup', plural: 'Post Rollups' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'by-category',
      enumName: 'enum_post_rollup_source',
      options: [
        { label: 'By category', value: 'by-category' },
        {
          label: 'By placement (articles parented to a page)',
          value: 'by-placement',
        },
      ],
      admin: {
        description:
          'By category rolls up every published article carrying the topic you pick — it works today, on the topics articles already have. By placement rolls up the articles filed under a section page.',
      },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: false,
      admin: {
        condition: (_data, siblingData) =>
          siblingData?.source === 'by-category',
        description: 'The topic whose articles this section rolls up.',
      },
    },
    {
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
      admin: {
        condition: (_data, siblingData) =>
          siblingData?.source === 'by-placement',
        // #177 built the design's "leave empty to use the hosting page"
        // fallback: `RenderBlocks` now carries the hosting document's
        // collection and id (`hostContext.ts`'s `BlockHostDocument`), so the
        // block can resolve "this page" without a request-scope read. The
        // description promises the fallback and names its one exception rather
        // than leaving an editor to discover it on an article: the block is
        // registered on Posts too, and "the posts placed under the page this
        // block is on" has no meaning under a post, so there the empty picker
        // still rolls up nothing — the same empty branch an unset category
        // takes, never the whole corpus.
        description:
          'The section page whose placed articles this rolls up. Leave empty on a page and it rolls up that page’s own placed articles. On an article, leave it empty and the section renders nothing — pick a page instead.',
      },
    },
    {
      name: 'sort',
      type: 'select',
      defaultValue: 'newest',
      enumName: 'enum_post_rollup_sort',
      options: [
        { label: 'Newest first', value: 'newest' },
        { label: 'Oldest first', value: 'oldest' },
        { label: 'Title (A–Z)', value: 'title' },
      ],
      admin: { description: 'Order the rolled-up articles are shown in.' },
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 6,
      min: 1,
      max: 12,
      admin: { description: 'How many articles to show.' },
    },
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'grid',
      enumName: 'enum_post_rollup_layout',
      options: [
        { label: 'Card grid', value: 'grid' },
        { label: 'Stacked list', value: 'stacked' },
        { label: 'Compact list', value: 'compact-list' },
      ],
      admin: {
        description:
          'Card grid and stacked list are the two treatments the Articles Archive block already renders — same cards, same hover. Compact list is a dense, dated index for a section page that leads with prose.',
      },
    },
    {
      name: 'revealOnScroll',
      type: 'checkbox',
      label: 'Reveal articles on scroll',
      defaultValue: false,
      admin: {
        description:
          'Fade the articles up one after another as they scroll into view. Off by default. Honors reduced motion (renders static).',
      },
    },
  ],
}
