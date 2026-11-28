// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createFixturePage } from './fixtures/payload-fixtures'

/**
 * A Page's Corvus rows through real Payload saves (#208).
 *
 * @remarks The unit tests in `src/hooks/corvusEmbeddings.test.ts` fake the
 * collection row the hook consults; this file proves the two facts they
 * assume, on a real database: a Local-API `draft: true` save leaves the
 * collection row `published` (so the published text keeps its rows), and an
 * unpublish sets it to `draft` inside the same transaction the hook reads
 * (so the rows go). The embedder is stubbed; this tier never reaches a
 * provider.
 */

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { embedChunksStub } = vi.hoisted(() => ({
  embedChunksStub: vi.fn(async (contents: readonly string[]) =>
    contents.map(() => {
      const vector = new Array<number>(1536).fill(0)
      vector[0] = 1
      return vector
    }),
  ),
}))

vi.mock('../src/lib/ai/embeddings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/lib/ai/embeddings')>()
  return { ...actual, embedChunks: embedChunksStub }
})

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-page-embeddings-integration'

/** A prose block of `n` distinct words, well over the Page token floor. */
const prose = (word: string, n = 80) => ({
  blockType: 'prose',
  content: {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [
            {
              type: 'text',
              text: Array.from({ length: n }, (_, i) => `${word}${i}`).join(
                ' ',
              ),
              format: 0,
              style: '',
              mode: 'normal',
              detail: 0,
              version: 1,
            },
          ],
        },
      ],
    },
  },
})

describe.skipIf(!connectionString)(
  'Page embeddings across draft saves (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let pageId: number

    const rows = async (): Promise<{ content: string }[]> => {
      const pool = (
        payload.db as unknown as {
          pool: {
            query: (
              text: string,
              values: unknown[],
            ) => Promise<{ rows: { content: string }[] }>
          }
        }
      ).pool
      const result = await pool.query(
        'SELECT content FROM corvus_embeddings WHERE collection = $1 AND doc_id = $2 ORDER BY chunk_index',
        ['pages', pageId],
      )
      return result.rows
    }

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      await cleanup()

      const page = await createFixturePage(payload, {
        data: {
          title: MARKER,
          slug: MARKER,
          _status: 'published',
          layout: [prose('published')],
        },
      })
      pageId = Number(page.id)
    }, 120_000)

    afterAll(cleanup)

    it('embeds the published Page', async () => {
      const stored = await rows()
      expect(stored.length).toBeGreaterThan(0)
      expect(stored[0].content).toContain('published0')
    })

    it('keeps the published text’s rows through a draft save, and a second one', async () => {
      for (const word of ['draftone', 'drafttwo']) {
        await payload.update({
          collection: 'pages',
          id: pageId,
          draft: true,
          overrideAccess: true,
          data: { _status: 'draft', layout: [prose(word)] } as never,
        })

        const stored = await rows()
        expect(stored.length).toBeGreaterThan(0)
        expect(stored[0].content).toContain('published0')
        expect(stored[0].content).not.toContain(`${word}0`)
      }
    })

    it('deletes the rows when the Page is unpublished', async () => {
      await payload.update({
        collection: 'pages',
        id: pageId,
        overrideAccess: true,
        data: { _status: 'draft' } as never,
      })

      expect(await rows()).toEqual([])
    })
  },
)
