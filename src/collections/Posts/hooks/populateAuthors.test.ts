import { describe, expect, it, vi } from 'vitest'

import { populateAuthors } from '@/collections/Posts/hooks/populateAuthors'

// Minimal afterRead-hook argument: only `doc` and `req.payload` are read.
const run = (doc: unknown, findByID: ReturnType<typeof vi.fn>) =>
  populateAuthors({
    doc,
    req: { payload: { findByID } },
  } as never)

describe('populateAuthors', () => {
  it('mirrors {id,name} from the authors collection (not users)', async () => {
    const findByID = vi.fn(async ({ id }: { id: number }) => ({
      id,
      name: 'Brandon Perfetti',
    }))

    const doc = await run({ authors: [7] }, findByID)

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'authors', id: 7, depth: 0 }),
    )
    expect((doc as { populatedAuthors: unknown }).populatedAuthors).toEqual([
      { id: 7, name: 'Brandon Perfetti' },
    ])
  })

  it('leaves populatedAuthors unset when there are no authors', async () => {
    const findByID = vi.fn()
    const doc = await run({ authors: [] }, findByID)

    expect(findByID).not.toHaveBeenCalled()
    expect(
      (doc as { populatedAuthors?: unknown }).populatedAuthors,
    ).toBeUndefined()
  })

  it('resolves relationships passed as objects by id', async () => {
    const findByID = vi.fn(async ({ id }: { id: number }) => ({
      id,
      name: 'Ada Lovelace',
    }))

    await run({ authors: [{ id: 12 }] }, findByID)

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'authors', id: 12 }),
    )
  })

  it('swallows lookup errors and returns the doc unchanged', async () => {
    const findByID = vi.fn(async () => {
      throw new Error('not found')
    })
    const input = { authors: [1] }

    const doc = await run(input, findByID)

    expect(doc).toBe(input)
    expect(
      (doc as { populatedAuthors?: unknown }).populatedAuthors,
    ).toBeUndefined()
  })
})
