// @vitest-environment node
import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { Banner } from '@/blocks/Banner/config'
import { Code } from '@/blocks/Code/config'
import { Column } from '@/blocks/Column/config'
import { pageBuilderBlocks } from '@/blocks/library'

/**
 * Guards issue #22: every block an editor can pick — the 21 page-builder
 * blocks, the two rich-text-only blocks (Banner, Code), and the nested-only
 * `column` (#23) — ships a thumbnail under `public/images/cms/` so the
 * admin picker is scannable.
 */
describe('block picker thumbnails', () => {
  const allBlocks = [...pageBuilderBlocks, Banner, Code, Column]

  it('registers the expected page-builder library', () => {
    // 17 through W1B5, plus `socialLinks` (#32) and `image` (#33) in W2B1,
    // plus `prose` (#35) and `heading` (#36) in W2B2, plus `lead` (#44/W4B1),
    // plus `carousel` (#41/W6B1).
    expect(pageBuilderBlocks).toHaveLength(23)
  })

  it.each(allBlocks.map((block) => [block.slug, block] as const))(
    '%s carries an existing SVG thumbnail and alt text',
    (_slug, block) => {
      expect(block.imageURL).toMatch(/^\/images\/cms\/[a-z0-9-]+\.svg$/)
      const file = path.join(process.cwd(), 'public', block.imageURL as string)
      expect(existsSync(file), `missing thumbnail file: ${file}`).toBe(true)
      expect(block.imageAltText).toBeTruthy()
    },
  )

  it('gives every block a distinct thumbnail', () => {
    const urls = allBlocks.map((block) => block.imageURL)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
