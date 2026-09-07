// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { COLUMN_CONTENT_BLOCKS } from '@/blocks/Column/config'
import {
  type BlockHostDocument,
  COLUMN_STACK_SPACING_CLASS,
  DEFAULT_BLOCK_HOST_CONTEXT,
  blockRhythmClass,
  zeroConfigCardWidthClass,
  zeroConfigCardWidthClassFor,
} from '@/blocks/hostContext'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

/**
 * Source with every block and line comment stripped, for the audits that must
 * not match a file's own prose about the thing it deliberately avoids doing.
 */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** The block grids that swapped viewport variants for container queries (F1). */
const CONTEXT_AWARE_GRIDS = [
  // The archive's grid moved to its presentational half in W2B2 (#34), where
  // the stacked variant lives beside it.
  'src/blocks/ArticlesArchive/ArticlesArchiveView.tsx',
  'src/blocks/FeatureCardGrid/Component.tsx',
  'src/blocks/Stats/Component.tsx',
  'src/blocks/Testimonials/Component.tsx',
  'src/blocks/Content/Component.tsx',
]

/**
 * Directory holding each column-eligible block's Component — the slug and the
 * folder agree everywhere except `cta`/`CallToAction`.
 */
const COLUMN_ELIGIBLE_BLOCK_DIRS: Record<string, string> = {
  articlesArchive: 'ArticlesArchive',
  carousel: 'Carousel',
  contactForm: 'ContactForm',
  cta: 'CallToAction',
  faqList: 'FaqList',
  featureCardGrid: 'FeatureCardGrid',
  heading: 'Heading',
  image: 'Image',
  lead: 'Lead',
  logoCarousel: 'LogoCarousel',
  mediaBlock: 'MediaBlock',
  newsletterSignup: 'NewsletterSignup',
  photoStrip: 'PhotoStrip',
  postRollup: 'PostRollup',
  prose: 'Prose',
  socialLinks: 'SocialLinks',
  spacer: 'Spacer',
  stats: 'Stats',
  testimonials: 'Testimonials',
  videoEmbed: 'VideoEmbed',
  workHistoryCard: 'WorkHistoryCard',
}

/**
 * The five blocks W1B5 left behind (#40's residual), plus every block added
 * or rebuilt since — all of which take their outer margin from the host.
 *
 * `shaderHero` is here despite never being column-eligible: #39 rebuilt it on
 * the hero card presentation and it now reads its rhythm from the host like
 * every other leaf, which leaves no hard-coded `my-12` anywhere in the block
 * library.
 */
const RHYTHM_CONVERTED_BLOCKS = [
  'src/blocks/CallToAction/Component.tsx',
  'src/blocks/ShaderHero/Component.tsx',
  'src/blocks/FaqList/Component.tsx',
  'src/blocks/Heading/Component.tsx',
  'src/blocks/Image/ImageView.tsx',
  'src/blocks/LogoCarousel/Component.tsx',
  'src/blocks/MediaBlock/Component.tsx',
  'src/blocks/PostRollup/PostRollupView.tsx',
  'src/blocks/Prose/Component.tsx',
  'src/blocks/SocialLinks/SocialLinksView.tsx',
  'src/blocks/VideoEmbed/Component.tsx',
]

/**
 * The blocks with no width control of their own (F3), each paired with the
 * width helper it is required to call.
 *
 * Named per file rather than checked with one shared substring because the
 * work block is the #188 exception: it picks its measure by mode, so it calls
 * the two-argument helper. A substring check on `zeroConfigCardWidthClass`
 * would pass for `…For` too and stop distinguishing them.
 */
const ZERO_CONFIG_CARDS: Array<[file: string, helper: string]> = [
  ['src/blocks/ContactForm/Component.tsx', 'zeroConfigCardWidthClass(hosted)'],
  [
    'src/blocks/NewsletterSignup/Component.tsx',
    'zeroConfigCardWidthClass(hosted)',
  ],
  [
    'src/blocks/WorkHistoryCard/Component.tsx',
    'zeroConfigCardWidthClassFor(hosted,',
  ],
]

/** Just the paths, for the audits that do not care which helper is called. */
const ZERO_CONFIG_CARD_FILES = ZERO_CONFIG_CARDS.map(([file]) => file)

describe('block host context', () => {
  it('assumes root, so every pre-existing call site renders unchanged', () => {
    expect(DEFAULT_BLOCK_HOST_CONTEXT).toBe('root')
    expect(blockRhythmClass(DEFAULT_BLOCK_HOST_CONTEXT)).toBe('my-12')
    expect(zeroConfigCardWidthClass(DEFAULT_BLOCK_HOST_CONTEXT)).toBe(
      'max-w-xl',
    )
  })

  it('treats missing context as root — CMS data and old callers pass neither', () => {
    for (const value of [null, undefined]) {
      expect(blockRhythmClass(value)).toBe('my-12')
      expect(zeroConfigCardWidthClass(value)).toBe('max-w-xl')
    }
  })

  it('hands the vertical rhythm to the column, and the width to the editor', () => {
    // Empty rather than `my-0`: an omitted utility can't tie with the
    // column's `space-y-*` on specificity, so the gap doesn't depend on
    // Tailwind's class ordering.
    expect(blockRhythmClass('column')).toBe('')
    expect(zeroConfigCardWidthClass('column')).toBe('max-w-none')
  })

  /**
   * The #188 matrix, all four cells, because the change is a widening at
   * exactly one of them and every other cell is what must NOT move.
   *
   * | | `entry` (content) | list (form) |
   * |---|---|---|
   * | root | `max-w-none` ← the change | `max-w-xl` |
   * | column | `max-w-none` | `max-w-none` |
   */
  it.each([
    ['root', 'content', 'max-w-none'],
    ['root', 'form', 'max-w-xl'],
    ['column', 'content', 'max-w-none'],
    ['column', 'form', 'max-w-none'],
  ] as const)('a %s-hosted %s card is %s', (hosted, measure, expected) => {
    expect(zeroConfigCardWidthClassFor(hosted, measure)).toBe(expected)
  })

  it('keeps the form cards on the measure they already shipped (#188)', () => {
    // The one-argument helper is now the `form` case, and delegating must not
    // have moved the contact form or the newsletter signup by a pixel.
    for (const hosted of ['root', 'column', null, undefined] as const) {
      expect(zeroConfigCardWidthClass(hosted)).toBe(
        zeroConfigCardWidthClassFor(hosted, 'form'),
      )
    }
    expect(zeroConfigCardWidthClassFor(null, 'form')).toBe('max-w-xl')
    // A missing context is root, so an entry card still widens there.
    expect(zeroConfigCardWidthClassFor(undefined, 'content')).toBe('max-w-none')
  })

  /**
   * The parity gate for the column stack: the intra-column rhythm is Home's
   * rail stacked-card spacing (`space-y-10`). Since #42 flipped Home onto the
   * builder, its rail is a `Column`, so this constant *is* that rhythm. Pinned
   * to the literal Home shipped.
   */
  it('stacks column blocks at the homepage rail rhythm', () => {
    expect(COLUMN_STACK_SPACING_CLASS).toBe('space-y-10')
  })

  it('puts that spacing on the column shell itself', () => {
    expect(read('src/blocks/Column/ColumnShell.tsx')).toContain(
      'COLUMN_STACK_SPACING_CLASS',
    )
  })
})

/**
 * F1's regression guard. A viewport variant on a block grid is the defect:
 * it makes the block lay out against the window instead of the space it was
 * given, which is how a half column at desktop ended up with three ~150px
 * columns. Reading the sources keeps that from creeping back in a block this
 * batch already converted.
 */
describe('context-aware block grids', () => {
  it.each(CONTEXT_AWARE_GRIDS)(
    '%s declares its own query container',
    (file) => {
      expect(read(file)).toMatch(/className="[^"]*@container/)
    },
  )

  it.each(CONTEXT_AWARE_GRIDS)('%s sizes nothing off the viewport', (file) => {
    const source = read(file)
    expect(source).not.toMatch(/(?<![@\w-])(sm|md|lg|xl):grid-cols-/)
    expect(source).not.toMatch(/(?<![@\w-])(sm|md|lg|xl):col-span-/)
  })

  it.each([
    ...CONTEXT_AWARE_GRIDS,
    ...ZERO_CONFIG_CARD_FILES,
    ...RHYTHM_CONVERTED_BLOCKS,
  ])('%s takes its outer rhythm from the host context', (file) => {
    const source = read(file)
    expect(source).toContain('blockRhythmClass')
    expect(source).not.toContain('"my-12')
  })

  it.each(ZERO_CONFIG_CARDS)(
    '%s fills the column it is given, via %s',
    (file, helper) => {
      expect(read(file)).toContain(helper)
    },
  )

  it('covers every column-eligible block in the directory map', () => {
    // A block added to columns without an entry here would slip past the
    // margin audit below.
    expect(new Set(COLUMN_CONTENT_BLOCKS.map((block) => block.slug))).toEqual(
      new Set(Object.keys(COLUMN_ELIGIBLE_BLOCK_DIRS)),
    )
  })

  /**
   * A block a column can hold that still hard-codes `my-12` keeps the
   * doubled rhythm F2 is about, because the column's `space-y-*` cannot undo
   * a margin the block sets on itself. W1B5 converted eight blocks and named
   * the five it left behind (`cta`, `faqList`, `logoCarousel`, `mediaBlock`,
   * `videoEmbed`) here as a list someone could pick up; this batch converted
   * them, so the list is now empty and the assertion is the guard.
   */
  it('leaves no column-eligible block carrying its own margin', () => {
    const stillHardCoded = Object.entries(COLUMN_ELIGIBLE_BLOCK_DIRS)
      .filter(([, dir]) =>
        read(`src/blocks/${dir}/Component.tsx`).includes('my-12'),
      )
      .map(([slug]) => slug)

    expect(stillHardCoded).toEqual([])
  })
})

/**
 * The block render path, top to bottom: the readers that hold the hosting
 * document, the dispatcher, and the container/column recursion that is the
 * only way to a nested block.
 */
const HOST_DOC_RENDER_PATH = [
  'src/heros/RenderRhythmPage.tsx',
  'src/components/cms/CmsPageBlocks.tsx',
  'src/components/cms/CmsPostBlocks.tsx',
  'src/blocks/RenderBlocks.tsx',
  'src/blocks/Container/Component.tsx',
  'src/blocks/Column/Component.tsx',
  'src/blocks/PostRollup/Component.tsx',
]

/**
 * The three readers that already load the hosting document, paired with the
 * collection each one is reading. Nothing else in the app is in a position to
 * name a host: every other route reaches blocks through one of these.
 */
const HOST_DOC_READERS: Array<[file: string, collection: string]> = [
  ['src/heros/RenderRhythmPage.tsx', 'pages'],
  ['src/components/cms/CmsPageBlocks.tsx', 'pages'],
  ['src/components/cms/CmsPostBlocks.tsx', 'posts'],
]

/**
 * The hosting document a block is rendering inside (#177) — the *identity*
 * half of block context, beside the *position* half `hosted` already carried.
 *
 * #152's design said an empty page picker should roll up the posts placed
 * under the page the block is on, and that was never built for exactly one
 * reason: `RenderBlocks` gave a block no way to know which document it was
 * composed on. These are the invariants that make the answer available
 * without making it expensive.
 */
describe('block host document', () => {
  it('names a collection as well as an id', () => {
    // Both `pages` and `posts` host layout blocks and both use numeric ids, so
    // an id alone is ambiguous: a rollup querying `parent = 7` without the
    // collection would happily roll up the wrong document's children.
    const page: BlockHostDocument = { collection: 'pages', id: 7 }
    const post: BlockHostDocument = { collection: 'posts', id: 7 }

    expect(page.collection).not.toBe(post.collection)
    expect(page.id).toBe(post.id)
  })

  it.each(HOST_DOC_READERS)(
    '%s hands its blocks a %s host document',
    (file, collection) => {
      const match = read(file).match(/hostDoc=\{\{\s*collection: '(\w+)'/)
      expect(match?.[1]).toBe(collection)
    },
  )

  it('routes the host document through the container, the only way to a column', () => {
    // `RenderBlocks` → `container` → `column` → `RenderBlocks` is the sole path
    // a nested block has. A container that swallowed `hostDoc` would leave a
    // column-nested block unable to learn a fact its root-level twin knows,
    // which is the behaviour split #177 exists to prevent.
    expect(read('src/blocks/RenderBlocks.tsx')).toMatch(
      /<ContainerBlockComponent[\s\S]{0,120}hostDoc=\{hostDoc\}/,
    )
    expect(read('src/blocks/Container/Component.tsx')).toMatch(
      /<ColumnBlockComponent[\s\S]{0,120}hostDoc=\{props\.hostDoc\}/,
    )
  })

  it('forwards it on both of the column’s dispatch branches', () => {
    // A column dispatches its blocks as one batch, or one at a time when
    // `revealChildren` is on. Two call sites, so two chances to drop it.
    const column = read('src/blocks/Column/Component.tsx')
    expect(column.match(/hostDoc=\{hostDoc\}/g)).toHaveLength(2)
  })

  it.each(HOST_DOC_RENDER_PATH)('%s reads no request scope', (file) => {
    // The whole point of threading a prop is that a block stays
    // prerenderable. Recovering "which page am I on?" from `headers()` or
    // `cookies()` would opt every page carrying such a block out of static
    // rendering — a steep price for a fact the caller already had in hand.
    //
    // Comments are stripped first: several of these files *discuss* the
    // `headers()` read they deliberately do not perform, and a check that
    // failed on its own rationale would be a check nobody could satisfy
    // honestly.
    const source = withoutComments(read(file))
    expect(source).not.toMatch(/\b(headers|cookies|draftMode|connection)\(/)
    expect(source).not.toContain('next/headers')
  })
})
