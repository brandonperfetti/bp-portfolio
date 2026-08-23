import type { Block } from 'payload'

import {
  BlockquoteFeature,
  BlocksFeature,
  ChecklistFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  IndentFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  lexicalEditor,
  OrderedListFeature,
  UnorderedListFeature,
  UploadFeature,
} from '@payloadcms/richtext-lexical'

import { Banner } from '@/blocks/Banner/config'
import { Code } from '@/blocks/Code/config'

/**
 * Long-form rich text (CMS page builder), rendered with the article body's
 * typography.
 *
 * @remarks Exists because the about page's body had to ride on the hero
 * group's `richText` to get that typography — a layering smell the audit
 * flagged (#35). A page's prose is page content, not hero content.
 *
 * The editor registers **every node type the Posts body registers**, which
 * is not cosmetic: `parseEditorState` throws the minified Lexical error #17
 * ("type 'list' not found") and error-boundaries the whole field the moment
 * stored content contains a node whose feature is missing. Since the point
 * of this block is to receive body content that was authored elsewhere —
 * the about page's, migrated from Notion — the feature set has to be a
 * superset of every editor that content may have come from. It is: the hero
 * group's editor (`src/heros/config.ts`) is `rootFeatures` + headings +
 * toolbars, all of which are here.
 *
 * One deliberate narrowing against Posts: `BlocksFeature` offers Banner and
 * Code but not MediaBlock. The renderer this block shares with articles
 * (`lexicalToBlocks` → `ArticleBody`) has cases for `banner` and `code` and
 * none for `mediaBlock`, so an embedded media block renders nothing — in
 * Posts too, today. Images inside a page belong to the `image` block, which
 * has the treatment controls; offering an editor a block that silently
 * disappears would be the worse trade.
 */
export const ProseBlock: Block = {
  slug: 'prose',
  interfaceName: 'ProseBlock',
  imageURL: '/images/cms/prose.svg',
  imageAltText: 'Line-art preview of the Prose block',
  labels: {
    singular: 'Prose',
    plural: 'Prose',
  },
  fields: [
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: false,
      admin: {
        description:
          'Long-form body copy. Renders with exactly the typography an article body gets.',
      },
      editor: lexicalEditor({
        features: ({ rootFeatures }) => [
          ...rootFeatures,
          HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
          BlocksFeature({ blocks: [Banner, Code] }),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
          HorizontalRuleFeature(),
          UnorderedListFeature(),
          OrderedListFeature(),
          ChecklistFeature(),
          BlockquoteFeature(),
          UploadFeature(),
          InlineCodeFeature(),
          IndentFeature(),
        ],
      }),
    },
  ],
}
