import { describe, expect, it } from 'vitest'

import { CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION } from '@/lib/ai/chunking'
import {
  PRIVATE_REPO_SUMMARIES,
  PRIVATE_SUMMARY_NOTICE,
  type PrivateRepoSummary,
  UnpublishableSummaryError,
  chunkPrivateRepoSummary,
  privateRepoSummaryDocId,
} from '@/lib/ai/privateRepoSummaries'

/**
 * #193's ingestion rule, pinned where it is enforced: a private repository
 * contributes exactly the four owner-written fields and nothing else.
 */

const entry: PrivateRepoSummary = {
  name: 'sample-private',
  description: 'Reusable checklists for reviewing pull requests.',
  topics: ['code-review', 'checklists'],
  blurb: 'Where the review checklists live while they become a toolkit.',
}

describe('PRIVATE_REPO_SUMMARIES', () => {
  it('is empty by default: adding a repository is a reviewed act', () => {
    expect(PRIVATE_REPO_SUMMARIES).toEqual([])
  })
})

describe('chunkPrivateRepoSummary', () => {
  it('renders exactly name, description, topics and blurb, plus the notice', () => {
    const chunk = chunkPrivateRepoSummary(entry)
    expect(chunk.content).toBe(
      [
        'Private repository: sample-private',
        'Description: Reusable checklists for reviewing pull requests.',
        'Topics: code-review, checklists',
        'About: Where the review checklists live while they become a toolkit.',
        PRIVATE_SUMMARY_NOTICE,
      ].join('\n'),
    )
    expect(chunk).toMatchObject({
      collection: CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION,
      chunkIndex: 0,
      title: 'sample-private (private repository)',
      sourceUrl: null,
      visibility: 'public',
      publishedAt: null,
    })
  })

  it('takes nothing else from the entry, README and code included', () => {
    const withPrivateContent = {
      ...entry,
      readme:
        '# Internal\nCLIENT_NAME_ACME deploys via https://internal.example',
      files: { 'src/secret.ts': 'export const TOKEN = "sk-live-XYZ"' },
      issues: ['ISSUE_BODY_INTERNAL'],
      homepage: 'https://github.com/brandonperfetti/sample-private',
    } as unknown as PrivateRepoSummary

    const { content, sourceUrl, title } =
      chunkPrivateRepoSummary(withPrivateContent)
    const row = `${title}\n${content}\n${sourceUrl}`
    for (const leak of [
      'CLIENT_NAME_ACME',
      'internal.example',
      'sk-live-XYZ',
      'secret.ts',
      'ISSUE_BODY_INTERNAL',
      'github.com',
    ]) {
      expect(row).not.toContain(leak)
    }
    expect(content).toBe(chunkPrivateRepoSummary(entry).content)
  })

  it('keeps colon-delimited text that does not start a URL scheme', () => {
    const blurb = 'Checks metadata:schema and Intel:x86.'
    expect(chunkPrivateRepoSummary({ ...entry, blurb }).content).toContain(
      blurb,
    )
  })

  it('cites the blurb’s public home on this site when it has one', () => {
    expect(
      chunkPrivateRepoSummary({ ...entry, publicUrl: '/articles/sample' })
        .sourceUrl,
    ).toBe('/articles/sample')
  })

  it.each([
    ['an owner in the name', { name: 'brandonperfetti/sample-private' }],
    ['a space in the name', { name: 'sample private' }],
    ['a GitHub address in the blurb', { blurb: 'See github.com/x/y.' }],
    ['a URL in the description', { description: 'https://example.com' }],
    [
      'a non-HTTP URL in the description',
      { description: 'ftp://example.com/internal' },
    ],
    [
      'a mail link in the description',
      { description: 'mailto:docs@example.com' },
    ],
    ['a URL in a topic', { topics: ['www.example.com'] }],
    [
      'a URL inside Markdown emphasis (#465 review)',
      { blurb: 'Read _https://internal.example/runbook_ for context.' },
    ],
    ['an empty blurb', { blurb: '   ' }],
    [
      'a GitHub publicUrl',
      { publicUrl: 'https://github.com/brandonperfetti/sample-private' },
    ],
    ['a protocol-relative publicUrl', { publicUrl: '//evil.example/x' }],
    [
      'a backslash publicUrl a browser reads as GitHub (#193 review)',
      { publicUrl: '/\\github.com/brandonperfetti/sample-private' },
    ],
    ['a publicUrl with a backslash later on', { publicUrl: '/a\\b' }],
    ['a publicUrl with a tab', { publicUrl: '/\tgithub.com/x' }],
  ])('refuses %s', (_label, override) => {
    expect(() =>
      chunkPrivateRepoSummary({ ...entry, ...override } as PrivateRepoSummary),
    ).toThrow(UnpublishableSummaryError)
  })
})

describe('privateRepoSummaryDocId', () => {
  it('is stable for a name and a positive int4', () => {
    const id = privateRepoSummaryDocId('sample-private')
    expect(id).toBe(privateRepoSummaryDocId('sample-private'))
    expect(Number.isInteger(id)).toBe(true)
    expect(id).toBeGreaterThan(0)
    expect(id).toBeLessThanOrEqual(2_147_483_647)
  })

  it('differs between names', () => {
    expect(privateRepoSummaryDocId('a')).not.toBe(privateRepoSummaryDocId('b'))
  })
})
