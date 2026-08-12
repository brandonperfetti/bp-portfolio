import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  COLUMN_CONTENT_BLOCKS,
  COLUMN_EXCLUDED_BLOCK_SLUGS,
} from '@/blocks/Column/config'
import {
  SHADER_HERO_BLOCK_CONTENT_CLASS,
  ShaderHeroBlockComponent,
} from '@/blocks/ShaderHero/Component'
import { ShaderHero } from '@/blocks/ShaderHero/config'
import { pageBuilderBlocks } from '@/blocks/library'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_PANEL_CLASS,
  HERO_CARD_SHELL_CLASS,
} from '@/heros/presentation'
import type { ShaderHeroBlock } from '@/payload-types'

// The canvas arrives through next/dynamic and never SSRs; jsdom has neither
// WebGPU nor WebGL2, so only the static-gradient fallback renders here.
vi.mock('next/dynamic', () => ({ default: () => () => null }))

beforeAll(() => {
  // jsdom ships no matchMedia; the reduced-motion hook calls it on mount.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  // No canvas backend either — answer the WebGL2 probe with "no GPU" rather
  // than letting jsdom log "Not implemented" on every render.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => null,
  })
})

const richText = {
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          { type: 'text', version: 1, text: 'A bounded animated panel.' },
        ],
      },
    ],
  },
}

const block = (overrides: Partial<ShaderHeroBlock> = {}) =>
  ({
    blockType: 'shaderHero',
    preset: 'northern-lights-2',
    ...overrides,
  }) as unknown as ShaderHeroBlock

/** The decorative canvas frame — the block's only `aria-hidden` child. */
const frame = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"]') as HTMLElement

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

/**
 * #39. The block used to draw its own shader panel: its own gradient
 * fallback, its own `dynamic(() => import(ShaderBackground))`, its own
 * reduced-motion and WebGPU probes, and its own copy of the rounded-card
 * markup. All four now come from the hero system's `card` presentation, so a
 * shader change happens once.
 */
describe('shaderHero block delegates to the hero card presentation', () => {
  it('renders the hero card shell, with the block rhythm on top of it', () => {
    const { container } = render(<ShaderHeroBlockComponent {...block()} />)
    const section = container.querySelector('section') as HTMLElement

    for (const token of HERO_CARD_SHELL_CLASS.split(' ')) {
      expect(section).toHaveClass(token)
    }
    // Root-hosted: the same `my-12` the block has always emitted.
    expect(section).toHaveClass('my-12')
  })

  it('frames the canvas with the hero card geometry, not its own', () => {
    const { container } = render(<ShaderHeroBlockComponent {...block()} />)

    expect(frame(container)).toHaveAttribute('class', HERO_CARD_FRAME_CLASS)
    expect(frame(container).firstElementChild).toHaveAttribute(
      'class',
      HERO_CARD_PANEL_CLASS,
    )
  })

  it('keeps the static gradient and stays free of the page-top treatments', () => {
    const { container } = render(<ShaderHeroBlockComponent {...block()} />)

    // The gradient fallback is the block's visible background without a GPU,
    // exactly as before — it just lives inside the shared frame now.
    expect(container.querySelector('.bg-gradient-to-br')).not.toBeNull()
    // Scrim and bottom fade blend a page-top background into the page; a
    // bounded card must not do either (`HeroView`'s card asserts the same).
    expect(container.querySelector('.bg-gradient-to-r')).toBeNull()
    expect(container.querySelector('.h-24')).toBeNull()
  })

  it('overlays the stored rich text with the card text treatment', () => {
    const { container, getByText } = render(
      <ShaderHeroBlockComponent
        {...block({
          richText: richText as unknown as ShaderHeroBlock['richText'],
        })}
      />,
    )

    expect(getByText('A bounded animated panel.')).toBeInTheDocument()
    const overlay = container.querySelector(`section > div.z-10`) as HTMLElement
    expect(overlay).toHaveAttribute('class', SHADER_HERO_BLOCK_CONTENT_CLASS)
    expect(container.querySelector('.max-w-xl')).not.toBeNull()
  })

  it('renders no overlay at all when the block stores no rich text', () => {
    const { container } = render(<ShaderHeroBlockComponent {...block()} />)
    expect(container.querySelector('section')?.children).toHaveLength(1)
  })

  it('drops its own margin when a host owns the rhythm', () => {
    const { container } = render(
      <ShaderHeroBlockComponent {...block()} hosted="column" />,
    )
    expect(container.querySelector('section')).not.toHaveClass('my-12')
  })
})

/**
 * The acceptance criterion "grep confirms a single ShaderHero canvas
 * implementation remains", as an assertion rather than a shell command.
 */
describe('one shader canvas implementation in the tree', () => {
  const sources = (dir: string): string[] =>
    readdirSync(path.join(process.cwd(), dir)).flatMap((entry) => {
      const relative = path.join(dir, entry)
      if (statSync(path.join(process.cwd(), relative)).isDirectory()) {
        return sources(relative)
      }
      return /\.tsx?$/.test(entry) ? [relative] : []
    })

  it('imports the canvas from exactly one module', () => {
    const importers = sources('src').filter(
      (file) =>
        file !== 'src/components/heros/ShaderBackground.tsx' &&
        /ShaderBackground/.test(read(file)) &&
        !/\.(test|stories)\.tsx?$/.test(file),
    )

    expect(importers).toEqual(['src/components/heros/ShaderHero.tsx'])
  })

  it('leaves the shader block with no panel markup of its own', () => {
    const source = read('src/blocks/ShaderHero/Component.tsx')

    expect(source).toContain('HERO_CARD_SHELL_CLASS')
    expect(source).not.toContain('ShaderBackground')
    expect(source).not.toContain('rounded-2xl')
    expect(source).not.toContain('usePrefersReducedMotion')
    // No longer a client component: `ShaderHero` owns every browser probe,
    // so the rich text renders on the server.
    expect(source).not.toContain("'use client'")
  })

  /**
   * The one string this block still duplicates from `src/heros/**`: the card's
   * text-overlay box. `presentation.ts` does not export it and this batch may
   * not write to the hero files, so the drift guard reads the hero source.
   */
  it('overlays its text in the same box the hero card does', () => {
    expect(read('src/heros/HeroView.tsx')).toContain(
      SHADER_HERO_BLOCK_CONTENT_CLASS,
    )
  })
})

/**
 * The other half of #39: the block is deprecated, not deleted. Published
 * pages use it, so it stays registered and its schema stays exactly as it
 * was — the picker copy is the whole steering mechanism (the `mediaBlock` →
 * `image` pattern from #33).
 */
describe('shaderHero deprecation', () => {
  it('stays registered at layout root', () => {
    expect(pageBuilderBlocks.map((entry) => entry.slug)).toContain('shaderHero')
  })

  it('says "legacy" in the block picker, and where to go instead', () => {
    expect(ShaderHero.labels?.singular).toMatch(/legacy/i)
    expect(ShaderHero.labels?.plural).toMatch(/legacy/i)
    expect(String(ShaderHero.labels?.singular)).toMatch(/page hero/i)

    const preset = ShaderHero.fields.find(
      (entry) => 'name' in entry && entry.name === 'preset',
    ) as { admin?: { description?: string } } | undefined
    expect(preset?.admin?.description).toMatch(/page hero/i)
  })

  it('changes no field, so no stored block needs migrating', () => {
    expect(
      ShaderHero.fields.map((entry) =>
        'name' in entry ? entry.name : entry.type,
      ),
    ).toEqual(['preset', 'richText'])
  })

  /**
   * The curated-list decision, recorded: a deprecated block is not offered
   * for *new* column content. It was already excluded as hero-scale, so this
   * is a no-op removal — and this assertion is what keeps it that way now
   * that there is a second reason.
   */
  it('is not offered inside a column', () => {
    expect(COLUMN_EXCLUDED_BLOCK_SLUGS).toContain('shaderHero')
    expect(COLUMN_CONTENT_BLOCKS.map((entry) => entry.slug)).not.toContain(
      'shaderHero',
    )
  })
})
