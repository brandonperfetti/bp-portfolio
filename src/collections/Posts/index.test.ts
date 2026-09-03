// @vitest-environment node
import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { Posts } from '@/collections/Posts'

/**
 * The admin preview wiring, tested through the real collection config.
 *
 * `generatePreviewPath` has always been able to name a placed document's URL —
 * `generatePreviewPath.test.ts` proves that for both collections. What this
 * file pins is the half a helper test cannot see: which of the helper's two
 * call shapes Posts actually passes. Handing it `slug` alone throws the `path`
 * away before the helper is reached, so the helper is correct and the button
 * is still wrong.
 */

const req = {} as PayloadRequest

/** The `path` search param the admin preview route will be handed. */
const previewedPath = (url: string | null) =>
  url === null ? null : new URLSearchParams(url.split('?')[1]).get('path')

/**
 * Payload types both hooks as possibly async; `generatePreviewPath` is
 * synchronous, so a Promise here would itself be the bug.
 */
const settled = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new Error(`expected a synchronous preview URL, got ${typeof value}`)
  }
  return value
}

const livePreviewUrl = (data: Record<string, unknown>) => {
  const url = Posts.admin?.livePreview?.url
  if (typeof url !== 'function') throw new Error('Posts has no livePreview.url')
  return settled(
    url({ collectionConfig: Posts, data, locale: undefined, req } as never),
  )
}

const previewUrl = (data: Record<string, unknown>) => {
  const preview = Posts.admin?.preview
  if (typeof preview !== 'function') throw new Error('Posts has no preview')
  return settled(preview(data, { req } as never))
}

describe('Posts admin preview', () => {
  it('previews an UNPLACED article under /articles — the preserved v3 shape', () => {
    expect(previewedPath(livePreviewUrl({ slug: 'hello-world' }))).toBe(
      '/articles/hello-world',
    )
    expect(previewedPath(previewUrl({ slug: 'hello-world' }))).toBe(
      '/articles/hello-world',
    )
  })

  it('previews a PLACED article at its placed path, not the archive URL (#153)', () => {
    // The regression: with `slug` alone both call sites resolved to
    // `/articles/brytecore-launch` and the preview rode the article route's
    // 308 to get to the real URL.
    const placed = { slug: 'brytecore-launch', path: 'work/brytecore-launch' }
    expect(previewedPath(livePreviewUrl(placed))).toBe('/work/brytecore-launch')
    expect(previewedPath(previewUrl(placed))).toBe('/work/brytecore-launch')
  })

  it('returns null for a create that has not derived a slug yet', () => {
    expect(livePreviewUrl({})).toBeNull()
    expect(previewUrl({})).toBeNull()
  })
})
