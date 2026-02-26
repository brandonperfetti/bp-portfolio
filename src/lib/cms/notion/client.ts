import { NotionConfigError, NotionHttpError } from '@/lib/cms/notion/errors'

const NOTION_BASE_URL = 'https://api.notion.com/v1'
const DEFAULT_NOTION_VERSION = '2025-09-03'

type NotionRequestOptions = {
  method: 'GET' | 'POST' | 'PATCH'
  body?: Record<string, unknown>
  maxRetries?: number
}

type NotionConfig = {
  apiToken: string
  notionVersion: string
}

let cachedConfig: NotionConfig | null = null

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfter(headers: Headers): number | null {
  const value = headers.get('retry-after')
  if (!value) {
    return null
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds
  }

  const date = Date.parse(value)
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000))
  }

  return null
}

function resolveMaxRetryAfterSeconds() {
  const raw = process.env.NOTION_MAX_RETRY_AFTER_SECONDS
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed
  }

  return process.env.NODE_ENV === 'production' ? 60 : 10
}

function shouldRetry(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function computeBackoffMs(attempt: number, retryAfterSeconds: number | null) {
  if (retryAfterSeconds !== null) {
    const maxRetryAfterSeconds = resolveMaxRetryAfterSeconds()
    const clampedRetryAfter = Math.min(retryAfterSeconds, maxRetryAfterSeconds)
    return clampedRetryAfter * 1000
  }

  const base = Math.min(16000, 500 * 2 ** attempt)
  const jitter = Math.floor(Math.random() * 250)
  return base + jitter
}

function ensureNotionConfig(): NotionConfig {
  if (cachedConfig) {
    return cachedConfig
  }

  const apiToken = process.env.NOTION_API_TOKEN
  const notionVersion = process.env.NOTION_API_VERSION ?? DEFAULT_NOTION_VERSION

  if (!apiToken) {
    throw new NotionConfigError(
      'NOTION_API_TOKEN is required when CMS_PROVIDER=notion',
    )
  }

  if (notionVersion !== DEFAULT_NOTION_VERSION) {
    console.warn('[cms:notion] Unexpected API version configured', {
      configured: notionVersion,
      expected: DEFAULT_NOTION_VERSION,
    })
  }

  cachedConfig = {
    apiToken,
    notionVersion,
  }

  return cachedConfig
}

export function parseDataSourceId(value: string | undefined, envName: string) {
  if (!value) {
    throw new NotionConfigError(`${envName} is required when CMS_PROVIDER=notion`)
  }

  return value.startsWith('collection://') ? value.slice('collection://'.length) : value
}

export async function notionRequest<T>(
  path: string,
  options: NotionRequestOptions,
): Promise<T> {
  const config = ensureNotionConfig()
  const maxRetries = options.maxRetries ?? 5

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(`${NOTION_BASE_URL}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Notion-Version': config.notionVersion,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    })

    if (response.ok) {
      return (await response.json()) as T
    }

    const retryAfterSeconds = parseRetryAfter(response.headers)
    const body = await response.json().catch(() => null)

    if (attempt < maxRetries && shouldRetry(response.status)) {
      const waitMs = computeBackoffMs(attempt, retryAfterSeconds)
      const maxRetryAfterSeconds = resolveMaxRetryAfterSeconds()
      console.warn('[cms:notion] request retry', {
        path,
        status: response.status,
        attempt,
        retryAfterSeconds,
        clampedRetryAfterSeconds:
          retryAfterSeconds !== null
            ? Math.min(retryAfterSeconds, maxRetryAfterSeconds)
            : null,
        waitMs,
      })
      await sleep(waitMs)
      continue
    }

    throw new NotionHttpError(
      `Notion request failed (${response.status}) for ${path}`,
      response.status,
      {
        retryAfterSeconds,
        body,
      },
    )
  }

  throw new NotionHttpError(`Notion request failed for ${path}`, 500)
}

export async function notionGetPage(pageId: string) {
  return notionRequest(`/pages/${pageId}`, { method: 'GET' })
}

export async function notionCreatePage(body: Record<string, unknown>) {
  return notionRequest('/pages', { method: 'POST', body })
}

export async function notionUpdatePage(pageId: string, body: Record<string, unknown>) {
  return notionRequest(`/pages/${pageId}`, { method: 'PATCH', body })
}

export async function notionGetDataSource(dataSourceId: string) {
  return notionRequest(`/data_sources/${dataSourceId}`, { method: 'GET' })
}
