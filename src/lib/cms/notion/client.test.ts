import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NotionConfigError } from '@/lib/cms/notion/errors'
import { notionRequest } from '@/lib/cms/notion/client'

describe('notionRequest', () => {
  beforeEach(() => {
    process.env.NOTION_API_TOKEN = 'test-token'
    process.env.NOTION_API_VERSION = '2025-09-03'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds a safe Notion API URL for allowed paths', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )

    await notionRequest('/pages/abc123', { method: 'GET', maxRetries: 0 })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.notion.com/v1/pages/abc123',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects absolute or cross-origin request paths', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      notionRequest('//evil.example.com/path', {
        method: 'GET',
        maxRetries: 0,
      }),
    ).rejects.toBeInstanceOf(NotionConfigError)

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
