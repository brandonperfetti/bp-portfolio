// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { CheckboxField } from 'payload'

import { describe, expect, it } from 'vitest'

import { ArticlesArchive } from '@/blocks/ArticlesArchive/config'
import { STACKED_REVEAL_PARAMS } from '@/blocks/ArticlesArchive/ArticlesArchiveView'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

const VIEW = 'src/blocks/ArticlesArchive/ArticlesArchiveView.tsx'

/**
 * #34's stacked article treatment was a deliberate copy of the hard-coded home
 * page's article list. Since #42 flipped `/` onto the page builder, Home's list
 * *is* this block's stacked view — there is no second copy to guard against, so
 * these assert the treatment directly on the view (and pin the shared reveal
 * params) rather than cross-checking against the now-deleted home JSX.
 */
describe('stacked articles treatment', () => {
  const view = read(VIEW)

  it('keeps the whole-card hover treatment markers', () => {
    for (const marker of ['data-hover-overlay', 'data-hover-icon']) {
      expect(view).toContain(marker)
    }
    // The wrapper that turns those markers into motion.
    expect(view).toContain('<HoverMotionCard>')
  })

  it('links the whole card to the article, with the read-article label', () => {
    expect(view).toContain('href={`/articles/${article.slug}`}')
    expect(view).toContain('aria-label={`Read article: ${article.title}`}')
  })

  it('stacks rows at the home page rhythm', () => {
    // The gap-16 stacked spacing Home shipped, now owned by the view.
    expect(view).toContain('flex flex-col gap-16')
  })
})

/**
 * #42's opt-in stacked-list reveal: off by default, and when on it reproduces
 * Home's `ScrollReveal targets="article" y={20} stagger={0.08}` around the list.
 */
describe('stacked reveal', () => {
  const revealField = ArticlesArchive.fields.find(
    (field): field is CheckboxField =>
      field.type === 'checkbox' &&
      'name' in field &&
      field.name === 'revealOnScroll',
  )

  it('is an opt-in checkbox that defaults off', () => {
    expect(revealField).toBeDefined()
    expect(revealField?.defaultValue).toBe(false)
  })

  it('carries the homepage article-list reveal params', () => {
    expect(STACKED_REVEAL_PARAMS).toEqual({
      targets: 'article',
      y: 20,
      stagger: 0.08,
    })
  })
})
