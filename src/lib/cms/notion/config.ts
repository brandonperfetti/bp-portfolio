import { parseDataSourceId } from '@/lib/cms/notion/client'

const DEFAULT_CONTENT_DATA_SOURCE_ID = '221be01e-1e06-8089-99b0-000b6415ee9e'
const DEFAULT_CONTENT_CALENDAR_DATA_SOURCE_ID = '30abe01e-1e06-8192-b1b6-000b38ccbd62'

export function getNotionArticlesDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_ARTICLES_DATA_SOURCE,
    'NOTION_CMS_ARTICLES_DATA_SOURCE',
  )
}

export function getNotionPagesDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_PAGES_DATA_SOURCE,
    'NOTION_CMS_PAGES_DATA_SOURCE',
  )
}

export function getNotionProjectsDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_PROJECTS_DATA_SOURCE,
    'NOTION_CMS_PROJECTS_DATA_SOURCE',
  )
}

export function getNotionTechDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_TECH_DATA_SOURCE,
    'NOTION_CMS_TECH_DATA_SOURCE',
  )
}

export function getNotionUsesDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_USES_DATA_SOURCE,
    'NOTION_CMS_USES_DATA_SOURCE',
  )
}

export function getNotionSiteSettingsDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_SITE_SETTINGS_DATA_SOURCE,
    'NOTION_CMS_SITE_SETTINGS_DATA_SOURCE',
  )
}

export function getNotionRouteRegistryDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_ROUTE_REGISTRY_DATA_SOURCE,
    'NOTION_CMS_ROUTE_REGISTRY_DATA_SOURCE',
  )
}

export function getNotionWorkHistoryDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CMS_WORK_HISTORY_DATA_SOURCE,
    'NOTION_CMS_WORK_HISTORY_DATA_SOURCE',
  )
}

export function getOptionalNotionAuthorsDataSourceId() {
  const raw = process.env.NOTION_CMS_AUTHORS_DATA_SOURCE
  if (!raw) {
    return null
  }

  return parseDataSourceId(raw, 'NOTION_CMS_AUTHORS_DATA_SOURCE')
}

export function getOptionalNotionDefaultAuthorPageId() {
  const raw = process.env.NOTION_CMS_DEFAULT_AUTHOR_PAGE_ID?.trim()
  if (!raw) {
    return null
  }

  const uuidMatch = raw.match(/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/)
  if (!uuidMatch) {
    return raw
  }

  const normalized = uuidMatch[0].replace(/-/g, '')
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
}

export function getNotionContentDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CONTENT_DB_DATA_SOURCE ?? DEFAULT_CONTENT_DATA_SOURCE_ID,
    'NOTION_CONTENT_DB_DATA_SOURCE',
  )
}

export function getNotionContentCalendarDataSourceId() {
  return parseDataSourceId(
    process.env.NOTION_CONTENT_CALENDAR_DATA_SOURCE ??
      DEFAULT_CONTENT_CALENDAR_DATA_SOURCE_ID,
    'NOTION_CONTENT_CALENDAR_DATA_SOURCE',
  )
}

export function getOptionalNotionWebhookEventsDataSourceId() {
  const raw = process.env.NOTION_CMS_WEBHOOK_EVENTS_DATA_SOURCE
  if (!raw) {
    return null
  }

  return parseDataSourceId(raw, 'NOTION_CMS_WEBHOOK_EVENTS_DATA_SOURCE')
}
