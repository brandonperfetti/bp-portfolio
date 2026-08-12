// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

const HOME_ROUTE = 'src/app/(frontend)/page.tsx'
const VIEW = 'src/blocks/ArticlesArchive/ArticlesArchiveView.tsx'

/** The route's `Article` component — the treatment #34 duplicates. */
function homeArticleSource(homepage: string) {
  const start = homepage.indexOf('function Article({')
  expect(
    start,
    'the home page no longer defines an `Article` component — re-derive the stacked variant from whatever replaced it',
  ).toBeGreaterThan(-1)
  const end = homepage.indexOf('\n}\n', start)
  return homepage.slice(start, end)
}

/**
 * #34's parity gate, in the shape `hostContext.test.ts` uses for the column
 * stack spacing: the stacked variant is a deliberate copy of the home page's
 * article list, and the copy is only safe while something reads both files
 * and fails when they drift.
 *
 * The duplication itself is expected — the route keeps rendering its own
 * `Article` until #42 flips the home page onto the page builder. Until then
 * this test is what makes "pixel-for-pixel" a fact rather than a claim.
 */
describe('stacked articles ↔ home page parity', () => {
  const homepage = read(HOME_ROUTE)
  const view = read(VIEW)
  const article = homeArticleSource(homepage)

  const classNames = [...article.matchAll(/className="([^"]+)"/g)].map(
    ([, value]) => value,
  )

  it('finds the class strings it is guarding', () => {
    // Overlay, full-card link, hover icon — if the route stops writing three
    // of them, the assertion below would pass vacuously.
    expect(classNames.length).toBeGreaterThanOrEqual(3)
  })

  it.each(classNames)('carries the home treatment class string: %s', (cls) => {
    expect(view).toContain(cls)
  })

  it('reuses the home page card markers the hover treatment keys off', () => {
    for (const marker of ['data-hover-overlay', 'data-hover-icon']) {
      expect(article).toContain(marker)
      expect(view).toContain(marker)
    }
    // The wrapper that turns those markers into motion.
    expect(article).toContain('<HoverMotionCard>')
    expect(view).toContain('<HoverMotionCard>')
  })

  it('links the whole card to the same target, with the same label', () => {
    for (const fragment of [
      'href={`/articles/${article.slug}`}',
      'aria-label={`Read article: ${article.title}`}',
    ]) {
      expect(article).toContain(fragment)
      expect(view).toContain(fragment)
    }
  })

  it('stacks rows at the home page rhythm', () => {
    const stack = homepage.match(/className="(flex flex-col gap-\d+)"/)
    expect(
      stack,
      'the home page no longer stacks its article list with `flex flex-col gap-*` — re-derive the stacked variant spacing',
    ).not.toBeNull()

    const [, spacing] = stack as RegExpMatchArray
    expect(view).toContain(spacing)
  })

  it('leaves the home page route untouched by this block', () => {
    // #34 is explicit: extract the treatment, don't edit the route (#42
    // owns that flip). If the route ever imports the block, this batch's
    // premise — two copies, guarded — no longer holds.
    expect(homepage).not.toContain('ArticlesArchive')
  })
})
