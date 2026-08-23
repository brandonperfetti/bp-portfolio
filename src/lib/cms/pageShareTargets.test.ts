import { describe, expect, it } from 'vitest'

import { SHARE_TARGET_IDS } from '@/lib/share/vocabulary'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import type { Page } from '@/payload-types'

const global = [...SHARE_TARGET_IDS]

const page = (overrides: Partial<Page> = {}): Page =>
  ({
    disableSharing: null,
    shareTargetsAdd: null,
    shareTargetsRemove: null,
    ...overrides,
  }) as Page

describe('resolvePageShareTargetIds', () => {
  it('returns the global set when the page adds no overrides', () => {
    expect(resolvePageShareTargetIds(page(), global)).toEqual(global)
  })

  it('collapses to an empty set when disableSharing is on (kill switch)', () => {
    expect(
      resolvePageShareTargetIds(page({ disableSharing: true }), global),
    ).toEqual([])
  })

  it('honors per-page remove overrides against the global set', () => {
    const result = resolvePageShareTargetIds(
      page({ shareTargetsRemove: ['x', 'facebook'] }),
      global,
    )
    expect(result).not.toContain('x')
    expect(result).not.toContain('facebook')
    expect(result).toContain('linkedin')
  })

  it('honors per-page add overrides layered on a narrow global set', () => {
    const result = resolvePageShareTargetIds(
      page({ shareTargetsAdd: ['reddit'] }),
      ['linkedin'],
    )
    // Canonical order is imposed by the vocabulary, not by input order.
    expect(result).toEqual(['linkedin', 'reddit'])
  })

  it('tolerates null add/remove fields (payload nullable shape)', () => {
    expect(() => resolvePageShareTargetIds(page(), global)).not.toThrow()
  })
})
