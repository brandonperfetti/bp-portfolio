import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

const findPublishedSlug = vi.fn(async () => null as string | null)
vi.mock('@/fields/slug/findPublishedSlug', () => ({
  findPublishedSlug: (...args: unknown[]) => findPublishedSlug(...(args as [])),
}))

import { refusePlacedSlugRename } from './refusePlacedSlugRename'

/**
 * The #150 stop-gap. Three conditions must hold at once for it to speak —
 * placed, published, slug moving — and the cases below are mostly about the
 * ones where it must stay silent, because a guard that fires on the common path
 * would be worse than the hole it plugs.
 */

const args = (
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
  operation: 'create' | 'update' = 'update',
) =>
  ({
    collection: { slug: 'posts' },
    context: {},
    data,
    operation,
    originalDoc,
    req: {} as PayloadRequest,
  }) as never

beforeEach(() => {
  findPublishedSlug.mockReset()
  findPublishedSlug.mockResolvedValue(null)
})

describe('refusePlacedSlugRename — when it fires', () => {
  it('refuses a rename on a placed, published article', async () => {
    await expect(
      refusePlacedSlugRename(
        args(
          { slug: 'new' },
          { id: 1, slug: 'old', path: 'work/old', _status: 'published' },
        ),
      ),
    ).rejects.toThrow(/published at \/work\/old/)
  })

  it('names the archive URL the article would return to', async () => {
    await expect(
      refusePlacedSlugRename(
        args(
          { slug: 'new' },
          { id: 1, slug: 'old', path: 'work/old', _status: 'published' },
        ),
      ),
    ).rejects.toThrow(/\/articles\/old/)
  })

  it('points at #150 rather than reading as a bug', async () => {
    await expect(
      refusePlacedSlugRename(
        args(
          { slug: 'new' },
          { id: 1, slug: 'old', path: 'work/old', _status: 'published' },
        ),
      ),
    ).rejects.toThrow(/#150/)
  })

  it('asks the database when originalDoc is an autosaved draft over a live version', async () => {
    findPublishedSlug.mockResolvedValue('old')
    await expect(
      refusePlacedSlugRename(
        args(
          { slug: 'new' },
          { id: 1, slug: 'old', path: 'work/old', _status: 'draft' },
        ),
      ),
    ).rejects.toThrow(/published at \/work\/old/)
    expect(findPublishedSlug).toHaveBeenCalled()
  })
})

describe('refusePlacedSlugRename — when it stays silent', () => {
  it('allows a rename on an UNPLACED article: that is the #120 path and it works', async () => {
    await expect(
      refusePlacedSlugRename(
        args(
          { slug: 'new' },
          { id: 1, slug: 'old', path: null, _status: 'published' },
        ),
      ),
    ).resolves.toBeDefined()
    // No placement, no reason to ask the database.
    expect(findPublishedSlug).not.toHaveBeenCalled()
  })

  it('allows a rename on a placed article that has never been published', async () => {
    findPublishedSlug.mockResolvedValue(null)
    await expect(
      refusePlacedSlugRename(
        args(
          { slug: 'new' },
          { id: 1, slug: 'old', path: 'work/old', _status: 'draft' },
        ),
      ),
    ).resolves.toBeDefined()
  })

  it('allows every write that is not moving the slug', async () => {
    const stored = {
      id: 1,
      slug: 'old',
      path: 'work/old',
      _status: 'published',
    }
    await expect(
      refusePlacedSlugRename(args({ title: 'New title' }, stored)),
    ).resolves.toBeDefined()
    await expect(
      refusePlacedSlugRename(args({ slug: 'old' }, stored)),
    ).resolves.toBeDefined()
  })

  it('stays silent on a title-only unlock, because `data.slug` is the EFFECTIVE slug', async () => {
    // Payload runs FIELD `beforeValidate` before COLLECTION `beforeValidate`,
    // so `data` reaching this hook has already been through
    // `[formatSlugHook, enforceSlugFreeze]`. On a `{ title, slugLock: false }`
    // payload the field chain leaves the stored slug in place (Payload seeds
    // an absent field's value from the stored document), so what this hook
    // actually receives is the shape below — no slug movement, nothing to
    // refuse. The end-to-end proof is the pg-tier case of the same name in
    // `evals/post-placement-integration.test.ts`.
    await expect(
      refusePlacedSlugRename(
        args(
          { title: 'A new title', slugLock: false, slug: 'old' },
          { id: 1, slug: 'old', path: 'work/old', _status: 'published' },
        ),
      ),
    ).resolves.toBeDefined()
    expect(findPublishedSlug).not.toHaveBeenCalled()
  })

  it('allows a create — there is no live URL to break', async () => {
    await expect(
      refusePlacedSlugRename(
        args({ slug: 'new', parent: 2 }, undefined, 'create'),
      ),
    ).resolves.toBeDefined()
  })

  it('allows a placement change, which is the operation this ticket adds', async () => {
    await expect(
      refusePlacedSlugRename(
        args(
          { parent: null },
          { id: 1, slug: 'old', path: 'work/old', _status: 'published' },
        ),
      ),
    ).resolves.toBeDefined()
  })
})
