export type PublishGateSourceArticle = {
  slug: string
  metaDescription: string
  coverImageUrl: string
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
 * @param defaultAuthorPageId Optional configured default author page id fallback.
 * @returns Array of validation error messages. Empty means all checks passed.
 *
 * Enforces required source fields/statuses, winning cover constraints,
 * tutorial-mode specific validation rules, and author fallback behavior.
 * This function has no side effects.
 */
export function validatePublishSafeRequirements(
  source: PublishGateSourceArticle,
  defaultAuthorPageId: string | null,
): string[] {
  const errors: string[] = []

  if (!source.slug.trim()) {
    errors.push('Missing required Slug')
  }

  if (!source.metaDescription.trim()) {
    errors.push('Missing required Meta Description')
  }

  if (!source.coverImageUrl.trim()) {
    errors.push('Missing required Cover Image URL')
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

  if (
    source.authorRelationIds.length === 0 &&
    (!defaultAuthorPageId || defaultAuthorPageId.trim().length === 0)
  ) {
    errors.push(
      'Missing required Author and NOTION_CMS_DEFAULT_AUTHOR_PAGE_ID is not configured',
    )
  }

  return errors
}
