// @vitest-environment node
import type { Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Posts } from '@/collections/Posts'

/**
 * Depth-first find of a named field — the post-action overrides sit inside a
 * presentational `collapsible`, so a flat `.find` would miss them.
 */
function findField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    if ('fields' in field && Array.isArray(field.fields)) {
      const nested = findField(field.fields, name)
      if (nested) return nested
    }
    if ('tabs' in field && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        const nested = findField(tab.fields, name)
        if (nested) return nested
      }
    }
  }
  return undefined
}

const shareTargetsAdd = findField(Posts.fields, 'shareTargetsAdd') as
  SelectField | undefined
const shareTargetsRemove = findField(Posts.fields, 'shareTargetsRemove') as
  SelectField | undefined
const ogImageMode = findField(Posts.fields, 'ogImageMode') as
  SelectField | undefined
const disableSharing = findField(Posts.fields, 'disableSharing')

/**
 * Per-entry post-action overrides on Posts (Batch 1 / T1, #51): unique enum
 * ids so the join tables never collide with the Pages/site copies, and the
 * additive-safe defaults every existing row back-fills.
 */
describe('posts post-actions schema', () => {
  it('names the per-collection share-target enums explicitly, within 63 chars', () => {
    expect(shareTargetsAdd?.enumName).toBe('enum_posts_share_targets_add')
    expect(shareTargetsRemove?.enumName).toBe('enum_posts_share_targets_remove')
    for (const name of [
      shareTargetsAdd?.enumName,
      shareTargetsRemove?.enumName,
      ogImageMode?.enumName,
    ]) {
      expect(String(name).length).toBeLessThanOrEqual(63)
    }
  })

  it('exposes add/remove as hasMany selects', () => {
    expect(shareTargetsAdd?.hasMany).toBe(true)
    expect(shareTargetsRemove?.hasMany).toBe(true)
  })

  it('offers ogImageMode auto|bespoke|generated, defaulting to auto', () => {
    expect(ogImageMode?.enumName).toBe('enum_posts_og_image_mode')
    const values = (ogImageMode?.options ?? []).map((option) =>
      typeof option === 'string' ? option : option.value,
    )
    expect(values).toEqual(['auto', 'bespoke', 'generated'])
    expect(ogImageMode?.defaultValue).toBe('auto')
  })

  it('defaults the sharing kill-switch off', () => {
    expect(disableSharing?.type).toBe('checkbox')
    expect(
      (disableSharing as { defaultValue?: unknown } | undefined)?.defaultValue,
    ).toBe(false)
  })
})
