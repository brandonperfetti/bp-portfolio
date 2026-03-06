import type { NotionPage } from '@/lib/cms/notion/contracts'
import OpenAI from 'openai'

import { flattenBlockText, getNotionBlockTree } from '@/lib/cms/notion/blocks'
import {
  notionCreatePage,
  notionGetPage,
  notionUpdatePage,
} from '@/lib/cms/notion/client'
import {
  getNotionArticlesDataSourceId,
  getNotionContentCalendarDataSourceId,
  getNotionContentDataSourceId,
  getOptionalNotionDefaultAuthorPageId,
} from '@/lib/cms/notion/config'
import { NotionHttpError } from '@/lib/cms/notion/errors'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import { validatePublishSafeRequirements } from '@/lib/cms/notion/publishGate'
import {
  getProperty,
  propertyToBoolean,
  propertyToDate,
  propertyToMultiSelect,
  propertyToNumber,
  propertyToRelationIds,
  propertyToText,
} from '@/lib/cms/notion/property'
import { uploadBase64PngToCloudinary } from '@/lib/media/cloudinary'

type ProjectionStatus = 'Draft' | 'Ready to Publish' | 'Published'

type SourceArticle = {
  id: string
  title: string
  slug: string
  summary: string
  metaDescription: string
  coverImageUrl: string
  contentPillar: string
  keywords: string[]
  topics: string[]
  tech: string[]
  publishDate: string
  liveUrl: string
  contentType: string
  sourceStatus: string
  projectionStatus: ProjectionStatus
  articleType: string
  aiCopyeditStatus: string
  logicReviewStatus: string
  tutorialValidationStatus: string
  reRevisionRequested: boolean
  hasWinningCover: boolean
  winningCoverCount?: number
  authorRelationIds: string[]
  revisionFingerprint: string
}

export type ProjectionSyncResult = {
  ok: boolean
  scanned: number
  eligible: number
  created: number
  updated: number
  archived: number
  skipped: number
  errors: Array<{ sourcePageId: string; message: string }>
}

type ReconcileSeverity = 'critical' | 'warning'

export type ProjectionReconcileFinding = {
  code:
    | 'SOURCE_PUBLISHSAFE_MISSING_TARGET'
    | 'TARGET_PUBLISHSAFE_MISSING_SOURCE'
    | 'STATUS_MISMATCH'
    | 'COVER_URL_MISMATCH'
    | 'CALENDAR_MISSING_ASSIGNED_ARTICLE'
    | 'CALENDAR_MULTI_ASSIGNED_ARTICLES'
    | 'CALENDAR_ARTICLE_MULTI_ROWS'
  severity: ReconcileSeverity
  sourcePageId?: string
  targetPageId?: string
  calendarPageId?: string
  slug?: string
  message: string
}

export type ProjectionReconcileResult = {
  ok: boolean
  checkedSource: number
  checkedTargets: number
  checkedCalendarRows: number
  findings: ProjectionReconcileFinding[]
}

export type SourcePublishGateResult = {
  ok: boolean
  sourcePageId: string
  sourceStatus?: string
  reasons: string[]
}

/**
 * Quality-gate metadata snapshot extracted from a source article row.
 *
 * Nullable fields represent incomplete source data:
 * - `reviewRound` is null when unset/non-numeric.
 * - `hasRequiredMetadata` is null when checkbox/property is missing.
 */
export type SourceArticleQualitySnapshot = {
  sourcePageId: string
  title: string
  slug: string
  sourceStatus: string
  contentPillar: string
  articleType: string
  coverStyleProfile: string
  reviewRound: number | null
  recoveryStatus: string
  hasRequiredMetadata: boolean | null
}

/**
 * A quality-gate failure for one source row plus blocking reasons.
 *
 * `reasons` contains human-readable validation failures for this specific
 * source row (`sourcePageId`).
 */
export type SourceArticleQualityFailure = SourceArticleQualitySnapshot & {
  reasons: string[]
}

/**
 * Aggregate result for source quality-gate evaluation.
 *
 * Counter semantics:
 * - `scanned`: quality snapshots parsed from source pages.
 * - `checkedPublishSafe`: publish-safe rows evaluated against requirements.
 * - `passed`/`failed`: evaluated publish-safe rows.
 * - `ok`: true when no publish-safe rows failed.
 */
export type SourceArticleQualityGateResult = {
  ok: boolean
  scanned: number
  checkedPublishSafe: number
  passed: number
  failed: number
  failures: SourceArticleQualityFailure[]
}

/**
 * Aggregate result for source quality auto-healing.
 *
 * Counter semantics:
 * - `scanned`: quality snapshots parsed from source pages.
 * - `checkedPublishSafe`: publish-safe rows considered for healing.
 * - `healed`: rows updated in Notion.
 * - `skipped`: rows not publish-safe or already compliant.
 * - `ok`: true when no row-level errors were recorded.
 */
export type SourceArticleAutoHealResult = {
  ok: boolean
  scanned: number
  checkedPublishSafe: number
  healed: number
  skipped: number
  errors: Array<{ sourcePageId: string; message: string }>
}

/**
 * Aggregate result for cover regeneration request processing.
 *
 * Counter semantics:
 * - `scanned`: source rows inspected.
 * - `queued`: publish-safe rows with regenerate request checked.
 * - `regenerated`: successful cover regenerations written.
 * - `skipped`: queued rows deferred due to run limit.
 * - `ok`: true when no row-level errors were recorded.
 *
 * `errors` entries contain failing source row IDs and stage-specific messages
 * (generation, upload, Notion update, or follow-up projection sync).
 */
export type CoverRegenerationResult = {
  ok: boolean
  scanned: number
  queued: number
  regenerated: number
  skipped: number
  errors: Array<{ sourcePageId: string; message: string }>
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function toTitle(content: string) {
  return {
    title: [
      {
        type: 'text',
        text: { content: content.slice(0, 2000) },
      },
    ],
  }
}

function toRichText(content: string) {
  return {
    rich_text: [
      {
        type: 'text',
        text: { content: content.slice(0, 2000) },
      },
    ],
  }
}

function sourceToProjectionStatus(sourceStatus: string): ProjectionStatus {
  const normalized = sourceStatus.trim().toLowerCase()
  if (normalized === 'published') return 'Published'
  if (normalized === 'ready to publish') return 'Ready to Publish'
  return 'Draft'
}

function mapSourcePage(page: NotionPage): SourceArticle | null {
  const title = propertyToText(getProperty(page.properties, ['Name', 'Title']))
  const slug = toSlug(
    propertyToText(getProperty(page.properties, ['Slug'])) || title,
  )
  const metaDescription = propertyToText(
    getProperty(page.properties, ['Meta Description']),
  )
  const coverImageUrl = propertyToText(
    getProperty(page.properties, ['Cover Image URL']),
  )
  const contentPillar = propertyToText(
    getProperty(page.properties, ['Content Pillar', 'Pillar']),
  )
  const publishDate = propertyToDate(
    getProperty(page.properties, ['Published Date', 'Publish Date']),
  )
  const liveUrl = propertyToText(getProperty(page.properties, ['Live URL']))
  const keywords = propertyToMultiSelect(
    getProperty(page.properties, ['Keywords']),
  )
  const topics = propertyToMultiSelect(
    getProperty(page.properties, ['Topics/Tags', 'Topics', 'Tags']),
  )
  const tech = propertyToMultiSelect(
    getProperty(page.properties, ['Tech', 'Tech Stack', 'Technologies']),
  )
  const contentType = propertyToText(
    getProperty(page.properties, ['Content Type']),
  )
  const sourceStatus = propertyToText(
    getProperty(page.properties, ['Content Status', 'Status']),
  )
  const projectionStatus = sourceToProjectionStatus(sourceStatus)
  const articleType = propertyToText(
    getProperty(page.properties, ['Article Type', 'Mode']),
  )
  const aiCopyeditStatus = propertyToText(
    getProperty(page.properties, ['AI Copyedit Status', 'AI Copyedit']),
  )
  const logicReviewStatus = propertyToText(
    getProperty(page.properties, ['Logic Review Status', 'Logic Review']),
  )
  const tutorialValidationStatus = propertyToText(
    getProperty(page.properties, [
      'Tutorial Validation Status',
      'Tutorial Validation',
    ]),
  )
  const reRevisionRequested =
    propertyToBoolean(
      getProperty(page.properties, ['Re-Revision Requested']),
    ) ?? false
  const hasWinningCover = propertyToBoolean(
    getProperty(page.properties, ['Has Winning Cover']),
  )
  const winningCoverCount = propertyToNumber(
    getProperty(page.properties, ['Winning Cover Count']),
  )
  const authorRelationIds = propertyToRelationIds(
    getProperty(page.properties, ['Author', 'Authors']),
  )

  if (!title || !slug || contentType.toLowerCase() !== 'blog post') {
    return null
  }

  return {
    id: page.id,
    title,
    slug,
    summary: metaDescription || title,
    metaDescription,
    coverImageUrl,
    contentPillar,
    keywords,
    topics,
    tech,
    publishDate,
    liveUrl,
    contentType,
    sourceStatus,
    projectionStatus,
    articleType,
    aiCopyeditStatus,
    logicReviewStatus,
    tutorialValidationStatus,
    reRevisionRequested,
    hasWinningCover: hasWinningCover ?? false,
    winningCoverCount,
    authorRelationIds,
    revisionFingerprint: `${page.id}:${page.last_edited_time ?? ''}:${sourceStatus}:${slug}`,
  }
}

function eligibleForProjection(source: SourceArticle) {
  const status = source.sourceStatus.trim().toLowerCase()
  return (
    (status === 'ready to publish' || status === 'published') &&
    source.topics.length > 0
  )
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase()
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function resolveDefaultCoverStyleProfile(articleType: string) {
  const type = normalizeKey(articleType)
  if (type === 'implementationtutorial') {
    return 'Technical Minimal'
  }
  if (type === 'toolshowcase') {
    return 'Studio Photoreal'
  }
  // Defaults for Concept Explainer, Hybrid, and unknown types.
  return 'Editorial Realistic'
}

function resolveDefaultContentPillar(articleType: string, tags: string[]) {
  const articleTypeKey = normalizeKey(articleType)
  const normalizedTags = tags.map((tag) => normalizeKey(tag))

  if (
    normalizedTags.some((tag) =>
      ['mindset', 'career', 'growth', 'habits'].includes(tag),
    )
  ) {
    return 'Mindset'
  }
  if (
    normalizedTags.some((tag) =>
      ['design', 'ux', 'ui', 'productdesign', 'systemsdesign'].includes(tag),
    )
  ) {
    return 'Design'
  }
  if (
    normalizedTags.some((tag) =>
      ['leadership', 'management', 'team', 'mentoring'].includes(tag),
    )
  ) {
    return 'Leadership'
  }
  if (
    normalizedTags.some((tag) =>
      ['product', 'execution', 'strategy', 'roadmap'].includes(tag),
    )
  ) {
    return 'Product Execution'
  }

  if (articleTypeKey === 'hybrid') {
    return 'Product Execution'
  }

  return 'Software'
}

function resolveDefaultCoverSceneArchetype(articleType: string) {
  const type = normalizeKey(articleType)
  if (type === 'implementationtutorial') return 'Workbench'
  if (type === 'toolshowcase') return 'Conceptual System'
  if (type === 'conceptexplainer') return 'Abstract Workflow'
  if (type === 'hybrid') return 'Architectural/Infra'
  return 'Abstract Workflow'
}

function isPublishSafeStatus(value: string) {
  const normalized = normalizeStatus(value)
  return normalized === 'ready to publish' || normalized === 'published'
}

function parseQualitySnapshot(
  page: NotionPage,
): SourceArticleQualitySnapshot | null {
  const title = propertyToText(getProperty(page.properties, ['Name', 'Title']))
  const slug = toSlug(
    propertyToText(getProperty(page.properties, ['Slug'])) || title,
  )
  const sourceStatus = propertyToText(
    getProperty(page.properties, ['Content Status', 'Status']),
  )
  const contentType = propertyToText(
    getProperty(page.properties, ['Content Type']),
  )

  if (!title || !slug || normalizeStatus(contentType) !== 'blog post') {
    return null
  }

  return {
    sourcePageId: page.id,
    title,
    slug,
    sourceStatus,
    contentPillar: propertyToText(
      getProperty(page.properties, ['Content Pillar', 'Pillar']),
    ),
    articleType: propertyToText(getProperty(page.properties, ['Article Type'])),
    coverStyleProfile: propertyToText(
      getProperty(page.properties, [
        'Cover Style Profile',
        'Image Style Profile',
        'Cover Style',
      ]),
    ),
    reviewRound:
      propertyToNumber(getProperty(page.properties, ['Review Round'])) ?? null,
    recoveryStatus: propertyToText(
      getProperty(page.properties, ['Recovery Status']),
    ),
    hasRequiredMetadata:
      propertyToBoolean(
        getProperty(page.properties, ['Has Required Metadata']),
      ) ?? null,
  }
}

export function evaluateSourceArticleQualityRequirements(
  snapshot: SourceArticleQualitySnapshot,
): string[] {
  const reasons: string[] = []

  if (snapshot.reviewRound === null || snapshot.reviewRound < 1) {
    reasons.push('Review Round must be set to 1 or higher')
  }

  if (!snapshot.recoveryStatus.trim()) {
    reasons.push('Recovery Status is missing')
  }

  if (snapshot.hasRequiredMetadata !== true) {
    reasons.push('Has Required Metadata must be checked')
  }

  if (!snapshot.coverStyleProfile.trim()) {
    reasons.push('Cover Style Profile is missing')
  }

  if (!snapshot.contentPillar.trim()) {
    reasons.push('Content Pillar is missing')
  }

  return reasons
}

function findPropertyName(
  properties: Record<string, unknown>,
  aliases: string[],
): string | null {
  const entries = Object.keys(properties)
  for (const alias of aliases) {
    const normalized = alias.toLowerCase().replace(/[^a-z0-9]/g, '')
    const found = entries.find(
      (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized,
    )
    if (found) {
      return found
    }
  }
  return null
}

function buildSourceQualityAutoHealProperties(page: NotionPage) {
  const properties: Record<string, unknown> = {}
  let mutated = false

  const reviewRoundName = findPropertyName(page.properties, ['Review Round'])
  const recoveryStatusName = findPropertyName(page.properties, [
    'Recovery Status',
  ])
  const requiredMetadataName = findPropertyName(page.properties, [
    'Has Required Metadata',
  ])
  const coverStyleProfileName = findPropertyName(page.properties, [
    'Cover Style Profile',
    'Image Style Profile',
    'Cover Style',
  ])
  const contentPillarName = findPropertyName(page.properties, [
    'Content Pillar',
    'Pillar',
  ])
  const coverSceneArchetypeName = findPropertyName(page.properties, [
    'Cover Scene Archetype',
    'Image Scene Archetype',
    'Scene Archetype',
  ])

  const reviewRound = propertyToNumber(
    getProperty(page.properties, ['Review Round']),
  )
  const recoveryStatus = propertyToText(
    getProperty(page.properties, ['Recovery Status']),
  )
  const hasRequiredMetadata = propertyToBoolean(
    getProperty(page.properties, ['Has Required Metadata']),
  )
  const coverStyleProfile = propertyToText(
    getProperty(page.properties, [
      'Cover Style Profile',
      'Image Style Profile',
      'Cover Style',
    ]),
  )
  const articleType = propertyToText(
    getProperty(page.properties, ['Article Type']),
  )
  const contentPillar = propertyToText(
    getProperty(page.properties, ['Content Pillar', 'Pillar']),
  )
  const topics = propertyToMultiSelect(
    getProperty(page.properties, ['Topics/Tags', 'Topics', 'Tags']),
  )
  const tech = propertyToMultiSelect(
    getProperty(page.properties, ['Tech', 'Tech Stack', 'Technologies']),
  )
  const coverSceneArchetype = propertyToText(
    getProperty(page.properties, [
      'Cover Scene Archetype',
      'Image Scene Archetype',
      'Scene Archetype',
    ]),
  )

  if (reviewRoundName && (reviewRound === undefined || reviewRound < 1)) {
    properties[reviewRoundName] = { number: 1 }
    mutated = true
  }

  if (recoveryStatusName && !recoveryStatus.trim()) {
    const propType = page.properties[recoveryStatusName]?.type
    if (propType === 'status') {
      properties[recoveryStatusName] = { status: { name: 'Not Needed' } }
      mutated = true
    } else if (propType === 'select') {
      properties[recoveryStatusName] = { select: { name: 'Not Needed' } }
      mutated = true
    }
  }

  if (requiredMetadataName && hasRequiredMetadata !== true) {
    properties[requiredMetadataName] = { checkbox: true }
    mutated = true
  }

  if (coverStyleProfileName && !coverStyleProfile.trim()) {
    const defaultStyle = resolveDefaultCoverStyleProfile(articleType)
    const propType = page.properties[coverStyleProfileName]?.type
    if (propType === 'select') {
      properties[coverStyleProfileName] = { select: { name: defaultStyle } }
      mutated = true
    } else if (propType === 'status') {
      properties[coverStyleProfileName] = { status: { name: defaultStyle } }
      mutated = true
    } else if (propType === 'rich_text') {
      properties[coverStyleProfileName] = toRichText(defaultStyle)
      mutated = true
    } else if (propType === 'title') {
      properties[coverStyleProfileName] = toTitle(defaultStyle)
      mutated = true
    }
  }

  if (coverSceneArchetypeName && !coverSceneArchetype.trim()) {
    const defaultSceneArchetype = resolveDefaultCoverSceneArchetype(articleType)
    const propType = page.properties[coverSceneArchetypeName]?.type
    if (propType === 'select') {
      properties[coverSceneArchetypeName] = {
        select: { name: defaultSceneArchetype },
      }
      mutated = true
    } else if (propType === 'status') {
      properties[coverSceneArchetypeName] = {
        status: { name: defaultSceneArchetype },
      }
      mutated = true
    } else if (propType === 'rich_text') {
      properties[coverSceneArchetypeName] = toRichText(defaultSceneArchetype)
      mutated = true
    } else if (propType === 'title') {
      properties[coverSceneArchetypeName] = toTitle(defaultSceneArchetype)
      mutated = true
    }
  }

  if (contentPillarName && !contentPillar.trim()) {
    const defaultPillar = resolveDefaultContentPillar(articleType, [
      ...topics,
      ...tech,
    ])
    const propType = page.properties[contentPillarName]?.type
    if (propType === 'select') {
      properties[contentPillarName] = { select: { name: defaultPillar } }
      mutated = true
    } else if (propType === 'status') {
      properties[contentPillarName] = { status: { name: defaultPillar } }
      mutated = true
    } else if (propType === 'rich_text') {
      properties[contentPillarName] = toRichText(defaultPillar)
      mutated = true
    } else if (propType === 'title') {
      properties[contentPillarName] = toTitle(defaultPillar)
      mutated = true
    }
  }

  return { mutated, properties }
}

type CoverRegenerationCandidate = SourceArticleQualitySnapshot & {
  regenerateCoverRequested: boolean
  regenerateCoverReason: string
  coverMoodHints: string
  coverStyleProfile: string
  coverSceneArchetype: string
  metaDescription: string
  coverImageUrl: string
  tech: string[]
  topics: string[]
  recoveryAttempts: number
  sourcePage: NotionPage
}

const COVER_VARIANT_FRAMES = [
  {
    key: 'A',
    frame:
      'Variant A composition: editorial workstation scene with one focal subject, layered depth, and subtle UI context shapes.',
  },
  {
    key: 'B',
    frame:
      'Variant B composition: conceptual product-flow scene with abstract test/validation motifs and restrained iconography.',
  },
  {
    key: 'C',
    frame:
      'Variant C composition: structured workflow tableau showing setup-execute-assert progression through purely visual cues and abstract blocks.',
  },
] as const

const COVER_HOUSE_STYLE =
  'House style: premium editorial tech cover, cinematic but believable lighting, realistic materials, restrained color palette (deep navy/charcoal with one accent), clean composition, strong single focal point, no cartoon look, no clip-art look, no flat vector style, no obvious AI artifacts.'

const COVER_NEGATIVE_CONSTRAINTS =
  'Hard constraints: no large/focal readable text, no title-like wording, no UI labels as focal elements, no logos, no watermarks, no icon fonts, no split-panel collage, no triptych layout, no infographic style, no comic style, no poster style, no tiny people, no miniature figurines, no diorama scenes, no multiple vignette micro-scenes.'

const COVER_RETRY_SUFFIX =
  'Retry correction: previous output likely contained prominent text/UI artifacts. Produce a single coherent photoreal scene only. Any incidental screen details must be subtle, non-focal, and not clearly readable at card thumbnail size.'

const COVER_STYLE_PROFILES: Record<string, string> = {
  editorialrealistic:
    'Style profile: editorial realistic. Photorealistic scene construction, natural camera perspective, subtle filmic contrast, practical lighting, no exaggerated stylization.',
  technicalminimal:
    'Style profile: technical minimal. Simplified but realistic forms, clean geometry, restrained detail density, neutral backgrounds, enterprise-grade visual tone.',
  studiophotoreal:
    'Style profile: studio photoreal. Product-shot discipline, controlled key/fill lighting, precise material rendering, polished but credible realism.',
}

const COVER_SCENE_ARCHETYPES: Record<string, string> = {
  conceptualsystem:
    'Scene archetype: conceptual system. Use abstract technical forms and one clear visual metaphor, not a literal desk setup.',
  abstractworkflow:
    'Scene archetype: abstract workflow. Express sequence and momentum with structured shapes and depth, without segmented panels.',
  workbench:
    'Scene archetype: workbench. A realistic engineering workspace is allowed, but keep one coherent scene and avoid tiny narrative characters.',
  architecturalinfra:
    'Scene archetype: architectural/infra. Show systems, topology, or infrastructure motifs with cinematic realism and clear hierarchy.',
  humanmoment:
    'Scene archetype: human moment. One human-centered action conveying intent and emotion, no collage-like storytelling.',
}

const COVER_SCENE_ARCHETYPE_CYCLE = [
  'workbench',
  'conceptualsystem',
  'abstractworkflow',
  'architecturalinfra',
  'humanmoment',
] as const

function resolveDefaultSceneArchetype(articleType: string) {
  const type = normalizeKey(articleType)
  if (type === 'implementationtutorial') return 'workbench'
  if (type === 'toolshowcase') return 'conceptualsystem'
  return 'abstractworkflow'
}

function rotateSceneArchetype(current: string) {
  const key = current
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  const currentIndex = COVER_SCENE_ARCHETYPE_CYCLE.indexOf(
    key as (typeof COVER_SCENE_ARCHETYPE_CYCLE)[number],
  )
  if (currentIndex < 0) {
    return COVER_SCENE_ARCHETYPE_CYCLE[0]
  }
  return COVER_SCENE_ARCHETYPE_CYCLE[
    (currentIndex + 1) % COVER_SCENE_ARCHETYPE_CYCLE.length
  ]
}

function resolveSceneArchetypeLine(
  candidate: CoverRegenerationCandidate,
  options?: { preferNonWorkbench?: boolean; forcedSceneArchetypeKey?: string },
) {
  const raw = candidate.coverSceneArchetype.trim()
  let key = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!key) {
    key = resolveDefaultSceneArchetype(candidate.articleType)
  }

  if (options?.forcedSceneArchetypeKey) {
    key = options.forcedSceneArchetypeKey
  } else if (options?.preferNonWorkbench && key === 'workbench') {
    key = 'conceptualsystem'
  }

  return {
    key,
    line:
      COVER_SCENE_ARCHETYPES[key] ||
      `Scene archetype override: ${raw}. Keep single-scene composition and avoid micro-scene storytelling.`,
  }
}

function parseCoverRegenerationCandidate(
  page: NotionPage,
): CoverRegenerationCandidate | null {
  const snapshot = parseQualitySnapshot(page)
  if (!snapshot) {
    return null
  }

  const regenerateCoverRequested =
    propertyToBoolean(
      getProperty(page.properties, ['Regenerate Cover Requested']),
    ) ?? false

  return {
    ...snapshot,
    regenerateCoverRequested,
    regenerateCoverReason: propertyToText(
      getProperty(page.properties, ['Regenerate Cover Reason']),
    ),
    coverMoodHints: propertyToText(
      getProperty(page.properties, ['Cover Mood Hints', 'Image Mood Hints']),
    ),
    coverStyleProfile: propertyToText(
      getProperty(page.properties, [
        'Cover Style Profile',
        'Image Style Profile',
        'Cover Style',
      ]),
    ),
    coverSceneArchetype: propertyToText(
      getProperty(page.properties, [
        'Cover Scene Archetype',
        'Image Scene Archetype',
        'Scene Archetype',
      ]),
    ),
    metaDescription: propertyToText(
      getProperty(page.properties, ['Meta Description']),
    ),
    coverImageUrl: propertyToText(
      getProperty(page.properties, ['Cover Image URL']),
    ),
    tech: propertyToMultiSelect(
      getProperty(page.properties, ['Tech', 'Tech Stack', 'Technologies']),
    ),
    topics: propertyToMultiSelect(
      getProperty(page.properties, ['Topics/Tags', 'Topics', 'Tags']),
    ),
    recoveryAttempts:
      propertyToNumber(getProperty(page.properties, ['Recovery Attempts'])) ??
      0,
    sourcePage: page,
  }
}

function buildCoverPrompt(
  candidate: CoverRegenerationCandidate,
  options?: { preferNonWorkbench?: boolean; forcedSceneArchetypeKey?: string },
) {
  const variant =
    COVER_VARIANT_FRAMES[
      Math.max(0, candidate.recoveryAttempts) % COVER_VARIANT_FRAMES.length
    ]
  const tags = [...candidate.tech, ...candidate.topics]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8)
  const tagLine = tags.length > 0 ? `Tags: ${tags.join(', ')}.` : ''
  const reason = candidate.regenerateCoverReason.trim()
  const reasonLine = reason ? `Regeneration reason: ${reason}.` : ''
  const moodHints = candidate.coverMoodHints.trim()
  const moodLine = moodHints
    ? `Mood intent: ${moodHints}. Prioritize emotional tone over literal UI/content depiction.`
    : ''
  const styleKey = candidate.coverStyleProfile
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  const styleProfileLine =
    COVER_STYLE_PROFILES[styleKey] ||
    (candidate.coverStyleProfile.trim()
      ? `Style profile override: ${candidate.coverStyleProfile.trim()}. Keep output realistic and production-brand aligned.`
      : COVER_STYLE_PROFILES.editorialrealistic)
  const sceneArchetype = resolveSceneArchetypeLine(candidate, options)
  const screenPolicyLine =
    sceneArchetype.key === 'workbench'
      ? 'Workbench scenes may include monitors, but any text-like details must remain incidental and non-focal.'
      : 'Avoid monitors/screens entirely for this archetype to reduce UI/text artifacts.'

  return [
    'Create a cohesive blog cover image in 16:9.',
    `Article title: ${candidate.title}.`,
    candidate.metaDescription
      ? `Article summary: ${candidate.metaDescription}.`
      : '',
    tagLine,
    reasonLine,
    moodLine,
    styleProfileLine,
    sceneArchetype.line,
    COVER_HOUSE_STYLE,
    variant.frame,
    `Prompt variant: ${variant.key}.`,
    COVER_NEGATIVE_CONSTRAINTS,
    screenPolicyLine,
    'If a screen/device appears, keep any text-like details incidental, small, non-focal, and not legible at thumbnail size.',
    'Keep strong focal point, clean negative space, and thumbnail clarity.',
    'Reflect the article mood and intent, not literal instructional text or UI copy.',
  ]
    .filter(Boolean)
    .join(' ')
}

function toCloudinaryPublicIdSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function generateCoverImageBase64(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const openai = new OpenAI({ apiKey })
  const response = await openai.images.generate({
    model: 'gpt-image-1.5',
    prompt,
    size: '1536x1024',
  })

  const image = response.data?.[0]?.b64_json
  if (!image) {
    throw new Error('No image returned by model')
  }

  return image
}

async function detectCoverArtifacts(imageBase64: string): Promise<{
  reject: boolean
  reason: string
}> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { reject: false, reason: 'OPENAI_API_KEY is not configured' }
  }

  try {
    const openai = new OpenAI({ apiKey })
    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Assess this blog cover for disallowed artifacts.',
                'Reject if there is prominent/focal readable text, title-like wording, obvious UI labels, logos/watermarks, or panel-split collage/triptych.',
                'Allow incidental tiny/blurred screen details that are not focal and not legible at card size.',
                'Respond with strict JSON only: {"reject": boolean, "reason": string}.',
                'Set reject=true only for substantial violations likely noticeable to users.',
              ].join(' '),
            },
            {
              type: 'input_image',
              image_url: `data:image/png;base64,${imageBase64}`,
              detail: 'auto',
            },
          ],
        },
      ],
    })

    const raw = response.output_text?.trim() || ''
    const match = raw.match(/\{[\s\S]*\}/)
    const jsonText = match ? match[0] : raw
    const parsed = JSON.parse(jsonText) as {
      reject?: unknown
      reason?: unknown
    }
    return {
      reject: parsed.reject === true,
      reason:
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : 'artifact detector rejected image',
    }
  } catch {
    // Fail open: artifact detection should not block regeneration pipeline.
    return { reject: false, reason: 'artifact detector unavailable' }
  }
}

function buildCoverRegenerationUpdate(
  page: NotionPage,
  values: {
    coverUrl: string
    attempts: number
    success: boolean
    clearRequest: boolean
    recoveryStatus: 'Queued' | 'Recovered' | 'Needs Human Review'
    failureMessage?: string
    autoRetryReason?: string
    nextSceneArchetype?: string
  },
) {
  const properties: Record<string, unknown> = {}
  const existingHasWinningCover =
    propertyToBoolean(getProperty(page.properties, ['Has Winning Cover'])) ??
    Boolean(values.coverUrl)
  const trySet = (aliases: string[], value: unknown) => {
    const name = findPropertyName(page.properties, aliases)
    if (!name) {
      return
    }
    properties[name] = value
  }

  trySet(['Regenerate Cover Requested'], { checkbox: !values.clearRequest })
  trySet(['Recovery Attempts'], { number: values.attempts })
  trySet(['Recovery Needed'], { checkbox: !values.success })
  trySet(['Cover Image URL'], { url: values.coverUrl || null })
  trySet(['Has Cover URL'], { checkbox: Boolean(values.coverUrl) })
  trySet(['Has Winning Cover'], {
    checkbox: values.success ? true : existingHasWinningCover,
  })
  trySet(['Has Required Metadata'], { checkbox: Boolean(values.coverUrl) })
  if (values.nextSceneArchetype) {
    const archetypeName = findPropertyName(page.properties, [
      'Cover Scene Archetype',
      'Image Scene Archetype',
      'Scene Archetype',
    ])
    if (archetypeName) {
      const archetypeType = page.properties[archetypeName]?.type
      if (archetypeType === 'select') {
        properties[archetypeName] = {
          select: { name: values.nextSceneArchetype },
        }
      } else if (archetypeType === 'status') {
        properties[archetypeName] = {
          status: { name: values.nextSceneArchetype },
        }
      } else if (archetypeType === 'rich_text') {
        properties[archetypeName] = toRichText(values.nextSceneArchetype)
      } else if (archetypeType === 'title') {
        properties[archetypeName] = toTitle(values.nextSceneArchetype)
      }
    }
  }
  const reasonName = findPropertyName(page.properties, [
    'Regenerate Cover Reason',
    'Recovery Reason',
  ])
  // On successful regeneration, clear stale operator-input reason text.
  if (values.success && reasonName) {
    const reasonType = page.properties[reasonName]?.type
    if (reasonType === 'rich_text') {
      properties[reasonName] = { rich_text: [] }
    } else if (reasonType === 'title') {
      properties[reasonName] = { title: [] }
    }
  }
  // On failure, persist an explicit retry reason to improve next attempt quality.
  if (!values.success && values.autoRetryReason && reasonName) {
    const reasonType = page.properties[reasonName]?.type
    if (reasonType === 'rich_text') {
      properties[reasonName] = {
        rich_text: [
          {
            type: 'text',
            text: { content: values.autoRetryReason.slice(0, 1900) },
          },
        ],
      }
    } else if (reasonType === 'title') {
      properties[reasonName] = {
        title: [
          {
            type: 'text',
            text: { content: values.autoRetryReason.slice(0, 1900) },
          },
        ],
      }
    }
  }
  const recoveryStatusName = findPropertyName(page.properties, [
    'Recovery Status',
  ])
  if (recoveryStatusName) {
    const recoveryType = page.properties[recoveryStatusName]?.type
    if (recoveryType === 'status') {
      properties[recoveryStatusName] = {
        status: { name: values.recoveryStatus },
      }
    } else if (recoveryType === 'select') {
      properties[recoveryStatusName] = {
        select: { name: values.recoveryStatus },
      }
    }
  }
  const notesName = findPropertyName(page.properties, [
    'Validation Notes',
    'Revision Notes',
  ])
  if (notesName) {
    const notesType = page.properties[notesName]?.type
    if (values.failureMessage) {
      if (notesType === 'rich_text') {
        properties[notesName] = {
          rich_text: [
            {
              type: 'text',
              text: { content: values.failureMessage.slice(0, 1900) },
            },
          ],
        }
      } else if (notesType === 'title') {
        properties[notesName] = {
          title: [
            {
              type: 'text',
              text: { content: values.failureMessage.slice(0, 1900) },
            },
          ],
        }
      }
    } else if (values.success) {
      // Clear stale failure notes once regeneration succeeds.
      if (notesType === 'rich_text') {
        properties[notesName] = { rich_text: [] }
      } else if (notesType === 'title') {
        properties[notesName] = { title: [] }
      }
    }
  }

  return properties
}

function buildProjectionProperties(
  source: SourceArticle,
  nowIso: string,
  defaultAuthorPageId: string | null,
  searchIndexText?: string,
) {
  const authorPageId = source.authorRelationIds[0] ?? defaultAuthorPageId

  return {
    Title: toTitle(source.title),
    Slug: toRichText(source.slug),
    'Source Article': {
      relation: [{ id: source.id }],
    },
    ...(authorPageId
      ? {
          Author: {
            relation: [{ id: authorPageId }],
          },
        }
      : {}),
    'Content Type': {
      select: { name: 'article' },
    },
    Summary: toRichText(source.summary),
    'Meta Description': toRichText(source.metaDescription || source.summary),
    'Cover Image URL': source.coverImageUrl
      ? { url: source.coverImageUrl }
      : { url: null },
    Keywords: {
      multi_select: source.keywords.map((name) => ({ name })),
    },
    'Topics/Tags': {
      multi_select: source.topics.map((name) => ({ name })),
    },
    Tech: {
      multi_select: source.tech.map((name) => ({ name })),
    },
    'Publish Date': source.publishDate
      ? { date: { start: source.publishDate } }
      : { date: null },
    'Canonical URL': source.liveUrl ? { url: source.liveUrl } : { url: null },
    'Live URL': source.liveUrl ? { url: source.liveUrl } : { url: null },
    Status: {
      select: { name: source.projectionStatus },
    },
    'Sync State': {
      select: { name: 'Synced' },
    },
    'Body Source Mode': {
      select: { name: 'Source Blocks (Canonical)' },
    },
    'Last Synced At': {
      date: { start: nowIso },
    },
    'Hash / Revision Fingerprint': toRichText(source.revisionFingerprint),
    ...(searchIndexText
      ? {
          'Search Index': toRichText(searchIndexText),
          'Search Text': toRichText(searchIndexText),
        }
      : {}),
  }
}

function buildArchivedProjectionProperties(nowIso: string, reason: string) {
  return {
    Status: {
      select: { name: 'Archived' },
    },
    'Sync State': {
      select: { name: 'Synced' },
    },
    'Cleanup State': {
      select: { name: 'Pending' },
    },
    'Cleanup Notes': toRichText(reason),
    'Last Synced At': {
      date: { start: nowIso },
    },
  }
}

function pickKnownProperties(
  properties: Record<string, unknown>,
  knownPropertyNames: Set<string>,
) {
  if (knownPropertyNames.size === 0) {
    return properties
  }

  return Object.fromEntries(
    Object.entries(properties).filter(([name]) => knownPropertyNames.has(name)),
  )
}

function indexTargets(pages: NotionPage[]) {
  const bySourceId = new Map<string, NotionPage>()
  const bySlug = new Map<string, NotionPage>()

  for (const page of pages) {
    const relationIds = propertyToRelationIds(
      getProperty(page.properties, ['Source Article']),
    )
    const slug = toSlug(propertyToText(getProperty(page.properties, ['Slug'])))

    if (relationIds[0] && !bySourceId.has(relationIds[0])) {
      bySourceId.set(relationIds[0], page)
    }

    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, page)
    }
  }

  return { bySourceId, bySlug }
}

async function getSourcePages(pageId?: string): Promise<NotionPage[]> {
  if (pageId) {
    try {
      const page = (await notionGetPage(pageId)) as NotionPage
      return [page]
    } catch (error) {
      const errorCode =
        error instanceof NotionHttpError &&
        error.body &&
        typeof error.body === 'object' &&
        'code' in error.body &&
        typeof (error.body as { code?: unknown }).code === 'string'
          ? (error.body as { code: string }).code
          : null

      if (
        error instanceof NotionHttpError &&
        (error.status === 404 || errorCode === 'object_not_found')
      ) {
        console.warn('[cms:notion] source page not found for projection sync', {
          pageId,
          status: error.status,
          code: errorCode,
        })
        return []
      }

      throw error
    }
  }

  const sourceDataSourceId = getNotionContentDataSourceId()
  return queryAllDataSourcePages(sourceDataSourceId, {})
}

export async function syncPortfolioArticleProjection(options?: {
  pageId?: string
}): Promise<ProjectionSyncResult> {
  const nowIso = new Date().toISOString()
  const errors: Array<{ sourcePageId: string; message: string }> = []
  let created = 0
  let updated = 0
  let archived = 0
  let skipped = 0

  const sourcePages = await getSourcePages(options?.pageId)
  const mapped = sourcePages
    .map(mapSourcePage)
    .filter((entry): entry is SourceArticle => Boolean(entry))
  const mappedById = new Map(mapped.map((source) => [source.id, source]))
  const sourceIds = new Set(sourcePages.map((page) => page.id))

  const targetDataSourceId = getNotionArticlesDataSourceId()
  const targetPages = await queryAllDataSourcePages(targetDataSourceId, {})
  const targetIndex = indexTargets(targetPages)
  const defaultAuthorPageId = getOptionalNotionDefaultAuthorPageId()
  const knownTargetPropertyNames = new Set<string>(
    targetPages[0] ? Object.keys(targetPages[0].properties) : [],
  )

  for (const source of mapped) {
    try {
      const existing =
        targetIndex.bySourceId.get(source.id) ??
        targetIndex.bySlug.get(source.slug)
      let searchIndexText: string | undefined

      if (eligibleForProjection(source)) {
        try {
          const sourceBlocks = await getNotionBlockTree(source.id)
          const flattened = flattenBlockText(sourceBlocks)
          searchIndexText = flattened ? flattened.slice(0, 2000) : undefined
        } catch (error) {
          console.warn('[cms:notion] projection search-index build degraded', {
            sourcePageId: source.id,
            slug: source.slug,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const properties = pickKnownProperties(
        buildProjectionProperties(
          source,
          nowIso,
          defaultAuthorPageId,
          searchIndexText,
        ),
        knownTargetPropertyNames,
      )
      const publishSafe =
        source.sourceStatus.trim().toLowerCase() === 'ready to publish' ||
        source.sourceStatus.trim().toLowerCase() === 'published'

      if (publishSafe) {
        const gateErrors = validatePublishSafeRequirements(
          source,
          defaultAuthorPageId,
        )
        if (gateErrors.length > 0) {
          errors.push({
            sourcePageId: source.id,
            message: gateErrors.join('; '),
          })
          skipped += 1
          continue
        }
      }

      if (!eligibleForProjection(source) && !existing) {
        skipped += 1
        continue
      }

      if (existing) {
        await notionUpdatePage(existing.id, { properties })
        updated += 1
        continue
      }

      await notionCreatePage({
        parent: { data_source_id: targetDataSourceId },
        properties,
      })
      created += 1
    } catch (error) {
      errors.push({
        sourcePageId: source.id,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown projection sync error',
      })
    }
  }

  if (options?.pageId) {
    const sourceMissing = !sourceIds.has(options.pageId)
    const sourceMappable = mappedById.has(options.pageId)

    if (sourceMissing || !sourceMappable) {
      const existing = targetIndex.bySourceId.get(options.pageId)
      if (existing) {
        try {
          const reason = sourceMissing
            ? 'Source article no longer exists or is inaccessible; projection archived pending cleanup.'
            : 'Source article exists but is no longer eligible/mappable for projection; projection archived pending cleanup.'
          const archivedProperties = pickKnownProperties(
            buildArchivedProjectionProperties(nowIso, reason),
            knownTargetPropertyNames,
          )
          await notionUpdatePage(existing.id, {
            properties: archivedProperties,
          })
          archived += 1
        } catch (error) {
          errors.push({
            sourcePageId: options.pageId,
            message:
              error instanceof Error
                ? error.message
                : 'Unknown projection archive error for missing source page',
          })
        }
      }
    }
  } else {
    for (const target of targetPages) {
      const relationIds = propertyToRelationIds(
        getProperty(target.properties, ['Source Article']),
      )
      const sourceId = relationIds[0]

      if (!sourceId) {
        continue
      }

      const sourceExists = sourceIds.has(sourceId)
      const sourceMappable = mappedById.has(sourceId)

      if (sourceExists && sourceMappable) {
        continue
      }

      try {
        const reason = sourceExists
          ? 'Source article exists but is no longer eligible/mappable for projection; projection archived pending cleanup.'
          : 'Source article relation is orphaned (missing/deleted source); projection archived pending cleanup.'
        const archivedProperties = pickKnownProperties(
          buildArchivedProjectionProperties(nowIso, reason),
          knownTargetPropertyNames,
        )
        await notionUpdatePage(target.id, { properties: archivedProperties })
        archived += 1
      } catch (error) {
        errors.push({
          sourcePageId: sourceId,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown projection archive error during full reconcile',
        })
      }
    }
  }

  return {
    ok: errors.length === 0,
    scanned: sourcePages.length,
    eligible: mapped.filter(eligibleForProjection).length,
    created,
    updated,
    archived,
    skipped,
    errors,
  }
}

export async function reconcilePortfolioArticleProjection(): Promise<ProjectionReconcileResult> {
  const findings: ProjectionReconcileFinding[] = []
  const sourceDataSourceId = getNotionContentDataSourceId()
  const targetDataSourceId = getNotionArticlesDataSourceId()
  const calendarDataSourceId = getNotionContentCalendarDataSourceId()

  const [sourcePages, targetPages, calendarPages] = await Promise.all([
    queryAllDataSourcePages(sourceDataSourceId, {}),
    queryAllDataSourcePages(targetDataSourceId, {}),
    queryAllDataSourcePages(calendarDataSourceId, {}),
  ])

  const mapped = sourcePages
    .map(mapSourcePage)
    .filter((entry): entry is SourceArticle => Boolean(entry))
  const mappedById = new Map(mapped.map((source) => [source.id, source]))
  const targetIndex = indexTargets(targetPages)

  for (const source of mapped) {
    const publishSafe =
      source.sourceStatus.trim().toLowerCase() === 'ready to publish' ||
      source.sourceStatus.trim().toLowerCase() === 'published'

    if (!publishSafe) {
      continue
    }

    const target =
      targetIndex.bySourceId.get(source.id) ??
      targetIndex.bySlug.get(source.slug)
    if (!target) {
      findings.push({
        code: 'SOURCE_PUBLISHSAFE_MISSING_TARGET',
        severity: 'critical',
        sourcePageId: source.id,
        slug: source.slug,
        message: `Publish-safe source article has no projected target for slug "${source.slug}"`,
      })
      continue
    }

    const targetStatus = propertyToText(
      getProperty(target.properties, ['Status']),
    )
    if (
      normalizeStatus(targetStatus) !== normalizeStatus(source.projectionStatus)
    ) {
      findings.push({
        code: 'STATUS_MISMATCH',
        severity: 'warning',
        sourcePageId: source.id,
        targetPageId: target.id,
        slug: source.slug,
        message: `Status mismatch for slug "${source.slug}": source=${source.projectionStatus}, target=${targetStatus || 'empty'}`,
      })
    }

    const targetCover = propertyToText(
      getProperty(target.properties, ['Cover Image URL']),
    )
    if ((targetCover || '').trim() !== (source.coverImageUrl || '').trim()) {
      findings.push({
        code: 'COVER_URL_MISMATCH',
        severity: 'warning',
        sourcePageId: source.id,
        targetPageId: target.id,
        slug: source.slug,
        message: `Cover URL mismatch for slug "${source.slug}"`,
      })
    }
  }

  for (const target of targetPages) {
    const sourceId = propertyToRelationIds(
      getProperty(target.properties, ['Source Article']),
    )[0]
    if (!sourceId) {
      continue
    }
    const source = mappedById.get(sourceId)
    const targetStatus = normalizeStatus(
      propertyToText(getProperty(target.properties, ['Status'])),
    )
    const targetIsPublishSafe =
      targetStatus === 'ready to publish' || targetStatus === 'published'
    const sourceIsPublishSafe =
      source &&
      (normalizeStatus(source.sourceStatus) === 'ready to publish' ||
        normalizeStatus(source.sourceStatus) === 'published')

    if (targetIsPublishSafe && !sourceIsPublishSafe) {
      findings.push({
        code: 'TARGET_PUBLISHSAFE_MISSING_SOURCE',
        severity: 'critical',
        targetPageId: target.id,
        sourcePageId: sourceId,
        slug: propertyToText(getProperty(target.properties, ['Slug'])),
        message:
          'Target article is publish-safe but source article is missing or not publish-safe',
      })
    }
  }

  const articleToCalendarRows = new Map<string, string[]>()
  for (const row of calendarPages) {
    const rowStatus = normalizeStatus(
      propertyToText(getProperty(row.properties, ['Status', 'Content Status'])),
    )
    const rowIsPublishSafe =
      rowStatus === 'ready to publish' || rowStatus === 'published'
    const assigned = propertyToRelationIds(
      getProperty(row.properties, ['Assigned Article', 'Article']),
    )

    if (rowIsPublishSafe && assigned.length === 0) {
      findings.push({
        code: 'CALENDAR_MISSING_ASSIGNED_ARTICLE',
        severity: 'warning',
        calendarPageId: row.id,
        message:
          'Publish-safe content calendar row is missing Assigned Article relation',
      })
    }

    if (assigned.length > 1) {
      findings.push({
        code: 'CALENDAR_MULTI_ASSIGNED_ARTICLES',
        severity: 'critical',
        calendarPageId: row.id,
        message: 'Content calendar row has multiple Assigned Article relations',
      })
    }

    for (const articleId of assigned) {
      const rows = articleToCalendarRows.get(articleId) ?? []
      rows.push(row.id)
      articleToCalendarRows.set(articleId, rows)
    }
  }

  for (const [articleId, rows] of articleToCalendarRows.entries()) {
    if (rows.length <= 1) {
      continue
    }
    findings.push({
      code: 'CALENDAR_ARTICLE_MULTI_ROWS',
      severity: 'warning',
      sourcePageId: articleId,
      message: `Single article is assigned to multiple content calendar rows (${rows.length})`,
    })
  }

  return {
    ok: !findings.some((finding) => finding.severity === 'critical'),
    checkedSource: mapped.length,
    checkedTargets: targetPages.length,
    checkedCalendarRows: calendarPages.length,
    findings,
  }
}

export async function evaluateSourceArticlePublishGate(
  sourcePageId: string,
): Promise<SourcePublishGateResult> {
  let sourcePage: NotionPage

  try {
    sourcePage = (await notionGetPage(sourcePageId)) as NotionPage
  } catch (error) {
    return {
      ok: false,
      sourcePageId,
      reasons: [
        error instanceof Error
          ? `Unable to load source page: ${error.message}`
          : 'Unable to load source page',
      ],
    }
  }

  const mapped = mapSourcePage(sourcePage)
  if (!mapped) {
    return {
      ok: false,
      sourcePageId,
      reasons: [
        'Source page is not an eligible Blog Post record for projection',
      ],
    }
  }

  const reasons = validatePublishSafeRequirements(
    mapped,
    getOptionalNotionDefaultAuthorPageId(),
  )

  return {
    ok: reasons.length === 0,
    sourcePageId,
    sourceStatus: mapped.sourceStatus,
    reasons,
  }
}

export async function evaluateSourceArticleQualityGate(options?: {
  sourcePageId?: string
}): Promise<SourceArticleQualityGateResult> {
  const sourcePages = await getSourcePages(options?.sourcePageId)
  const snapshots = sourcePages
    .map(parseQualitySnapshot)
    .filter((entry): entry is SourceArticleQualitySnapshot => Boolean(entry))

  const publishSafe = snapshots.filter((snapshot) =>
    isPublishSafeStatus(snapshot.sourceStatus),
  )

  const failures: SourceArticleQualityFailure[] = []
  for (const snapshot of publishSafe) {
    const reasons = evaluateSourceArticleQualityRequirements(snapshot)
    if (reasons.length > 0) {
      failures.push({
        ...snapshot,
        reasons,
      })
    }
  }

  return {
    ok: failures.length === 0,
    scanned: snapshots.length,
    checkedPublishSafe: publishSafe.length,
    passed: publishSafe.length - failures.length,
    failed: failures.length,
    failures,
  }
}

export async function autoHealSourceArticleQualityGate(options?: {
  sourcePageId?: string
}): Promise<SourceArticleAutoHealResult> {
  const sourcePages = await getSourcePages(options?.sourcePageId)
  const snapshots = sourcePages
    .map(parseQualitySnapshot)
    .filter((entry): entry is SourceArticleQualitySnapshot => Boolean(entry))
  const publishSafePageIds = new Set(
    snapshots
      .filter((snapshot) => isPublishSafeStatus(snapshot.sourceStatus))
      .map((snapshot) => snapshot.sourcePageId),
  )
  const sourcePagesById = new Map(sourcePages.map((page) => [page.id, page]))

  let healed = 0
  let skipped = 0
  const errors: Array<{ sourcePageId: string; message: string }> = []

  for (const snapshot of snapshots) {
    if (!publishSafePageIds.has(snapshot.sourcePageId)) {
      skipped += 1
      continue
    }

    const sourcePage = sourcePagesById.get(snapshot.sourcePageId)
    if (!sourcePage) {
      errors.push({
        sourcePageId: snapshot.sourcePageId,
        message: 'Unable to load source page',
      })
      continue
    }

    try {
      const { mutated, properties } =
        buildSourceQualityAutoHealProperties(sourcePage)
      if (!mutated) {
        skipped += 1
        continue
      }

      await notionUpdatePage(sourcePage.id, { properties })
      healed += 1
    } catch (error) {
      errors.push({
        sourcePageId: sourcePage.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return {
    ok: errors.length === 0,
    scanned: snapshots.length,
    checkedPublishSafe: publishSafePageIds.size,
    healed,
    skipped,
    errors,
  }
}

export async function processCoverRegenerationRequests(options?: {
  sourcePageId?: string
  limit?: number
}): Promise<CoverRegenerationResult> {
  const maxAttempts = 3
  const sourcePages = await getSourcePages(options?.sourcePageId)
  const candidates = sourcePages
    .map(parseCoverRegenerationCandidate)
    .filter((entry): entry is CoverRegenerationCandidate => Boolean(entry))
    .filter(
      (entry) =>
        isPublishSafeStatus(entry.sourceStatus) &&
        entry.regenerateCoverRequested,
    )

  const limit =
    typeof options?.limit === 'number' && options.limit > 0
      ? Math.floor(options.limit)
      : 10
  const queued = candidates.length
  let regenerated = 0
  let skipped = 0
  const errors: Array<{ sourcePageId: string; message: string }> = []

  for (const candidate of candidates.slice(0, limit)) {
    try {
      const prompt = buildCoverPrompt(candidate)
      let imageBase64 = await generateCoverImageBase64(prompt)
      const firstPassDetection = await detectCoverArtifacts(imageBase64)

      if (firstPassDetection.reject) {
        const rotatedArchetypeKey = rotateSceneArchetype(
          candidate.coverSceneArchetype ||
            resolveDefaultCoverSceneArchetype(candidate.articleType),
        )
        const retryPrompt = `${buildCoverPrompt(candidate, {
          preferNonWorkbench: true,
          forcedSceneArchetypeKey: rotatedArchetypeKey,
        })} ${COVER_RETRY_SUFFIX}`
        imageBase64 = await generateCoverImageBase64(retryPrompt)
        const secondPassDetection = await detectCoverArtifacts(imageBase64)
        if (secondPassDetection.reject) {
          throw new Error(
            `Regenerated cover rejected by quality gate: ${secondPassDetection.reason}`,
          )
        }
      }

      const slugSegment = toCloudinaryPublicIdSegment(
        candidate.slug || candidate.sourcePageId,
      )
      const publicId = `${slugSegment}/cover-${Date.now()}`
      const { url } = await uploadBase64PngToCloudinary({
        base64Png: imageBase64,
        publicId,
      })

      const attempts = candidate.recoveryAttempts + 1
      const properties = buildCoverRegenerationUpdate(candidate.sourcePage, {
        coverUrl: url,
        attempts,
        success: true,
        clearRequest: true,
        recoveryStatus: 'Recovered',
      })

      await notionUpdatePage(candidate.sourcePageId, { properties })
      try {
        await syncPortfolioArticleProjection({ pageId: candidate.sourcePageId })
      } catch (syncError) {
        errors.push({
          sourcePageId: candidate.sourcePageId,
          message:
            syncError instanceof Error
              ? `Cover regenerated but projection sync failed: ${syncError.message}`
              : 'Cover regenerated but projection sync failed',
        })
      }
      regenerated += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({
        sourcePageId: candidate.sourcePageId,
        message,
      })
      const attempts = candidate.recoveryAttempts + 1
      const autoRetryReason = `Auto retry: quality gate flagged "${message}". Keep a single coherent photoreal scene, avoid prominent/focal readable text, and avoid tiny-people or micro-scene compositions.`
      const nextSceneArchetypeKey = rotateSceneArchetype(
        candidate.coverSceneArchetype ||
          resolveDefaultCoverSceneArchetype(candidate.articleType),
      )
      const nextSceneArchetypeName =
        nextSceneArchetypeKey === 'conceptualsystem'
          ? 'Conceptual System'
          : nextSceneArchetypeKey === 'abstractworkflow'
            ? 'Abstract Workflow'
            : nextSceneArchetypeKey === 'workbench'
              ? 'Workbench'
              : nextSceneArchetypeKey === 'architecturalinfra'
                ? 'Architectural/Infra'
                : 'Human Moment'
      try {
        const clearRequest = attempts >= maxAttempts
        const properties = buildCoverRegenerationUpdate(candidate.sourcePage, {
          coverUrl: candidate.coverImageUrl,
          attempts,
          success: false,
          clearRequest,
          recoveryStatus: clearRequest ? 'Needs Human Review' : 'Queued',
          failureMessage: `Cover regeneration failed: ${message}`,
          autoRetryReason,
          nextSceneArchetype: clearRequest ? undefined : nextSceneArchetypeName,
        })
        await notionUpdatePage(candidate.sourcePageId, { properties })
      } catch (nestedError) {
        errors.push({
          sourcePageId: candidate.sourcePageId,
          message:
            nestedError instanceof Error
              ? `Failed to mark regeneration failure: ${nestedError.message}`
              : 'Failed to mark regeneration failure',
        })
      }
    }
  }

  if (candidates.length > limit) {
    skipped += candidates.length - limit
  }

  return {
    ok: errors.length === 0,
    scanned: sourcePages.length,
    queued,
    regenerated,
    skipped,
    errors,
  }
}
