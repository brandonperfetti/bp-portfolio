import { describe, expect, it } from 'vitest'

import { CORVUS_GITHUB_REPOS_COLLECTION, sourceUrlFor } from '@/lib/ai/chunking'
import {
  type GithubRepoSource,
  MAX_DOC_ID,
  UnindexableRepoError,
  assertIndexableRepo,
  chunkGithubRepo,
  markdownToText,
  orderedLanguages,
  repoHeader,
  repoPublishedAt,
} from '@/lib/ai/githubRepos'

/** A minimal, valid public repo; spread and override per case. */
const repo = (overrides: Partial<GithubRepoSource> = {}): GithubRepoSource => ({
  id: 101,
  name: 'bp-portfolio',
  fullName: 'brandonperfetti/bp-portfolio',
  isPrivate: false,
  isFork: false,
  isArchived: false,
  description: 'Source code for my personal site and content platform.',
  homepage: 'https://brandonperfetti.com',
  topics: ['nextjs', 'payload'],
  language: 'TypeScript',
  languages: { TypeScript: 900_000, CSS: 12_000 },
  pushedAt: '2026-08-30T12:00:00.000Z',
  createdAt: '2025-01-04T09:00:00.000Z',
  readme: '# bp-portfolio\n\nNext.js 16 App Router with Payload CMS.',
  ...overrides,
})

describe('sourceUrlFor · github-repos', () => {
  it('cites the repository on github.com', () => {
    expect(
      sourceUrlFor(
        CORVUS_GITHUB_REPOS_COLLECTION,
        'brandonperfetti/bp-portfolio',
      ),
    ).toBe('https://github.com/brandonperfetti/bp-portfolio')
  })

  it('refuses a half-formed name rather than citing the owner page', () => {
    // `https://github.com/brandonperfetti` is a REAL page that is not this
    // repo, which is a worse citation than none.
    for (const bad of [
      'bp-portfolio',
      'brandonperfetti/',
      '',
      null,
      undefined,
    ]) {
      expect(sourceUrlFor(CORVUS_GITHUB_REPOS_COLLECTION, bad)).toBeNull()
    }
  })

  it('leaves every CMS collection URL untouched', () => {
    expect(sourceUrlFor('posts', 'from-neon-to-supabase')).toBe(
      '/articles/from-neon-to-supabase',
    )
    expect(sourceUrlFor('tech-stack')).toBe('/tech')
    expect(sourceUrlFor('work-history')).toBe('/')
  })
})

describe('assertIndexableRepo', () => {
  it('refuses a private repo even though the listing should never return one', () => {
    expect(() => assertIndexableRepo(repo({ isPrivate: true }))).toThrow(
      UnindexableRepoError,
    )
    expect(() => assertIndexableRepo(repo({ isPrivate: true }))).toThrow(
      /PRIVATE/,
    )
  })

  it('refuses an id that would not fit corvus_embeddings.doc_id', () => {
    expect(() => assertIndexableRepo(repo({ id: MAX_DOC_ID + 1 }))).toThrow(
      UnindexableRepoError,
    )
    expect(() => assertIndexableRepo(repo({ id: 0 }))).toThrow(
      UnindexableRepoError,
    )
  })

  it('accepts an ordinary public repo', () => {
    expect(() => assertIndexableRepo(repo())).not.toThrow()
  })
})

describe('markdownToText', () => {
  it('keeps a link’s text and drops its target', () => {
    // The rule the grounded prompt depends on: a URL that was only ever a link
    // target must not survive into the passage body, where it would compete
    // with the chunk's own `Source:` line.
    const text = markdownToText('See [the docs](https://example.com/docs) now.')
    expect(text).toBe('See the docs now.')
    expect(text).not.toContain('example.com')
  })

  it('removes badges, which are a link wrapping an image', () => {
    const text = markdownToText(
      '[![CI](https://img.shields.io/x.svg)](https://github.com/o/r/actions)\n\nHello.',
    )
    expect(text).not.toContain('shields.io')
    expect(text).not.toContain('](')
    expect(text).toContain('Hello.')
  })

  it('drops fenced code blocks entirely', () => {
    const text = markdownToText(
      'Install it:\n\n```bash\npnpm add secret-package\n```\n\nDone.',
    )
    expect(text).toContain('Install it:')
    expect(text).toContain('Done.')
    expect(text).not.toContain('pnpm add')
  })

  it('strips HTML and comments a README opens with', () => {
    const text = markdownToText(
      '<!-- tooling directive -->\n<p align="center">Centred</p>\n\nBody.',
    )
    expect(text).not.toContain('<p')
    expect(text).not.toContain('tooling directive')
    expect(text).toContain('Centred')
    expect(text).toContain('Body.')
  })

  it('removes heading, list and emphasis markers but keeps the words', () => {
    const text = markdownToText(
      '## Features\n\n- **Fast** search\n- `pnpm` only',
    )
    expect(text).toContain('Features')
    expect(text).toContain('Fast search')
    expect(text).toContain('pnpm only')
    expect(text).not.toContain('##')
    expect(text).not.toContain('**')
  })

  it('is empty for a missing README', () => {
    expect(markdownToText(null)).toBe('')
    expect(markdownToText(undefined)).toBe('')
    expect(markdownToText('')).toBe('')
  })
})

describe('orderedLanguages', () => {
  it('orders by bytes, largest first', () => {
    expect(
      orderedLanguages({ CSS: 100, TypeScript: 5000, JavaScript: 900 }),
    ).toEqual(['TypeScript', 'JavaScript', 'CSS'])
  })

  it('breaks ties alphabetically so content_hash is stable across syncs', () => {
    // An unstable order would change the hash every run and defeat the
    // zero-provider-call no-op the whole design rests on.
    expect(orderedLanguages({ Ruby: 10, Go: 10 })).toEqual(['Go', 'Ruby'])
  })

  it('is empty for an empty map', () => {
    expect(orderedLanguages({})).toEqual([])
  })
})

describe('repoPublishedAt', () => {
  it('uses pushed_at, which is always in the past', () => {
    expect(repoPublishedAt(repo())).toBe('2026-08-30T12:00:00.000Z')
  })

  it('falls back to created_at when there has been no push', () => {
    expect(repoPublishedAt(repo({ pushedAt: null }))).toBe(
      '2025-01-04T09:00:00.000Z',
    )
  })

  it('is null — not now() — when both timestamps are unusable', () => {
    // NULL means "not a scheduled thing" and stays retrievable; now() would
    // fabricate a fact.
    expect(
      repoPublishedAt(repo({ pushedAt: 'not-a-date', createdAt: null })),
    ).toBeNull()
  })
})

describe('repoHeader', () => {
  it('names the repository, so a mid-README passage says what it is about', () => {
    const header = repoHeader(repo())
    expect(header).toContain('Repository: brandonperfetti/bp-portfolio')
    expect(header).toContain('Topics: nextjs, payload')
    expect(header).toContain('Languages: TypeScript, CSS')
    expect(header).toContain('Homepage: https://brandonperfetti.com')
  })

  it('marks an archived repo, so an answer need not call it current work', () => {
    expect(repoHeader(repo({ isArchived: true }))).toContain('Archived:')
    expect(repoHeader(repo())).not.toContain('Archived:')
  })
})

describe('chunkGithubRepo', () => {
  it('produces rows keyed by the repository id under the github-repos collection', () => {
    const chunks = chunkGithubRepo(repo())
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      collection: 'github-repos',
      docId: 101,
      chunkIndex: 0,
      title: 'brandonperfetti/bp-portfolio',
      sourceUrl: 'https://github.com/brandonperfetti/bp-portfolio',
      visibility: 'public',
      publishedAt: '2026-08-30T12:00:00.000Z',
    })
    expect(chunks[0].content).toContain(
      'Next.js 16 App Router with Payload CMS',
    )
  })

  it('still indexes a repo with no README, so its existence is answerable', () => {
    const chunks = chunkGithubRepo(repo({ readme: null }))
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain(
      'Repository: brandonperfetti/bp-portfolio',
    )
  })

  it('splits a long README and prefixes every chunk with the header', () => {
    const paragraph = `${'word '.repeat(200)}\n\n`
    const chunks = chunkGithubRepo(repo({ readme: paragraph.repeat(6) }))
    expect(chunks.length).toBeGreaterThan(1)
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.chunkIndex).toBe(index)
      expect(chunk.content).toContain(
        'Repository: brandonperfetti/bp-portfolio',
      )
      expect(chunk.contentHash).toHaveLength(64)
    }
  })

  it('hashes identically for identical input and differently for a changed one', () => {
    expect(chunkGithubRepo(repo())[0].contentHash).toBe(
      chunkGithubRepo(repo())[0].contentHash,
    )
    expect(chunkGithubRepo(repo())[0].contentHash).not.toBe(
      chunkGithubRepo(repo({ description: 'Something else.' }))[0].contentHash,
    )
  })

  it('is NOT sensitive to pushed_at, which changes on every push', () => {
    // `published_at` moves, `content_hash` must not — otherwise every active
    // repo re-embeds every week for a timestamp.
    const a = chunkGithubRepo(repo())[0]
    const b = chunkGithubRepo(repo({ pushedAt: '2026-09-01T00:00:00.000Z' }))[0]
    expect(b.contentHash).toBe(a.contentHash)
    expect(b.publishedAt).not.toBe(a.publishedAt)
  })

  it('refuses to chunk a private repo at all', () => {
    expect(() => chunkGithubRepo(repo({ isPrivate: true }))).toThrow(
      UnindexableRepoError,
    )
  })
})
