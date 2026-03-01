import OpenAI from 'openai'

import { notionCreatePage, notionGetDataSource } from '@/lib/cms/notion/client'
import { getNotionContentCalendarDataSourceId } from '@/lib/cms/notion/config'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import {
  getProperty,
  propertyToDate,
  propertyToText,
} from '@/lib/cms/notion/property'

type CalendarSeedingIssue = {
  step: string
  message: string
  details?: unknown
}

type CalendarSeedIdea = {
  title: string
  contentPillar: string
  hookStrategy: string
  notes: string
  targetAudience: string[]
  technologyDependencies: string[]
}

type CalendarSeedingSummary = {
  ok: boolean
  enabled: boolean
  dryRun: boolean
  startedAt: string
  generated: number
  accepted: number
  created: number
  skippedAsDuplicate: number
  errors: CalendarSeedingIssue[]
  preview: Array<{
    title: string
    publishDate: string
    contentPillar: string
    hookStrategy: string
  }>
}

type NotionPropertyShape = {
  type?: string
  name?: string
  options?: Array<{ name?: string }>
}

type NotionDataSourceShape = {
  properties?: Record<string, NotionPropertyShape>
}

type CalendarSchema = {
  dataSourceId: string
  titlePropertyName: string
  propertyTypesByName: Map<string, string>
  optionsByPropertyName: Map<string, string[]>
}

const MAX_NOTE_LENGTH = 1800
const BRAND_PILLARS = [
  'Mindset',
  'Software',
  'Design',
  'Leadership',
  'Product Execution',
] as const

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findPropertyName(schema: CalendarSchema, aliases: string[]) {
  const names = Array.from(schema.propertyTypesByName.keys())
  for (const alias of aliases) {
    const key = normalized(alias)
    const found = names.find((name) => normalized(name) === key)
    if (found) return found
  }
  return null
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (!value) return defaultValue
  const normalizedValue = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) return true
  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) return false
  return defaultValue
}

function parseNumberEnv(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
) {
  const parsed = value ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function resolveSeedingConfig() {
  return {
    enabled: parseBooleanEnv(process.env.CALENDAR_SEEDING_ENABLED, true),
    dryRun: parseBooleanEnv(process.env.CALENDAR_SEEDING_DRY_RUN, false),
    model: process.env.CALENDAR_SEEDING_MODEL?.trim() || 'gpt-5-mini',
    ideaCount: parseNumberEnv(process.env.CALENDAR_SEEDING_COUNT, 5, 1, 15),
    cadenceDays: parseNumberEnv(
      process.env.CALENDAR_SEEDING_CADENCE_DAYS,
      7,
      1,
      30,
    ),
    maxContextRows: parseNumberEnv(
      process.env.CALENDAR_SEEDING_MAX_CONTEXT_ROWS,
      80,
      20,
      300,
    ),
    pillarLookbackRows: parseNumberEnv(
      process.env.CALENDAR_SEEDING_PILLAR_LOOKBACK_ROWS,
      10,
      5,
      100,
    ),
    maxPillarSharePercent: parseNumberEnv(
      process.env.CALENDAR_SEEDING_MAX_PILLAR_SHARE_PERCENT,
      40,
      20,
      100,
    ),
  }
}

function normalizeTitleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
}

function tokenize(value: string) {
  return normalizeTitleKey(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2)
}

function similarityScore(a: string, b: string) {
  const tokensA = new Set(tokenize(a))
  const tokensB = new Set(tokenize(b))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1
  }
  return intersection / Math.min(tokensA.size, tokensB.size)
}

function isNearDuplicateTitle(title: string, existingTitles: string[]) {
  const key = normalizeTitleKey(title)
  if (!key) return true
  for (const existing of existingTitles) {
    const existingKey = normalizeTitleKey(existing)
    if (!existingKey) continue
    if (existingKey === key) return true
    if (existingKey.includes(key) || key.includes(existingKey)) return true
    if (similarityScore(existingKey, key) >= 0.8) return true
  }
  return false
}

function coerceMultiSelect(
  values: string[],
  allowedOptions: string[],
  fallback: string,
) {
  const allowed = new Set(allowedOptions.map((option) => normalized(option)))
  const filtered = values.filter((value) => allowed.has(normalized(value)))
  if (filtered.length > 0) return filtered
  return allowedOptions.includes(fallback) ? [fallback] : []
}

function coerceSelect(
  value: string,
  allowedOptions: string[],
  fallback: string,
) {
  const selected = allowedOptions.find(
    (option) => normalized(option) === normalized(value || ''),
  )
  if (selected) return selected
  return allowedOptions.includes(fallback) ? fallback : allowedOptions[0] || ''
}

async function loadCalendarSchema(
  dataSourceId: string,
): Promise<CalendarSchema> {
  const response = (await notionGetDataSource(
    dataSourceId,
  )) as NotionDataSourceShape
  const propertyTypesByName = new Map<string, string>()
  const optionsByPropertyName = new Map<string, string[]>()
  let titlePropertyName = 'Topic/Title'

  for (const [name, prop] of Object.entries(response.properties ?? {})) {
    const type = prop?.type ?? ''
    propertyTypesByName.set(name, type)
    if (type === 'title') {
      titlePropertyName = name
    }
    const options = Array.isArray(prop?.options)
      ? prop.options
          .map((option) => option.name?.trim() || '')
          .filter((option): option is string => option.length > 0)
      : []
    if (options.length > 0) {
      optionsByPropertyName.set(name, options)
    }
  }

  return {
    dataSourceId,
    titlePropertyName,
    propertyTypesByName,
    optionsByPropertyName,
  }
}

function getPropertyOptions(schema: CalendarSchema, aliases: string[]) {
  const name = findPropertyName(schema, aliases)
  if (!name) return { name: null, options: [] as string[] }
  return {
    name,
    options: schema.optionsByPropertyName.get(name) ?? [],
  }
}

function buildPrompt(args: {
  count: number
  existingTitles: string[]
  contentPillars: string[]
  pillarPriorityOrder: string[]
  pillarCoverageSnapshot: Record<string, number>
  maxPillarSharePercent: number
  hookStrategies: string[]
  targetAudience: string[]
  dependencies: string[]
}) {
  const existingSample = args.existingTitles.slice(0, 80)
  return [
    `Generate ${args.count} new blog post ideas for a technical content calendar.`,
    'Return strict JSON with shape: {"ideas":[{"title":"...","contentPillar":"...","hookStrategy":"...","notes":"...","targetAudience":["..."],"technologyDependencies":["..."]}]}.',
    'Requirements:',
    '- Title must be specific, practical, and not clickbait.',
    '- Keep notes concise and include inspiration angle + primary goal context.',
    '- Avoid duplicates or near-duplicates against existing titles.',
    `Allowed hookStrategy values: ${args.hookStrategies.join(', ') || 'Problem/Solution'}.`,
    `Allowed contentPillar values: ${args.contentPillars.join(', ') || 'Software'}.`,
    `Recent pillar coverage counts (oldest window): ${
      Object.entries(args.pillarCoverageSnapshot)
        .map(([pillar, count]) => `${pillar}:${count}`)
        .join(', ') || 'none'
    }.`,
    `Bias toward underrepresented pillars in this order: ${args.pillarPriorityOrder.join(', ') || 'Software'}.`,
    `Do not let one pillar exceed ${args.maxPillarSharePercent}% of this generated batch unless unavoidable.`,
    `Allowed targetAudience values: ${args.targetAudience.join(', ') || 'Tech Workers'}.`,
    `Allowed technologyDependencies values: ${args.dependencies.join(', ') || 'None - Timeless'}.`,
    `Existing titles to avoid: ${existingSample.join(' | ') || 'None provided'}.`,
  ].join(' ')
}

async function generateIdeas(args: {
  model: string
  count: number
  existingTitles: string[]
  contentPillars: string[]
  pillarPriorityOrder: string[]
  pillarCoverageSnapshot: Record<string, number>
  maxPillarSharePercent: number
  hookStrategies: string[]
  targetAudience: string[]
  dependencies: string[]
}): Promise<CalendarSeedIdea[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const openai = new OpenAI({ apiKey })
  const response = await openai.responses.create({
    model: args.model,
    input: buildPrompt(args),
  })

  const raw = response.output_text?.trim() ?? ''
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    const json = match ? match[0] : raw
    const parsed = JSON.parse(json) as { ideas?: CalendarSeedIdea[] }
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : []
    return ideas
  } catch (error) {
    const outputSample = raw
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
    console.warn('[cms:calendar-seeding] failed to parse model output', {
      error: error instanceof Error ? error.message : String(error),
      outputSample,
    })
    return []
  }
}

function nextDateIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function resolveInitialScheduleDate(
  existingPublishDates: string[],
  cadenceDays: number,
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const latestExisting = existingPublishDates
    .map((date) => Date.parse(date))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => b - a)[0]

  if (Number.isFinite(latestExisting)) {
    const base = new Date(latestExisting)
    base.setDate(base.getDate() + cadenceDays)
    if (base.getTime() < today.getTime()) {
      return today
    }
    return base
  }

  const start = new Date(today)
  start.setDate(start.getDate() + cadenceDays)
  return start
}

function buildCalendarPageProperties(
  schema: CalendarSchema,
  idea: CalendarSeedIdea,
  publishDateIso: string,
) {
  const properties: Record<string, unknown> = {}

  properties[schema.titlePropertyName] = {
    title: [{ type: 'text', text: { content: idea.title.slice(0, 180) } }],
  }

  const statusName = findPropertyName(schema, ['Status'])
  const contentTypeName = findPropertyName(schema, ['Content Type'])
  const publishDateName = findPropertyName(schema, ['Publish Date'])
  const notesName = findPropertyName(schema, ['Notes'])
  const hookName = findPropertyName(schema, ['Hook Strategy'])
  const pillarName = findPropertyName(schema, ['Content Pillar', 'Pillar'])
  const audienceName = findPropertyName(schema, ['Target Audience'])
  const depsName = findPropertyName(schema, ['Technology Dependencies'])
  const priorityName = findPropertyName(schema, ['Agent Priority'])

  if (statusName) properties[statusName] = { select: { name: 'Planned' } }
  if (contentTypeName) {
    properties[contentTypeName] = { select: { name: 'Blog Post' } }
  }
  if (publishDateName) {
    properties[publishDateName] = { date: { start: publishDateIso } }
  }
  if (notesName) {
    properties[notesName] = {
      rich_text: [
        {
          type: 'text',
          text: { content: idea.notes.slice(0, MAX_NOTE_LENGTH) },
        },
      ],
    }
  }
  if (hookName && idea.hookStrategy) {
    properties[hookName] = { select: { name: idea.hookStrategy } }
  }
  if (pillarName && idea.contentPillar) {
    properties[pillarName] = { select: { name: idea.contentPillar } }
  }
  if (audienceName) {
    properties[audienceName] = {
      multi_select: idea.targetAudience.map((name) => ({ name })),
    }
  }
  if (depsName) {
    properties[depsName] = {
      multi_select: idea.technologyDependencies.map((name) => ({ name })),
    }
  }
  if (priorityName) {
    properties[priorityName] = { select: { name: '3 - Medium' } }
  }

  return properties
}

export async function runCalendarIdeaSeedingCron(options?: {
  dryRun?: boolean
}): Promise<CalendarSeedingSummary> {
  const startedAt = new Date().toISOString()
  const baseConfig = resolveSeedingConfig()
  const config = {
    ...baseConfig,
    dryRun: options?.dryRun ?? baseConfig.dryRun,
  }
  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
      dryRun: config.dryRun,
      startedAt,
      generated: 0,
      accepted: 0,
      created: 0,
      skippedAsDuplicate: 0,
      errors: [],
      preview: [],
    }
  }

  const errors: CalendarSeedingIssue[] = []
  const preview: Array<{
    title: string
    publishDate: string
    contentPillar: string
    hookStrategy: string
  }> = []

  try {
    const dataSourceId = getNotionContentCalendarDataSourceId()
    const schema = await loadCalendarSchema(dataSourceId)
    const existingRows = await queryAllDataSourcePages(dataSourceId, {
      sorts: [{ property: 'Publish Date', direction: 'descending' }],
    })
    const scopedRows = existingRows.slice(0, config.maxContextRows)
    const pillarLookbackRows = scopedRows.slice(0, config.pillarLookbackRows)

    const existingTitles = scopedRows
      .map((row) =>
        propertyToText(getProperty(row.properties, ['Topic/Title', 'Name'])),
      )
      .filter((title): title is string => Boolean(title))
    const existingDates = scopedRows
      .map((row) =>
        propertyToDate(getProperty(row.properties, ['Publish Date'])),
      )
      .filter((date): date is string => Boolean(date))

    const existingPillars = pillarLookbackRows
      .map((row) =>
        propertyToText(
          getProperty(row.properties, ['Content Pillar', 'Pillar']),
        ),
      )
      .filter((pillar): pillar is string => Boolean(pillar))

    const { options: hookOptions } = getPropertyOptions(schema, [
      'Hook Strategy',
    ])
    const { options: contentPillarOptionsRaw } = getPropertyOptions(schema, [
      'Content Pillar',
      'Pillar',
    ])
    const contentPillarOptions =
      contentPillarOptionsRaw.length > 0
        ? contentPillarOptionsRaw
        : [...BRAND_PILLARS]
    const { options: audienceOptions } = getPropertyOptions(schema, [
      'Target Audience',
    ])
    const { options: dependencyOptions } = getPropertyOptions(schema, [
      'Technology Dependencies',
    ])

    const pillarCoverageSnapshot = Object.fromEntries(
      contentPillarOptions.map((option) => [
        option,
        existingPillars.filter(
          (pillar) => normalized(pillar) === normalized(option),
        ).length,
      ]),
    )
    const pillarPriorityOrder = contentPillarOptions
      .slice()
      .sort(
        (a, b) =>
          (pillarCoverageSnapshot[a] ?? 0) - (pillarCoverageSnapshot[b] ?? 0),
      )

    const ideas = await generateIdeas({
      model: config.model,
      count: config.ideaCount,
      existingTitles,
      contentPillars: contentPillarOptions,
      pillarPriorityOrder,
      pillarCoverageSnapshot,
      maxPillarSharePercent: config.maxPillarSharePercent,
      hookStrategies: hookOptions,
      targetAudience: audienceOptions,
      dependencies: dependencyOptions,
    })

    const accepted: CalendarSeedIdea[] = []
    const titleAccumulator = [...existingTitles]
    const candidateIdeas: CalendarSeedIdea[] = []
    const seededPillarCounts = new Map<string, number>()
    const maxPillarCount = Math.max(
      1,
      Math.ceil((config.ideaCount * config.maxPillarSharePercent) / 100),
    )

    for (const idea of ideas) {
      const title = idea.title?.trim() || ''
      if (!title || isNearDuplicateTitle(title, titleAccumulator)) {
        continue
      }

      const contentPillar = coerceSelect(
        idea.contentPillar || '',
        contentPillarOptions,
        pillarPriorityOrder[0] || contentPillarOptions[0] || 'Software',
      )
      const normalizedIdea: CalendarSeedIdea = {
        title,
        contentPillar,
        hookStrategy:
          hookOptions.find(
            (option) =>
              normalized(option) === normalized(idea.hookStrategy || ''),
          ) ||
          hookOptions[0] ||
          'Problem/Solution',
        notes:
          (idea.notes || '').trim() || 'Seeded by calendar cron automation.',
        targetAudience: coerceMultiSelect(
          Array.isArray(idea.targetAudience) ? idea.targetAudience : [],
          audienceOptions,
          'Tech Workers',
        ),
        technologyDependencies: coerceMultiSelect(
          Array.isArray(idea.technologyDependencies)
            ? idea.technologyDependencies
            : [],
          dependencyOptions,
          'None - Timeless',
        ),
      }

      candidateIdeas.push(normalizedIdea)
      titleAccumulator.push(title)
      if (candidateIdeas.length >= config.ideaCount * 3) break
    }

    for (const idea of candidateIdeas) {
      const normalizedPillar = normalized(idea.contentPillar)
      const existingCountForPillar =
        seededPillarCounts.get(normalizedPillar) ?? 0
      if (existingCountForPillar >= maxPillarCount) {
        continue
      }
      accepted.push(idea)
      seededPillarCounts.set(normalizedPillar, existingCountForPillar + 1)
      if (accepted.length >= config.ideaCount) break
    }

    // Fallback fill: avoid under-producing rows if the model returns one dominant
    // pillar; keep diversity as a preference, not a hard blocker.
    if (accepted.length < config.ideaCount) {
      for (const idea of candidateIdeas) {
        if (accepted.some((entry) => entry.title === idea.title)) {
          continue
        }
        accepted.push(idea)
        if (accepted.length >= config.ideaCount) break
      }
    }

    let created = 0
    const startDate = resolveInitialScheduleDate(
      existingDates,
      config.cadenceDays,
    )

    for (let index = 0; index < accepted.length; index += 1) {
      const idea = accepted[index]
      const publishDate = new Date(startDate)
      publishDate.setDate(startDate.getDate() + config.cadenceDays * index)
      const publishDateIso = nextDateIso(publishDate)

      preview.push({
        title: idea.title,
        publishDate: publishDateIso,
        contentPillar: idea.contentPillar,
        hookStrategy: idea.hookStrategy,
      })

      if (config.dryRun) continue

      await notionCreatePage({
        parent: { data_source_id: schema.dataSourceId },
        properties: buildCalendarPageProperties(schema, idea, publishDateIso),
      })
      created += 1
    }

    return {
      ok: errors.length === 0,
      enabled: true,
      dryRun: config.dryRun,
      startedAt,
      generated: ideas.length,
      accepted: accepted.length,
      created,
      skippedAsDuplicate: Math.max(0, ideas.length - accepted.length),
      errors,
      preview,
    }
  } catch (error) {
    errors.push({
      step: 'calendar-idea-seeding',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return {
      ok: false,
      enabled: true,
      dryRun: config.dryRun,
      startedAt,
      generated: 0,
      accepted: 0,
      created: 0,
      skippedAsDuplicate: 0,
      errors,
      preview,
    }
  }
}
