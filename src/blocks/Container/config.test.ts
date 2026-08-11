// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { BlocksField } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  COLUMN_CONTENT_BLOCKS,
  COLUMN_EXCLUDED_BLOCK_SLUGS,
  Column,
} from '@/blocks/Column/config'
import { Container } from '@/blocks/Container/config'
import { pageBuilderBlocks } from '@/blocks/library'

const blocksField = (
  fields: (typeof Container)['fields'],
  name: string,
): BlocksField => {
  const field = fields.find(
    (candidate): candidate is BlocksField =>
      candidate.type === 'blocks' && candidate.name === name,
  )
  if (!field) throw new Error(`no blocks field named "${name}"`)
  return field
}

const slugs = (blocks: { slug: string }[]) => blocks.map((block) => block.slug)

/**
 * Guards the containment hierarchy issue #23 settled: `container` at layout
 * root, `column` only inside it, and a curated leaf subset inside columns.
 * The subset is written out by hand in `Column/config.ts` (reading the
 * library there would be a module cycle), so this is the assertion that
 * keeps it honest as the library grows.
 */
describe('container / column containment', () => {
  it('registers the container at layout root and the column nowhere', () => {
    expect(slugs(pageBuilderBlocks)).toContain('container')
    expect(slugs(pageBuilderBlocks)).not.toContain('column')
  })

  it('leaves the legacy root-level blocks registered', () => {
    // #23 explicitly does not remove anything from root during migration.
    expect(slugs(pageBuilderBlocks)).toEqual(
      expect.arrayContaining(['content', 'shaderHero']),
    )
  })

  it('lets a container hold columns and nothing else', () => {
    const columns = blocksField(Container.fields, 'columns')
    expect(slugs(columns.blocks)).toEqual(['column'])
    expect(columns.minRows).toBe(1)
  })

  it('offers columns the library minus the three excluded blocks', () => {
    const content = blocksField(Column.fields, 'content')
    const expected = slugs(pageBuilderBlocks).filter(
      (slug) =>
        !(COLUMN_EXCLUDED_BLOCK_SLUGS as readonly string[]).includes(slug),
    )

    expect(new Set(slugs(content.blocks))).toEqual(new Set(expected))
    expect(new Set(slugs(COLUMN_CONTENT_BLOCKS))).toEqual(new Set(expected))
    expect(slugs(content.blocks)).toHaveLength(expected.length)
  })

  it('keeps columns out of columns', () => {
    const content = blocksField(Column.fields, 'content')
    for (const slug of ['container', 'column', 'content']) {
      expect(slugs(content.blocks)).not.toContain(slug)
    }
  })

  it('registers the column row label in the generated import map', () => {
    const componentPath = Column.admin?.components?.Label
    expect(componentPath).toBe('@/blocks/Column/RowLabel#ColumnRowLabel')

    // The admin resolves custom components through this generated file —
    // a config change without `pnpm generate:importmap` leaves the label
    // unregistered, which is invisible until someone opens the admin.
    const importMap = readFileSync(
      path.join(process.cwd(), 'src/app/(payload)/admin/importMap.js'),
      'utf8',
    )
    expect(importMap).toContain(componentPath as string)
  })
})
