import { describe, expect, it } from 'vitest'

import { validatePublishSafeRequirements } from './publishGate'

function makeValidArticle() {
  return {
    slug: 'winning-cover-test',
    sourceStatus: 'Ready to Publish',
    publishDate: '2025-01-01',
    metaDescription: 'Meta description',
    coverImageUrl: 'https://example.com/cover.png',
    contentPillar: 'Software',
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

  it('fails when required fields are empty', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        slug: '   ',
        publishDate: ' ',
        metaDescription: '',
        coverImageUrl: ' ',
        contentPillar: '',
        topics: [],
      },
      null,
    )

    expect(reasons).toContain('Missing required Slug')
    expect(reasons).toContain('Missing required Published Date')
    expect(reasons).toContain('Missing required Meta Description')
    expect(reasons).toContain('Missing required Cover Image URL')
    expect(reasons).toContain('Missing required Content Pillar')
    expect(reasons).toContain('Missing required Topics/Tags')
  })

  it('fails when hasWinningCover is false', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        hasWinningCover: false,
      },
      null,
    )

    expect(reasons).toContain('Has Winning Cover must be checked')
  })

  it('fails when AI/Logic statuses are not Pass', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        aiCopyeditStatus: 'Fail',
        logicReviewStatus: 'Needs Review',
      },
      null,
    )

    expect(reasons).toContain('AI Copyedit Status must be Pass')
    expect(reasons).toContain('Logic Review Status must be Pass')
  })

  it('fails tutorial/hybrid articles when tutorial validation is not Pass', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        articleType: 'Tutorial',
        tutorialValidationStatus: 'Not Applicable',
      },
      null,
    )

    expect(reasons).toContain(
      'Tutorial Validation Status must be Pass for tutorial/hybrid articles',
    )
  })

  it('fails when re-revision is requested', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        reRevisionRequested: true,
      },
      null,
    )

    expect(reasons).toContain('Re-Revision Requested must be unchecked')
  })

  it('does not fail when author relation is missing and default author is blank', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        authorRelationIds: [],
      },
      '   ',
    )

    expect(reasons).toEqual([])
  })

  it('still passes when default author id is configured', () => {
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        authorRelationIds: [],
      },
      'default-author-id',
    )

    expect(reasons).toEqual([])
  })

  it('fails when published content has a future publish date', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const reasons = validatePublishSafeRequirements(
      {
        ...makeValidArticle(),
        sourceStatus: 'Published',
        publishDate: tomorrow,
      },
      null,
    )

    expect(reasons).toContain(
      'Published Date cannot be in the future when Content Status is Published',
    )
  })
})
