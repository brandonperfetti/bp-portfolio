import type { FieldHook } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { enforceSlugFreeze } from '@/fields/slug/enforceSlugFreeze'
import { slugField } from '@/fields/slug'

/**
 * Server-side slug freeze (#120).
 *
 * The bug was a published post's URL moving because the admin re-derived the
 * slug from an edited title. These tests exercise the ENFORCEMENT point rather
 * than the admin: whatever the client sends, a locked published document keeps
 * the slug it serves. They fail at 9cacfae because the hook did not exist.
 */

const draftsCollection = {
  slug: 'posts',
  versions: { drafts: { autosave: true } },
} as never

const noDraftsCollection = { slug: 'categories', versions: {} } as never

/** A `req` whose `payload.find` answers the "is there a published row?" query. */
const makeReq = (publishedSlug: null | string) => {
  const find = vi.fn(async () => ({
    docs: publishedSlug === null ? [] : [{ slug: publishedSlug }],
  }))
  return { find, req: { payload: { find } } as never }
}

const run = (
  args: Record<string, unknown>,
  publishedSlug: null | string = null,
) => {
  const { find, req } = makeReq(publishedSlug)
  const hook = enforceSlugFreeze()
  return {
    find,
    result: hook({
      collection: draftsCollection,
      operation: 'update',
      req,
      ...args,
    } as never),
  }
}

describe('enforceSlugFreeze', () => {
  it('reverts a locked published post to its stored slug (the #120 regression)', async () => {
    // The admin component re-derived this from the edited title and sent it.
    const { result, find } = run({
      originalDoc: {
        id: 55,
        _status: 'published',
        slug: 'runbooks-to-agent-skills',
        slugLock: true,
      },
      siblingData: { slugLock: true },
      value: 'your-runbook-is-rotting-teach-it-to-an-agent-instead',
    })

    await expect(result).resolves.toBe('runbooks-to-agent-skills')
    // The published row was already in hand — no extra query.
    expect(find).not.toHaveBeenCalled()
  })

  it('freezes when the write omits slugLock entirely (REST/MCP payload)', async () => {
    // An unlock must be explicit: omission is not consent to move a live URL.
    const { result } = run({
      originalDoc: {
        id: 55,
        _status: 'published',
        slug: 'keep-me',
        slugLock: true,
      },
      siblingData: {},
      value: 'moved-me',
    })

    await expect(result).resolves.toBe('keep-me')
  })

  it('allows the rename when the editor explicitly unlocked', async () => {
    const { result } = run({
      originalDoc: {
        id: 55,
        _status: 'published',
        slug: 'old-slug',
        slugLock: true,
      },
      siblingData: { slugLock: false },
      value: 'new-slug',
    })

    await expect(result).resolves.toBe('new-slug')
  })

  it('freezes a draft edit of a document that has a published version', async () => {
    // Autosave: `originalDoc` is the draft, so the hook has to ask the DB.
    const { result, find } = run(
      {
        originalDoc: {
          id: 55,
          _status: 'draft',
          slug: 'live-url',
          slugLock: true,
        },
        siblingData: { slugLock: true },
        value: 'retitled-in-a-draft',
      },
      'live-url',
    )

    await expect(result).resolves.toBe('live-url')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        depth: 0,
        where: {
          and: [{ id: { equals: 55 } }, { _status: { equals: 'published' } }],
        },
      }),
    )
  })

  it('still derives from the title on a never-published draft', async () => {
    const { result } = run(
      {
        originalDoc: {
          id: 56,
          _status: 'draft',
          slug: 'first-title',
          slugLock: true,
        },
        siblingData: { slugLock: true },
        value: 'second-title',
      },
      null,
    )

    await expect(result).resolves.toBe('second-title')
  })

  it('leaves create operations alone', async () => {
    const { result } = run({
      operation: 'create',
      originalDoc: undefined,
      siblingData: { slugLock: true },
      value: 'brand-new',
    })

    await expect(result).resolves.toBe('brand-new')
  })

  it('does not touch collections without drafts', async () => {
    // Categories/Tags/Projects/Authors carry a slug but no public URL, so their
    // derive-from-title behaviour is deliberately unchanged.
    const { req } = makeReq(null)
    const result = enforceSlugFreeze()({
      collection: noDraftsCollection,
      operation: 'update',
      originalDoc: { id: 1, slug: 'design', slugLock: true },
      req,
      siblingData: { slugLock: true },
      value: 'design-systems',
    } as never)

    await expect(result).resolves.toBe('design-systems')
  })

  /**
   * The end-to-end regression, run through the hook chain `slugField()`
   * actually installs rather than the freeze hook in isolation. This is the
   * test that is red at 9cacfae: there the chain is `[formatSlugHook]` alone,
   * which returns the client-supplied slug verbatim and the URL moves.
   */
  it('keeps a published slug byte-identical through the whole slugField chain', async () => {
    const [slugTextField] = slugField()
    const hooks = (slugTextField.hooks?.beforeValidate ?? []) as FieldHook[]
    const { req } = makeReq('runbooks-to-agent-skills')

    const args = {
      collection: draftsCollection,
      data: {
        title: 'Your runbook is rotting — teach it to an agent instead',
        slugLock: true,
      },
      operation: 'update' as const,
      originalDoc: {
        id: 55,
        _status: 'published',
        slug: 'runbooks-to-agent-skills',
        slugLock: true,
      },
      req,
      siblingData: { slugLock: true },
    }

    // What the admin component sends after a title edit.
    let value: unknown =
      'your-runbook-is-rotting-teach-it-to-an-agent-instead-rw118-c'
    for (const hook of hooks) {
      value = await hook({ ...args, value } as never)
    }

    expect(value).toBe('runbooks-to-agent-skills')
  })

  it('short-circuits when the slug is unchanged', async () => {
    const { result, find } = run({
      originalDoc: {
        id: 55,
        _status: 'draft',
        slug: 'same',
        slugLock: true,
      },
      siblingData: { slugLock: true },
      value: 'same',
    })

    await expect(result).resolves.toBe('same')
    expect(find).not.toHaveBeenCalled()
  })
})
