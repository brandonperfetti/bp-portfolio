// @vitest-environment node
import type { Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { SHARE_TARGET_IDS, SiteSettings } from '@/globals/SiteSettings'

/**
 * Depth-first find of a named field anywhere in a field tree — the post-action
 * fields sit inside a presentational `collapsible`, so a flat `.find` on the
 * top-level array would miss them.
 */
function findField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    if ('fields' in field && Array.isArray(field.fields)) {
      const nested = findField(field.fields, name)
      if (nested) return nested
    }
  }
  return undefined
}

const shareTargets = findField(SiteSettings.fields, 'shareTargets') as
  SelectField | undefined

const copyPageEnabled = findField(SiteSettings.fields, 'copyPageEnabled')

/**
 * The globally-enabled share destinations and the Copy-page master toggle
 * (Batch 1 / T1, #51). Pins the exact enum id T2 builds its module against,
 * and the additive-safe defaults every existing SiteSettings row back-fills.
 */
describe('site-settings post-actions schema', () => {
  it('pins the seven share-target ids', () => {
    expect(SHARE_TARGET_IDS).toEqual([
      'x',
      'linkedin',
      'facebook',
      'reddit',
      'hackernews',
      'email',
      'copylink',
    ])
  })

  it('names the share-targets enum explicitly and within the 63-char limit', () => {
    expect(shareTargets?.enumName).toBe('enum_site_settings_share_targets')
    expect(String(shareTargets?.enumName).length).toBeLessThanOrEqual(63)
  })

  it('is a hasMany select defaulting to all seven targets', () => {
    expect(shareTargets?.type).toBe('select')
    expect(shareTargets?.hasMany).toBe(true)
    expect(shareTargets?.defaultValue).toEqual(SHARE_TARGET_IDS)
  })

  it('enables the Copy-page button by default', () => {
    expect(copyPageEnabled?.type).toBe('checkbox')
    expect(
      (copyPageEnabled as { defaultValue?: unknown } | undefined)?.defaultValue,
    ).toBe(true)
  })
})
