// @vitest-environment node
import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { Banner } from '@/blocks/Banner/config'
import { Code } from '@/blocks/Code/config'
import { pageBuilderBlocks } from '@/blocks/library'

/**
 * Guards issue #22: every block an editor can pick — the 16 page-builder
 * blocks plus the two rich-text-only blocks (Banner, Code) — ships a
 * thumbnail under `public/images/cms/` so the admin picker is scannable.
 */
describe('block picker thumbnails', () => {
  const allBlocks = [...pageBuilderBlocks, Banner, Code]

  it('registers the expected page-builder library', () => {
    expect(pageBuilderBlocks).toHaveLength(16)
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
