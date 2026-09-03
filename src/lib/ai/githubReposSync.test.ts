import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GithubRepoSource } from '@/lib/ai/githubRepos'
import {
  canSweepGithubRepos,
  deleteGithubRepoDocuments,
  readIndexedRepoDocIds,
  staleRepoDocIds,
  syncGithubRepoEmbeddings,
} from '@/lib/ai/githubReposSync'

/**
 * The `github-repos` write path (#147).
 *
 * @remarks Three acceptance criteria live in this file, and each is asserted
 * as a COUNT rather than as an outcome, because "it worked" is not what any of
 * them promise:
 *
 * - a re-sync with nothing changed makes **zero** embedding-provider calls;
 * - a repo that has gone private or been deleted has its rows removed;
 * - the sweep that removes them refuses to run on a read it cannot trust.
 *
 * The database is a recording fake rather than real Postgres: this tier is
 * about the ORCHESTRATION — what is called, in what order, how many times — and
 * a fake is the only thing that can count a provider call that must not happen.
 * The complementary tier is `evals/github-repos-pgvector.test.ts`, which runs
 * the same statements against real pgvector and asserts that a removed repo is
 * no longer RETRIEVABLE, which is the property the never-leak bar is actually
 * about.
 */

const { embedChunksMock } = vi.hoisted(() => ({
  embedChunksMock: vi.fn(async (values: readonly string[]) =>
    values.map(() => new Array(1536).fill(0.001)),
  ),
}))

vi.mock('@/lib/ai/embeddings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/embeddings')>()
  return { ...actual, embedChunks: embedChunksMock }
})

/** One executed statement, reduced to the text drizzle would emit. */
interface Executed {
  text: string
  params: unknown[]
}

/**
 * A recording stand-in for `payload.db.drizzle`.
 *
 * @remarks It answers `readStoredChunks`' SELECT from an in-memory row map and
 * records every other statement. Deliberately dumb: the moment this fake starts
 * interpreting SQL it stops being a fake and starts being a second, wrong
 * database — which is what the pgvector tier is for.
 */
function createFakeDb(storedRows: Array<Record<string, unknown>> = []): {
  execute: (query: unknown) => Promise<unknown>
  statements: Executed[]
  rows: Array<Record<string, unknown>>
} {
  const statements: Executed[] = []
  const rows = [...storedRows]

  return {
    rows,
    statements,
    execute: async (query: unknown) => {
      // drizzle's `sql` template stores literal SQL as `StringChunk`s (whose
      // `.value` is a string array) and every interpolated value as itself.
      // Splitting on that distinction is what lets these tests assert BOTH the
      // statement shape and what was bound into it.
      const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
      const isStringChunk = (part: unknown): boolean =>
        Array.isArray((part as { value?: unknown } | null)?.value)

      const text = chunks
        .filter(isStringChunk)
        .map((part) => (part as { value: string[] }).value.join(''))
        .join(' ')
      const params = chunks.filter((part) => !isStringChunk(part))

      statements.push({ text, params })

      if (text.includes('SELECT') && text.includes('chunk_index')) {
        return { rows }
      }
      if (text.includes('SELECT DISTINCT')) {
        return { rows }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

const repo = (overrides: Partial<GithubRepoSource> = {}): GithubRepoSource => ({
  id: 555,
  name: 'bp-portfolio',
  fullName: 'brandonperfetti/bp-portfolio',
  isPrivate: false,
  isFork: false,
  isArchived: false,
  description: 'Source code for my personal site.',
  homepage: 'https://brandonperfetti.com',
  topics: ['nextjs'],
  language: 'TypeScript',
  languages: { TypeScript: 1000 },
  pushedAt: '2026-08-30T12:00:00.000Z',
  createdAt: '2025-01-04T09:00:00.000Z',
  readme: '# bp-portfolio\n\nNext.js 16 with Payload CMS on Supabase Postgres.',
  ...overrides,
})

beforeEach(() => {
  embedChunksMock.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('syncGithubRepoEmbeddings · first index', () => {
  it('embeds and upserts a repo that is not yet in the index', async () => {
    const db = createFakeDb([])

    const result = await syncGithubRepoEmbeddings({ db, repo: repo() })

    expect(result).toMatchObject({ written: 1, skipped: false })
    expect(embedChunksMock).toHaveBeenCalledTimes(1)
    expect(
      db.statements.some((s) => s.text.includes('INSERT INTO')),
      'the chunk must be written',
    ).toBe(true)
  })

  it('writes the row under collection github-repos, not a CMS collection', async () => {
    const db = createFakeDb([])
    await syncGithubRepoEmbeddings({ db, repo: repo() })

    const insert = db.statements.find((s) => s.text.includes('INSERT INTO'))
    expect(insert).toBeDefined()
    const bound = JSON.stringify(insert?.params)
    expect(bound).toContain('github-repos')
    expect(bound).toContain('https://github.com/brandonperfetti/bp-portfolio')
  })
})

describe('syncGithubRepoEmbeddings · re-sync with nothing changed', () => {
  it('makes ZERO embedding-provider calls', async () => {
    // The #147 acceptance criterion about spend, asserted as the count it is.
    const db = createFakeDb([])
    await syncGithubRepoEmbeddings({ db, repo: repo() })
    expect(embedChunksMock).toHaveBeenCalledTimes(1)

    // Re-present the rows the first run would have written.
    const { chunkGithubRepo } = await import('@/lib/ai/githubRepos')
    const chunks = chunkGithubRepo(repo())
    const stored = createFakeDb(
      chunks.map((chunk) => ({
        chunk_index: chunk.chunkIndex,
        content_hash: chunk.contentHash,
        visibility: chunk.visibility,
        published_at: chunk.publishedAt,
        source_url: chunk.sourceUrl,
        model: 'text-embedding-3-small',
      })),
    )

    embedChunksMock.mockClear()
    const result = await syncGithubRepoEmbeddings({ db: stored, repo: repo() })

    expect(result.skipped).toBe(true)
    expect(result.written).toBe(0)
    expect(embedChunksMock).toHaveBeenCalledTimes(0)
    expect(
      stored.statements.some((s) => s.text.includes('INSERT INTO')),
      'a no-op must not write',
    ).toBe(false)
  })

  it('corrects a moved pushed_at with an UPDATE and still no provider call', async () => {
    // `pushed_at` changes on every push. Without this branch a weekly sync
    // would re-embed every active repo every week for a timestamp.
    const { chunkGithubRepo } = await import('@/lib/ai/githubRepos')
    const chunks = chunkGithubRepo(repo())
    const db = createFakeDb(
      chunks.map((chunk) => ({
        chunk_index: chunk.chunkIndex,
        content_hash: chunk.contentHash,
        visibility: chunk.visibility,
        published_at: '2026-01-01T00:00:00.000Z',
        model: 'text-embedding-3-small',
      })),
    )

    const result = await syncGithubRepoEmbeddings({ db, repo: repo() })

    expect(result.metadataUpdated).toBe(chunks.length)
    expect(result.written).toBe(0)
    expect(embedChunksMock).toHaveBeenCalledTimes(0)
    expect(db.statements.some((s) => s.text.includes('UPDATE'))).toBe(true)
  })

  it('re-embeds when the README actually changed', async () => {
    const { chunkGithubRepo } = await import('@/lib/ai/githubRepos')
    const chunks = chunkGithubRepo(repo())
    const db = createFakeDb(
      chunks.map((chunk) => ({
        chunk_index: chunk.chunkIndex,
        content_hash: chunk.contentHash,
        visibility: chunk.visibility,
        published_at: chunk.publishedAt,
        source_url: chunk.sourceUrl,
        model: 'text-embedding-3-small',
      })),
    )

    const result = await syncGithubRepoEmbeddings({
      db,
      repo: repo({ readme: '# bp-portfolio\n\nNow on a different stack.' }),
    })

    expect(result.written).toBeGreaterThan(0)
    expect(embedChunksMock).toHaveBeenCalledTimes(1)
  })
})

describe('staleRepoDocIds', () => {
  it('names the repos the listing no longer accounts for', () => {
    expect(staleRepoDocIds([1, 2, 3], [1, 3])).toEqual([2])
  })

  it('is empty when everything indexed is still listed', () => {
    expect(staleRepoDocIds([1, 2], [2, 1, 9])).toEqual([])
  })

  it('is stable and de-duplicated', () => {
    expect(staleRepoDocIds([5, 5, 1], [])).toEqual([1, 5])
  })
})

describe('canSweepGithubRepos', () => {
  it('runs on a complete listing that accounted for something', () => {
    expect(canSweepGithubRepos(12, 12, true)).toEqual({
      sweep: true,
      reason: null,
    })
  })

  it('refuses a listing that did not finish', () => {
    // A partial read would declare everything past the failure point dead.
    expect(canSweepGithubRepos(100, 100, false)).toEqual({
      sweep: false,
      reason: 'listing-incomplete',
    })
  })

  it('refuses an empty listing, which is far more often a broken read', () => {
    expect(canSweepGithubRepos(0, 0, true)).toEqual({
      sweep: false,
      reason: 'empty-listing',
    })
  })

  it('refuses when every listed repo failed to index', () => {
    expect(canSweepGithubRepos(12, 0, true)).toEqual({
      sweep: false,
      reason: 'nothing-accounted-for',
    })
  })
})

describe('deleteGithubRepoDocuments · never-leak', () => {
  it('deletes exactly the named repos, scoped to github-repos', async () => {
    const db = createFakeDb([])

    const deleted = await deleteGithubRepoDocuments(db, [11, 22])

    expect(deleted).toBe(2)
    const deletes = db.statements.filter((s) => s.text.includes('DELETE FROM'))
    expect(deletes).toHaveLength(2)
    for (const statement of deletes) {
      // Both bounds present: the collection AND a specific document. A DELETE
      // that lost either one would reach rows this module must never touch.
      expect(statement.text).toContain('"collection" =')
      expect(statement.text).toContain('"doc_id" =')
      expect(JSON.stringify(statement.params)).toContain('github-repos')
    }
  })

  it('does nothing when there is nothing stale', async () => {
    const db = createFakeDb([])
    expect(await deleteGithubRepoDocuments(db, [])).toBe(0)
    expect(db.statements).toHaveLength(0)
  })
})

describe('readIndexedRepoDocIds', () => {
  it('reads the distinct document ids of the github-repos collection only', async () => {
    const db = createFakeDb([{ doc_id: 7 }, { doc_id: 9 }])

    expect(await readIndexedRepoDocIds(db)).toEqual([7, 9])
    expect(db.statements[0].text).toContain('SELECT DISTINCT')
    expect(JSON.stringify(db.statements[0].params)).toContain('github-repos')
  })
})
