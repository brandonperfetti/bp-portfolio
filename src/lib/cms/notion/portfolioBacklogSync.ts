import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { NotionPage } from '@/lib/cms/notion/contracts'
import { getOptionalNotionPortfolioBacklogDataSourceId } from '@/lib/cms/notion/config'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import {
  getProperty,
  propertyToMultiSelect,
  propertyToText,
} from '@/lib/cms/notion/property'

const DEFAULT_BACKLOG_DOC_PATH = 'docs/PORTFOLIO_BACKLOG_TODOS.md'
const DONE_STATUS_KEYS = new Set([
  'done',
  'completed',
  'complete',
  'closed',
  'cancelled',
  'canceled',
  'archived',
])

type PortfolioBacklogItem = {
  title: string
  priority: string
  area: string
  notionUrl: string
  codeTouchpoints: string[]
}

export type PortfolioBacklogSyncResult = {
  ok: boolean
  enabled: boolean
  scanned: number
  active: number
  outputPath: string
  wroteFile: boolean
  errors: string[]
}

function normalized(value: string) {
  return value.trim().toLowerCase()
}

function parseCodeTouchpoints(value: string) {
  return value
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isActiveBacklogPage(page: NotionPage) {
  const status = normalized(
    propertyToText(getProperty(page.properties, ['Status', 'State'])),
  )

  if (!status) {
    return true
  }

  if (DONE_STATUS_KEYS.has(status)) {
    return false
  }

  if (status.includes('done') || status.includes('cancel')) {
    return false
  }

  return true
}

function toPriorityRank(value: string) {
  const match = value.match(/p\s*([0-9]+)/i)
  if (match?.[1]) {
    return Number(match[1])
  }
  return 99
}

function mapBacklogPage(page: NotionPage): PortfolioBacklogItem | null {
  const title =
    propertyToText(getProperty(page.properties, ['Task', 'Title', 'Name'])) ||
    'Untitled backlog item'
  const priority =
    propertyToText(getProperty(page.properties, ['Priority'])) || 'P3'
  const area =
    propertyToText(
      getProperty(page.properties, ['Area', 'Category', 'Type']),
    ) || 'Infra'

  const touchpoints = [
    ...parseCodeTouchpoints(
      propertyToText(
        getProperty(page.properties, [
          'Code Touchpoints',
          'Code touchpoints',
          'Touchpoints',
        ]),
      ),
    ),
    ...propertyToMultiSelect(
      getProperty(page.properties, ['Code Touchpoints', 'Code touchpoints']),
    ),
  ]

  const dedupedTouchpoints = Array.from(new Set(touchpoints))
  const notionUrl = page.url?.trim()
  if (!notionUrl) {
    return null
  }

  return {
    title: title.trim(),
    priority: priority.trim(),
    area: area.trim(),
    notionUrl,
    codeTouchpoints: dedupedTouchpoints,
  }
}

function renderBacklogMarkdown(items: PortfolioBacklogItem[]) {
  const lines: string[] = [
    '# Portfolio Backlog TODO Index',
    '',
    'Source of truth: Notion "Portfolio Engineering Backlog" database.  ',
    'Purpose: keep one codebase-visible TODO entry per active backlog item so work can be picked up without context loss.',
    '',
    '## Active Backlog',
    '',
  ]

  if (items.length === 0) {
    lines.push(
      '- _No active backlog items found in Notion. Keep this file synced from Notion before release._',
    )
    lines.push('')
    return `${lines.join('\n')}\n`
  }

  for (const item of items) {
    const touchpointText =
      item.codeTouchpoints.length > 0
        ? item.codeTouchpoints.map((entry) => `\`${entry}\``).join(', ')
        : '_TBD in Notion_'

    lines.push(`- [ ] **${item.priority} · ${item.area}** ${item.title}  `)
    lines.push(`      Notion: [${item.title}](${item.notionUrl})  `)
    lines.push(`      Code touchpoints: ${touchpointText}`)
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

/**
 * Pulls active Portfolio Engineering Backlog items from Notion and renders the
 * codebase TODO index markdown.
 *
 * @param options.writeFile When true, writes `docs/PORTFOLIO_BACKLOG_TODOS.md`.
 * @param options.outputPath Optional override for destination markdown path.
 * @returns Sync summary including active item count and write status.
 *
 * Side effects:
 * - Performs Notion API reads.
 * - Optionally writes a local markdown file.
 */
export async function runPortfolioBacklogSync(options?: {
  writeFile?: boolean
  outputPath?: string
}): Promise<PortfolioBacklogSyncResult> {
  // TODO(portfolio-backlog): automate this sync via CI/cron once manual flow is validated.
  const outputPath = options?.outputPath ?? DEFAULT_BACKLOG_DOC_PATH
  const errors: string[] = []
  const dataSourceId = getOptionalNotionPortfolioBacklogDataSourceId()
  if (!dataSourceId) {
    return {
      ok: true,
      enabled: false,
      scanned: 0,
      active: 0,
      outputPath,
      wroteFile: false,
      errors,
    }
  }

  let pages: NotionPage[] = []
  let activeItems: PortfolioBacklogItem[] = []
  try {
    pages = await queryAllDataSourcePages(dataSourceId, {})
    activeItems = pages
      .filter((page) => !page.archived && !page.in_trash)
      .filter(isActiveBacklogPage)
      .map(mapBacklogPage)
      .filter((item): item is PortfolioBacklogItem => Boolean(item))
      .sort((a, b) => {
        const byPriority =
          toPriorityRank(a.priority) - toPriorityRank(b.priority)
        if (byPriority !== 0) {
          return byPriority
        }
        return a.title.localeCompare(b.title)
      })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(`queryAllDataSourcePages failed: ${message}`)
  }

  const markdown = renderBacklogMarkdown(activeItems)
  let wroteFile = false
  if (options?.writeFile) {
    try {
      const absoluteOutputPath = path.resolve(process.cwd(), outputPath)
      await mkdir(path.dirname(absoluteOutputPath), { recursive: true })
      await writeFile(absoluteOutputPath, markdown, 'utf8')
      wroteFile = true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`writeFile failed: ${message}`)
    }
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    scanned: pages.length,
    active: activeItems.length,
    outputPath,
    wroteFile,
    errors,
  }
}
