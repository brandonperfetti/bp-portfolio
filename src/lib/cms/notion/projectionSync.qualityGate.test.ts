import { describe, expect, it } from 'vitest'

import {
  evaluateSourceArticleQualityRequirements,
  type SourceArticleQualitySnapshot,
} from './projectionSync'

function makeSnapshot(
  overrides: Partial<SourceArticleQualitySnapshot> = {},
): SourceArticleQualitySnapshot {
  return {
    sourcePageId: 'source-page-id',
    title: 'Testing Article',
    slug: 'testing-article',
    sourceStatus: 'Published',
    contentPillar: 'Software',
    articleType: 'Concept Explainer',
    coverStyleProfile: 'Editorial Realistic',
    reviewRound: 1,
    recoveryStatus: 'Recovered',
    hasRequiredMetadata: true,
    ...overrides,
  }
}

describe('evaluateSourceArticleQualityRequirements', () => {
  it('passes when required SOP quality fields are present', () => {
    const reasons = evaluateSourceArticleQualityRequirements(makeSnapshot())
    expect(reasons).toEqual([])
  })

  it('fails when review round is missing or below 1', () => {
    expect(
      evaluateSourceArticleQualityRequirements(
        makeSnapshot({ reviewRound: null }),
      ),
    ).toContain('Review Round must be set to 1 or higher')

    expect(
      evaluateSourceArticleQualityRequirements(
        makeSnapshot({ reviewRound: 0 }),
      ),
    ).toContain('Review Round must be set to 1 or higher')
  })

  it('fails when recovery status is missing', () => {
    const reasons = evaluateSourceArticleQualityRequirements(
      makeSnapshot({ recoveryStatus: '   ' }),
    )
    expect(reasons).toContain('Recovery Status is missing')
  })

  it('fails when has required metadata is not checked', () => {
    expect(
      evaluateSourceArticleQualityRequirements(
        makeSnapshot({ hasRequiredMetadata: false }),
      ),
    ).toContain('Has Required Metadata must be checked')

    expect(
      evaluateSourceArticleQualityRequirements(
        makeSnapshot({ hasRequiredMetadata: null }),
      ),
    ).toContain('Has Required Metadata must be checked')
  })

  it('fails when content pillar is missing', () => {
    expect(
      evaluateSourceArticleQualityRequirements(
        makeSnapshot({ contentPillar: '   ' }),
      ),
    ).toContain('Content Pillar is missing')
  })
})
