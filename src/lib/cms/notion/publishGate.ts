import { isFuturePublicationDate } from '@/lib/date'

export type PublishGateSourceArticle = {
  slug: string
  sourceStatus: string
  publishDate: string
  metaDescription: string
  coverImageUrl: string
  contentPillar: string
  topics: string[]
  hasWinningCover: boolean
  winningCoverCount?: number
  aiCopyeditStatus: string
  logicReviewStatus: string
  tutorialValidationStatus: string
  articleType: string
  reRevisionRequested: boolean
  authorRelationIds: string[]
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase()
}

function isTutorialLike(articleType: string) {
  const mode = normalizeStatus(articleType)
  return mode.includes('tutorial') || mode.includes('hybrid')
}

/**
 * Validates publish-safe requirements for a source article.
 *
 * @param source Source article fields used by publish-gate policy checks.
 * @param _defaultAuthorPageId Reserved for compatibility with existing call
 * sites; author relation is intentionally non-blocking in publish validation.
 * @returns Array of validation error messages. Empty means all checks passed.
 *
 * Enforces required source fields/statuses, winning cover constraints,
 * tutorial-mode specific validation rules, and non-blocking author handling.
 * This function has no side effects.
 */
export function validatePublishSafeRequirements(
  source: PublishGateSourceArticle,
  _defaultAuthorPageId: string | null,
): string[] {
  const errors: string[] = []
  const sourceStatus = normalizeStatus(source.sourceStatus)

  if (!source.slug.trim()) {
    errors.push('Missing required Slug')
  }

  if (!source.metaDescription.trim()) {
    errors.push('Missing required Meta Description')
  }

  if (!source.coverImageUrl.trim()) {
    errors.push('Missing required Cover Image URL')
  }

  if (!source.contentPillar.trim()) {
    errors.push('Missing required Content Pillar')
  }

  if (!source.publishDate.trim()) {
    errors.push('Missing required Published Date')
  } else if (
    sourceStatus === 'published' &&
    isFuturePublicationDate(source.publishDate)
  ) {
    errors.push(
      'Published Date cannot be in the future when Content Status is Published',
    )
  }

  if (source.topics.length === 0) {
    errors.push('Missing required Topics/Tags')
  }

  if (!source.hasWinningCover) {
    errors.push('Has Winning Cover must be checked')
  }

  if (
    source.winningCoverCount !== undefined &&
    source.winningCoverCount !== 1
  ) {
    errors.push(
      `Winning Cover Count must be 1 (found ${source.winningCoverCount})`,
    )
  }

  if (normalizeStatus(source.aiCopyeditStatus) !== 'pass') {
    errors.push('AI Copyedit Status must be Pass')
  }

  if (normalizeStatus(source.logicReviewStatus) !== 'pass') {
    errors.push('Logic Review Status must be Pass')
  }

  if (isTutorialLike(source.articleType)) {
    if (normalizeStatus(source.tutorialValidationStatus) !== 'pass') {
      errors.push(
        'Tutorial Validation Status must be Pass for tutorial/hybrid articles',
      )
    }
  } else {
    const tutorialStatus = normalizeStatus(source.tutorialValidationStatus)
    if (
      tutorialStatus &&
      tutorialStatus !== 'not applicable' &&
      tutorialStatus !== 'pass'
    ) {
      errors.push(
        'Tutorial Validation Status must be Not Applicable (or Pass) for non-tutorial articles',
      )
    }
  }

  if (source.reRevisionRequested) {
    errors.push('Re-Revision Requested must be unchecked')
  }

  // Author is a quality signal, but not a hard publish blocker.
  // Runtime rendering has a stable default-author fallback, so missing relation
  // is intentionally non-blocking for otherwise publish-safe content.

  return errors
}
