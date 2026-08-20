// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { COLUMN_CONTENT_BLOCKS } from '@/blocks/Column/config'
import {
  COLUMN_STACK_SPACING_CLASS,
  DEFAULT_BLOCK_HOST_CONTEXT,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

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
  'src/blocks/Prose/Component.tsx',
  'src/blocks/SocialLinks/SocialLinksView.tsx',
  'src/blocks/VideoEmbed/Component.tsx',
]

/** The blocks with no width control of their own (F3). */
const ZERO_CONFIG_CARDS = [
  'src/blocks/ContactForm/Component.tsx',
  'src/blocks/NewsletterSignup/Component.tsx',
  'src/blocks/WorkHistoryCard/Component.tsx',
]

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
    ...ZERO_CONFIG_CARDS,
    ...RHYTHM_CONVERTED_BLOCKS,
  ])('%s takes its outer rhythm from the host context', (file) => {
    const source = read(file)
    expect(source).toContain('blockRhythmClass')
    expect(source).not.toContain('"my-12')
  })

  it.each(ZERO_CONFIG_CARDS)('%s fills the column it is given', (file) => {
    expect(read(file)).toContain('zeroConfigCardWidthClass')
  })

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
