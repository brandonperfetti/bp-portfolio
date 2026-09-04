import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import {
  CODE_OWNED_FIRST_SEGMENTS,
  PATH_MAX_DEPTH,
  assertPathFreeInCollection,
  assertPathShapeServable,
  parentIdOf,
  placementOf,
  postSlugCollidingWith,
} from './documentPath'

/**
 * The placement primitives Pages and Posts share (#153).
 *
 * @remarks These have always been exercised through the two hook suites, which
 * is where the interesting branching lives. This file pins them directly
 * instead, because the whole reason they were extracted is that **one** rule
 * must govern **one** URL namespace — and a rule proved only through two
 * callers can drift for one of them without either suite noticing.
 */

describe('placementOf — the write-payload merge', () => {
  it('reads the incoming slug and parent on a create', () => {
    expect(placementOf({ slug: 'a', parent: 2 }, undefined)).toEqual({
      slug: 'a',
      parentId: 2,
    })
  })

  it('falls back to the stored values on a PATCH that sends neither', () => {
    // A PATCH sending only `title` must compute the path the document already
    // has, or every unrelated edit would move a URL.
    expect(
      placementOf({ title: 'New' } as never, { slug: 'a', parent: 2 }),
    ).toEqual({ slug: 'a', parentId: 2 })
  })

  it('distinguishes "parent not sent" from "parent sent as null"', () => {
    // The second is an editor deliberately un-parenting, and it must clear the
    // placement rather than silently keep the old one.
    expect(placementOf({ parent: null }, { slug: 'a', parent: 2 })).toEqual({
      slug: 'a',
      parentId: null,
    })
    expect(placementOf({}, { slug: 'a', parent: 2 })).toEqual({
      slug: 'a',
      parentId: 2,
    })
  })

  it('reports no slug when a create has not derived one yet', () => {
    expect(placementOf({ parent: 2 }, undefined).slug).toBeNull()
    expect(placementOf({ slug: '' }, undefined).slug).toBeNull()
  })

  it('reads a parent given as a populated document', () => {
    expect(
      placementOf({ slug: 'a', parent: { id: 7 } as never }, undefined),
    ).toEqual({ slug: 'a', parentId: 7 })
  })
})

describe('parentIdOf', () => {
  it('reads a bare id, a populated doc, and every unset spelling', () => {
    expect(parentIdOf(7)).toBe(7)
    expect(parentIdOf('7')).toBe('7')
    expect(parentIdOf({ id: 7 })).toBe(7)
    expect(parentIdOf(null)).toBeNull()
    expect(parentIdOf(undefined)).toBeNull()
    expect(parentIdOf('')).toBeNull()
    expect(parentIdOf({})).toBeNull()
  })
})

describe('assertPathShapeServable — the pure half', () => {
  it('accepts a path at and under the depth cap', () => {
    expect(() => assertPathShapeServable('a')).not.toThrow()
    expect(() => assertPathShapeServable('a/b/c')).not.toThrow()
  })

  it('rejects a path one segment past the cap', () => {
    expect(() => assertPathShapeServable('a/b/c/d')).toThrow(
      new RegExp(`at most ${PATH_MAX_DEPTH} levels deep`, 'i'),
    )
  })

  it('rejects an empty segment', () => {
    expect(() => assertPathShapeServable('a//b')).toThrow(/every segment needs/)
  })

  it('rejects every code-owned first segment', () => {
    for (const segment of CODE_OWNED_FIRST_SEGMENTS) {
      expect(() => assertPathShapeServable(`${segment}/x`)).toThrow(
        /owned by the application/,
      )
    }
  })
})

describe('postSlugCollidingWith', () => {
  it('recognises the unplaced-post namespace and nothing else', () => {
    expect(postSlugCollidingWith('articles/hello')).toBe('hello')
    expect(postSlugCollidingWith('articles')).toBeNull()
    expect(postSlugCollidingWith('articles/a/b')).toBeNull()
    expect(postSlugCollidingWith('work/hello')).toBeNull()
  })
})

describe('assertPathFreeInCollection', () => {
  const req = (docs: Array<{ id: number; slug: string }>) =>
    ({
      payload: { find: async () => ({ docs }) },
    }) as unknown as PayloadRequest

  it('accepts a free path', async () => {
    await expect(
      assertPathFreeInCollection(req([]), 'pages', null, 'work/a'),
    ).resolves.toBeUndefined()
  })

  it('lets a document keep its own path on a re-save', async () => {
    await expect(
      assertPathFreeInCollection(
        req([{ id: 5, slug: 'a' }]),
        'posts',
        5,
        'work/a',
      ),
    ).resolves.toBeUndefined()
  })

  it('speaks the language of the collection it fired on', async () => {
    await expect(
      assertPathFreeInCollection(
        req([{ id: 9, slug: 'a' }]),
        'pages',
        5,
        'work/a',
      ),
    ).rejects.toThrow(/Another page already serves \/work\/a. Change this page/)
    await expect(
      assertPathFreeInCollection(
        req([{ id: 9, slug: 'a' }]),
        'posts',
        5,
        'work/a',
      ),
    ).rejects.toThrow(
      /Another article already serves \/work\/a. Change this article’s slug or its parent page/,
    )
  })
})
