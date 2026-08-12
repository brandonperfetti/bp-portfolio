import type { Block } from 'payload'

import { ArticlesArchive } from '@/blocks/ArticlesArchive/config'
import { CallToAction } from '@/blocks/CallToAction/config'
import { ContactForm } from '@/blocks/ContactForm/config'
import { FaqList } from '@/blocks/FaqList/config'
import { FeatureCardGrid } from '@/blocks/FeatureCardGrid/config'
import { Heading } from '@/blocks/Heading/config'
import { ImageBlock } from '@/blocks/Image/config'
import { Lead } from '@/blocks/Lead/config'
import { LogoCarousel } from '@/blocks/LogoCarousel/config'
import { MediaBlock } from '@/blocks/MediaBlock/config'
import { NewsletterSignup } from '@/blocks/NewsletterSignup/config'
import { PhotoStrip } from '@/blocks/PhotoStrip/config'
import { ProseBlock } from '@/blocks/Prose/config'
import { SocialLinks } from '@/blocks/SocialLinks/config'
import { Spacer } from '@/blocks/Spacer/config'
import { Stats } from '@/blocks/Stats/config'
import { Testimonials } from '@/blocks/Testimonials/config'
import { VideoEmbed } from '@/blocks/VideoEmbed/config'
import { WorkHistoryCard } from '@/blocks/WorkHistoryCard/config'
import {
  COLUMN_INSET_ENUM_NAME,
  COLUMN_INSET_OPTIONS,
  DEFAULT_COLUMN_INSET,
} from '@/blocks/Column/inset'
import { COLUMN_SIZE_OPTIONS, DEFAULT_COLUMN_SIZE } from '@/blocks/Column/sizes'

/**
 * The leaf blocks an editor can drop inside a column — the page-builder
 * library minus three deliberate omissions:
 *
 * - `container` — containers nest only at layout root; a grid inside a grid
 *   column is a layout the size vocabulary can't express honestly.
 * - `content` — the legacy rich-text block carries its own column array, so
 *   allowing it here means columns inside columns.
 * - `shaderHero` — hero-scale by construction (full-bleed animated panel);
 *   it stays a root-level block. Deprecated as of #39 on top of that, which
 *   settles the question rather than reopening it: the block was never in
 *   this list, and a block whose picker label reads "legacy" must not be
 *   offered for *new* column content. Removing it here would have been a
 *   no-op; leaving it out is the decision, and `COLUMN_EXCLUDED_BLOCK_SLUGS`
 *   plus `config.test.ts` are what keep it out. Stored root-level
 *   `shaderHero` blocks are untouched and keep rendering.
 *
 * @remarks Listed explicitly rather than filtered from `pageBuilderBlocks`
 * on purpose: `library.ts` imports the container, which imports this file,
 * so reading the library here would be a module cycle evaluated before the
 * library exists. `config.test.ts` closes the gap — it asserts this list is
 * exactly the library minus those three slugs, so a block added to the
 * library can't silently skip columns.
 */
export const COLUMN_CONTENT_BLOCKS: Block[] = [
  ArticlesArchive,
  CallToAction,
  ContactForm,
  FaqList,
  FeatureCardGrid,
  Heading,
  ImageBlock,
  Lead,
  LogoCarousel,
  MediaBlock,
  NewsletterSignup,
  PhotoStrip,
  ProseBlock,
  SocialLinks,
  Spacer,
  Stats,
  Testimonials,
  VideoEmbed,
  WorkHistoryCard,
]

/** Slugs deliberately withheld from {@link COLUMN_CONTENT_BLOCKS}. */
export const COLUMN_EXCLUDED_BLOCK_SLUGS = [
  'container',
  'content',
  'shaderHero',
] as const

/**
 * One column of a `container` grid: a width plus the blocks stacked inside
 * it. Only ever used nested — it is not registered at layout root.
 *
 * @remarks `size` names a share of the 12-column grid from `lg` up; every
 * column is full width below that (see `sizes.ts`), and `sticky` is the one
 * blessed desktop sticky behaviour (see `sticky.ts`). The explicit `enumName`
 * keeps the Postgres enum identifier short and stable — the generated name
 * for a block this deeply nested runs at the 63-character limit, and it
 * would change again the moment the block moves.
 */
export const Column: Block = {
  slug: 'column',
  interfaceName: 'ColumnBlock',
  imageURL: '/images/cms/column.svg',
  imageAltText: 'Line-art preview of the Column block',
  labels: {
    singular: 'Column',
    plural: 'Columns',
  },
  admin: {
    components: {
      Label: '@/blocks/Column/RowLabel#ColumnRowLabel',
    },
  },
  fields: [
    {
      name: 'size',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_COLUMN_SIZE,
      enumName: 'enum_column_size',
      options: [...COLUMN_SIZE_OPTIONS],
      admin: {
        description:
          'Share of the 12-column grid from the lg breakpoint up. Every column is full width on smaller screens.',
      },
    },
    {
      name: 'sticky',
      type: 'checkbox',
      label: 'Stick to the top while scrolling',
      defaultValue: false,
      admin: {
        description:
          'Desktop only: from the lg breakpoint up this column follows the scroll beside its taller neighbour (the homepage rail). Below lg it stacks normally and nothing sticks.',
      },
    },
    {
      name: 'contentInset',
      type: 'select',
      // Optional (not required) so the additive field leaves existing
      // ColumnBlock fixtures and stored docs valid without a value; the
      // renderer treats a null/absent inset as `none` (see `inset.ts`).
      defaultValue: DEFAULT_COLUMN_INSET,
      enumName: COLUMN_INSET_ENUM_NAME,
      options: [...COLUMN_INSET_OPTIONS],
      label: 'Content inset',
      admin: {
        description:
          'Push this column’s content in from its left edge, from the lg breakpoint up. Rail gutter (lg:pl-16 xl:pl-24) matches the homepage right rail — pair it with a container gap of “Home parity” so the columns sit flush and the gutter falls between them.',
      },
    },
    {
      name: 'revealChildren',
      type: 'checkbox',
      label: 'Reveal children on scroll',
      defaultValue: false,
      admin: {
        description:
          'Fade each block in this column up one after another as it scrolls into view — the homepage rail treatment. Off by default. Honors reduced motion (renders static). Below the lg breakpoint it reveals the same way.',
      },
    },
    {
      name: 'content',
      type: 'blocks',
      blocks: COLUMN_CONTENT_BLOCKS,
      label: 'Column content',
      admin: {
        initCollapsed: true,
      },
    },
  ],
}
