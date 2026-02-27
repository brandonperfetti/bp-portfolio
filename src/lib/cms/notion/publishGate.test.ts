import { describe, expect, it } from 'vitest'

import { validatePublishSafeRequirements } from './publishGate'

function makeValidArticle() {
  return {
    slug: 'winning-cover-test',
    metaDescription: 'Meta description',
    coverImageUrl: 'https://example.com/cover.png',
    topics: ['Engineering'],
    hasWinningCover: true,
    winningCoverCount: 1,
    aiCopyeditStatus: 'Pass',
    logicReviewStatus: 'Pass',
    tutorialValidationStatus: 'Not Applicable',
    articleType: 'Blog Post',
    reRevisionRequested: false,
    authorRelationIds: ['author-page-id'],
  }
}

describe('validatePublishSafeRequirements', () => {
  it('passes when winning cover count is 1 and all checks pass', () => {
    const reasons = validatePublishSafeRequirements(makeValidArticle(), null)
    expect(reasons).toEqual([])
  })

  it('fails when winning cover count is 0', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        winningCoverCount: 0,
      },
      null,
    )

    expect(reasons).toContain('Winning Cover Count must be 1 (found 0)')
  })
})
