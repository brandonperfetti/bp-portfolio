import { isFuturePublicationDate } from '@/lib/date'

export type PublishGateSourceArticle = {
  title: string
  slug: string
  sourceStatus: string
  publishDate: string
  metaDescription: string
  seoTitle: string
  seoDescription: string
  coverImageUrl: string
  liveUrl: string
  contentPillar: string
  keywords: string[]
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

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
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

  if (!source.title.trim()) {
    errors.push('Missing required Title')
  }

  if (!source.seoTitle.trim()) {
    errors.push('Missing required SEO Title')
  } else {
    const seoTitleLength = source.seoTitle.trim().length
    if (seoTitleLength < 45 || seoTitleLength > 65) {
      errors.push(
        `SEO Title should be between 45 and 65 characters (found ${seoTitleLength})`,
      )
    }
  }

  if (!source.seoDescription.trim()) {
    errors.push('Missing required SEO Description')
  } else {
    const seoDescriptionLength = source.seoDescription.trim().length
    if (seoDescriptionLength < 120 || seoDescriptionLength > 160) {
      errors.push(
        `SEO Description should be between 120 and 160 characters (found ${seoDescriptionLength})`,
      )
    }
  }

  if (!source.metaDescription.trim()) {
    errors.push('Missing required Meta Description')
  } else {
    const metaLength = source.metaDescription.trim().length
    if (metaLength < 110 || metaLength > 170) {
      errors.push(
        `Meta Description should be between 110 and 170 characters (found ${metaLength})`,
      )
    }
  }

  if (!source.coverImageUrl.trim()) {
    errors.push('Missing required Cover Image URL')
  } else if (!isValidHttpUrl(source.coverImageUrl.trim())) {
    errors.push('Cover Image URL must be an absolute http(s) URL')
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

  if (source.keywords.length === 0) {
    errors.push('Missing required Keywords')
  }

  if (source.liveUrl.trim() && !isValidHttpUrl(source.liveUrl.trim())) {
    errors.push('Live URL must be an absolute http(s) URL when provided')
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
