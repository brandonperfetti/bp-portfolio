// @vitest-environment node
import type { Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { WorkHistory } from '@/collections/WorkHistory'
import { WorkHistoryCard } from '@/blocks/WorkHistoryCard/config'
import { isSlugRoutedCollection } from '@/fields/slug/slugPaths'

/**
 * Config-shape pins for the `/work` section's data model (#137).
 *
 * @remarks Asserts the exported config objects rather than booting Payload:
 * these are the artefacts the migration, `payload-types.ts` and the block
 * relationship are all generated from, and a booted instance would tell us
 * nothing the objects do not. The *behaviour* these enable is pinned where it
 * lives — `chunking.test.ts` for the citation, `Component.test.tsx` for the
 * block's two modes.
 */
const findField = (fields: Field[], name: string): Field | undefined =>
  fields.find((field) => 'name' in field && field.name === name)

describe('WorkHistory slug (#137)', () => {
  const slug = findField(WorkHistory.fields, 'slug')

  it('carries a unique slug so a citation can name one role unambiguously', () => {
    expect(slug).toMatchObject({ name: 'slug', type: 'text', unique: true })
  })

  it('ships the slugLock companion the shared field pairs with it', () => {
    expect(findField(WorkHistory.fields, 'slugLock')).toMatchObject({
      type: 'checkbox',
    })
  })

  it('derives from the company, which is what the URL segment reads as', () => {
    // `slugField('company')` wires `formatSlugHook('company')` as the first
    // beforeValidate hook; the pin is that a hook pair is installed at all,
    // since the derivation itself is the shared field's tested behaviour.
    const hooks = (slug as { hooks?: { beforeValidate?: unknown[] } }).hooks
    expect(hooks?.beforeValidate).toHaveLength(2)
  })

  it('describes the slug as an addressing key rather than a URL', () => {
    // Mirrored into the schema on purpose: an agent driving /api/mcp never
    // reads the collection's TSDoc, so the guardrail travels with the tool.
    const admin = (slug as { admin?: { description?: string } }).admin
    expect(admin?.description).toMatch(/\/work\//)
  })

  it('stays OUT of the slug-routed set — nothing routes on a work-history row', () => {
    // The whole design: the narrative for a role is a Page under /work, and
    // this collection is the structured facts behind it. Adding it here would
    // extend the #120 slug freeze and the auto-redirect writer to a collection
    // with no public URL to protect.
    expect(isSlugRoutedCollection('work-history')).toBe(false)
  })
})

describe('workHistoryCard entry relationship (#137)', () => {
  const entry = findField(WorkHistoryCard.fields, 'entry')

  it('names exactly one work-history row, optionally', () => {
    expect(entry).toMatchObject({
      name: 'entry',
      type: 'relationship',
      relationTo: 'work-history',
      hasMany: false,
    })
    // Optional is what keeps every page stored before #137 rendering the full
    // résumé card: they read `entry` back as null.
    expect((entry as { required?: boolean }).required).toBeFalsy()
  })

  it('keeps the blockType stored on every existing page', () => {
    // Renaming this would orphan the `workHistoryCard` blocks already in every
    // page's `layout`.
    expect(WorkHistoryCard.slug).toBe('workHistoryCard')
  })

  it('hides showDescription until a role is picked', () => {
    const showDescription = findField(WorkHistoryCard.fields, 'showDescription')
    const condition = (
      showDescription as {
        admin?: { condition?: (d: unknown, s: unknown) => boolean }
      }
    ).admin?.condition

    expect(condition?.({}, { entry: 3 })).toBe(true)
    expect(condition?.({}, {})).toBe(false)
  })
})
