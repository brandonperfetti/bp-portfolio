// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_HEADING_LEVEL,
  HEADING_LEVEL_CLASSES,
  HEADING_LEVEL_OPTIONS,
  HEADING_VARIANT_OPTIONS,
  type HeadingBlockLevel,
} from '@/blocks/Heading/levels'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

/**
 * Where each level's class string is already written on the site. The block
 * is supposed to render "the site's heading styles" (#36), which is only
 * true while it renders *these* strings — so they are read back out of their
 * owners rather than trusted.
 */
const SOURCES_OF_TRUTH: Partial<Record<HeadingBlockLevel, string[]>> = {
  h1: [
    // The page title, wherever a route renders one.
    'src/components/SimpleLayout.tsx',
    'src/components/cms/ArticleHeader.tsx',
  ],
  h2: [
    // The section heading the block library already shares.
    'src/blocks/FeatureCardGrid/Component.tsx',
    'src/blocks/FaqList/Component.tsx',
  ],
}

describe('heading block levels', () => {
  it.each(Object.entries(SOURCES_OF_TRUTH))(
    'dresses %s exactly as the rest of the site does',
    (level, files) => {
      for (const file of files as string[]) {
        expect(
          read(file),
          `${file} no longer writes the ${level} class string this block copies`,
        ).toContain(HEADING_LEVEL_CLASSES[level as HeadingBlockLevel])
      }
    },
  )

  it('steps down in size from h1 to h3 at both breakpoints', () => {
    // The about page's hand-built fallback writes `sm:text-3xl` on an h3,
    // which would overtake h2 — the reason h3 is derived rather than copied.
    // Tailwind writes the first step as `text-xl`, not `text-1xl`.
    const scale = (cls: string, prefix: string) => {
      const match = cls.match(new RegExp(`${prefix}text-(\\d?)xl`))
      return Number((match as RegExpMatchArray)[1] || 1)
    }

    const base = (['h1', 'h2', 'h3'] as const).map((level) =>
      scale(HEADING_LEVEL_CLASSES[level], '(?<![\\w:])'),
    )
    const small = (['h1', 'h2', 'h3'] as const).map((level) =>
      scale(HEADING_LEVEL_CLASSES[level], 'sm:'),
    )

    expect(base[0]).toBeGreaterThan(base[1])
    expect(base[1]).toBeGreaterThan(base[2])
    expect(small[0]).toBeGreaterThan(small[1])
    expect(small[1]).toBeGreaterThan(small[2])
  })

  it('offers exactly the levels it can style, and only real tags', () => {
    expect(HEADING_LEVEL_OPTIONS.map((option) => option.value)).toEqual(
      Object.keys(HEADING_LEVEL_CLASSES),
    )
    expect(HEADING_LEVEL_OPTIONS).toHaveLength(3)
  })

  it('offers exactly the two animations AnimatedHeadline implements', () => {
    // #36 adds no variants; if the component grows one, this is the reminder.
    const component = read('src/components/motion/AnimatedHeadline.tsx')
    expect(component).toContain("variant?: 'typewriter' | 'line'")
    expect(HEADING_VARIANT_OPTIONS.map((option) => option.value)).toEqual([
      'line',
      'typewriter',
    ])
  })

  it('defaults to a section heading, not a second page title', () => {
    expect(DEFAULT_HEADING_LEVEL).toBe('h2')
  })
})
