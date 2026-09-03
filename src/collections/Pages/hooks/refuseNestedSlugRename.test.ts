import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

const findPublishedSlug = vi.fn(async () => null as string | null)
vi.mock('@/fields/slug/findPublishedSlug', () => ({
  findPublishedSlug: (...args: unknown[]) => findPublishedSlug(...(args as [])),
}))

import { refuseNestedSlugRename } from './refuseNestedSlugRename'

/**
 * The Pages half of the #150 stop-gap. Three conditions must hold at once for
 * it to speak — nested, published, slug moving — and the cases below are mostly
 * about the ones where it must stay silent, because a guard that fires on the
 * common path would be worse than the hole it plugs. The single most important
 * case in this file is the top-level rename: that is #120 working correctly,
 * and AC1 of #150 says it keeps working byte for byte.
 */

const args = (
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
  operation: 'create' | 'update' = 'update',
) =>
  ({
    collection: { slug: 'pages' },
    context: {},
    data,
    operation,
    originalDoc,
    req: {} as PayloadRequest,
  }) as never

const nestedPublished = {
  id: 1,
  slug: 'brytecore',
  path: 'work/brytecore',
  parent: 2,
  _status: 'published',
}

beforeEach(() => {
  findPublishedSlug.mockReset()
  findPublishedSlug.mockResolvedValue(null)
})

describe('refuseNestedSlugRename — when it fires', () => {
  it('refuses a rename on a nested, published page', async () => {
    await expect(
      refuseNestedSlugRename(args({ slug: 'bcore' }, nestedPublished)),
    ).rejects.toThrow(/published at \/work\/brytecore/)
  })

  it('names the top-level URL the page would return to', async () => {
    await expect(
      refuseNestedSlugRename(args({ slug: 'bcore' }, nestedPublished)),
    ).rejects.toThrow(/\/brytecore/)
  })

  it('points at #150 rather than reading as a bug', async () => {
    await expect(
      refuseNestedSlugRename(args({ slug: 'bcore' }, nestedPublished)),
    ).rejects.toThrow(/#150/)
  })

  it('reads a POPULATED parent, not only a bare id', async () => {
    // A `depth > 0` read hands back the parent document; a bare `if (parent)`
    // would agree, but `parentIdOf` is what makes both shapes one answer.
    await expect(
      refuseNestedSlugRename(
        args(
          { slug: 'bcore' },
          { ...nestedPublished, parent: { id: 2, slug: 'work' } },
        ),
      ),
    ).rejects.toThrow(/published at \/work\/brytecore/)
  })

  it('asks the database when originalDoc is an autosaved draft over a live version', async () => {
    findPublishedSlug.mockResolvedValue('brytecore')
    await expect(
      refuseNestedSlugRename(
        args({ slug: 'bcore' }, { ...nestedPublished, _status: 'draft' }),
      ),
    ).rejects.toThrow(/published at \/work\/brytecore/)
    expect(findPublishedSlug).toHaveBeenCalled()
  })
})

describe('refuseNestedSlugRename — when it stays silent', () => {
  it('allows a rename on a TOP-LEVEL page: that is #120 and it works (AC1 of #150)', async () => {
    await expect(
      refuseNestedSlugRename(
        args(
          { slug: 'new' },
          {
            id: 1,
            slug: 'old',
            path: 'old',
            parent: null,
            _status: 'published',
          },
        ),
      ),
    ).resolves.toBeDefined()
    // No parent, no reason to ask the database.
    expect(findPublishedSlug).not.toHaveBeenCalled()
  })

  it('allows a rename on the site root, which is unparented by construction', async () => {
    await expect(
      refuseNestedSlugRename(
        args(
          { slug: 'landing' },
          { id: 1, slug: 'home', path: 'home', _status: 'published' },
        ),
      ),
    ).resolves.toBeDefined()
  })

  it('allows a rename on a nested page that has never been published', async () => {
    findPublishedSlug.mockResolvedValue(null)
    await expect(
      refuseNestedSlugRename(
        args({ slug: 'bcore' }, { ...nestedPublished, _status: 'draft' }),
      ),
    ).resolves.toBeDefined()
  })

  it('allows every write that is not moving the slug', async () => {
    await expect(
      refuseNestedSlugRename(args({ title: 'New title' }, nestedPublished)),
    ).resolves.toBeDefined()
    await expect(
      refuseNestedSlugRename(args({ slug: 'brytecore' }, nestedPublished)),
    ).resolves.toBeDefined()
  })

  it('allows a create — there is no live URL to break', async () => {
    await expect(
      refuseNestedSlugRename(
        args({ slug: 'bcore', parent: 2 }, undefined, 'create'),
      ),
    ).resolves.toBeDefined()
  })

  it('allows a re-parent, which this guard deliberately does not cover', async () => {
    await expect(
      refuseNestedSlugRename(args({ parent: null }, nestedPublished)),
    ).resolves.toBeDefined()
  })

  it('allows a top-level page that is parented AND renamed in one save', async () => {
    // `from` is `/old` — the URL that actually moved — and `to` is a reference
    // that resolves to the new nested path. #120 gets this one right, so the
    // guard reads the STORED parent and stays out of it.
    await expect(
      refuseNestedSlugRename(
        args(
          { slug: 'new', parent: 2 },
          {
            id: 1,
            slug: 'old',
            path: 'old',
            parent: null,
            _status: 'published',
          },
        ),
      ),
    ).resolves.toBeDefined()
  })
})

describe('refuseNestedSlugRename — the STORED parent is what counts', () => {
  it('still refuses when the same save un-parents AND renames', async () => {
    // Tempting to allow: the page ends up top-level, so the row that gets
    // written (`/old → /new`) is well-formed. But `/work/brytecore` is still
    // the URL being vacated and still gets no row, so the 404 is identical.
    await expect(
      refuseNestedSlugRename(
        args({ slug: 'bcore', parent: null }, nestedPublished),
      ),
    ).rejects.toThrow(/published at \/work\/brytecore/)
  })
})
