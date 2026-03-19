import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotionPage } from '@/lib/cms/notion/contracts'

const mocks = vi.hoisted(() => ({
  notionGetPage: vi.fn(),
  notionUpdatePage: vi.fn(),
  validatePublishSafeRequirements: vi.fn(),
}))

vi.mock('@/lib/cms/notion/client', async () => {
  const actual = await vi.importActual('@/lib/cms/notion/client')
  return {
    ...actual,
    notionGetPage: mocks.notionGetPage,
    notionUpdatePage: mocks.notionUpdatePage,
  }
})

vi.mock('@/lib/cms/notion/publishGate', async () => {
  const actual = await vi.importActual('@/lib/cms/notion/publishGate')
  return {
    ...actual,
    validatePublishSafeRequirements: mocks.validatePublishSafeRequirements,
  }
})

import { evaluateSourceArticlePublishGate } from './projectionSync'

function makeSourcePage(id = 'source-page-1'): NotionPage {
  return {
    object: 'page',
    id,
    properties: {
      Name: {
        type: 'title',
        title: [{ plain_text: 'SEO Test Article' }],
      },
      Slug: {
        type: 'rich_text',
        rich_text: [{ plain_text: 'seo-test-article' }],
      },
      'Content Type': {
        type: 'select',
        select: { name: 'Blog Post' },
      },
      'Content Status': {
        type: 'status',
        status: { name: 'Ready to Publish' },
      },
    },
  }
}

describe('evaluateSourceArticlePublishGate persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.notionGetPage.mockResolvedValue(makeSourcePage())
    mocks.notionUpdatePage.mockResolvedValue(undefined)
    mocks.validatePublishSafeRequirements.mockReturnValue([])
  })

  it('persists pass status, findings, and checked-at timestamp', async () => {
    const result = await evaluateSourceArticlePublishGate('source-page-1')

    expect(result).toMatchObject({
      ok: true,
      sourcePageId: 'source-page-1',
      reasons: [],
      seoGatePersisted: true,
    })
    expect(mocks.notionUpdatePage).toHaveBeenCalledTimes(1)

    const [, body] = mocks.notionUpdatePage.mock.calls[0]
    const properties = body.properties as Record<string, unknown>
    expect(properties['SEO Gate Status']).toEqual({
      select: { name: 'Pass' },
    })
    expect(properties['SEO Gate Findings']).toEqual({ rich_text: [] })

    const checkedAt = (
      properties['SEO Checked At'] as { date?: { start?: string } }
    )?.date?.start
    expect(typeof checkedAt).toBe('string')
    expect(Number.isNaN(Date.parse(checkedAt ?? ''))).toBe(false)
  })

  it('persists fail status and joined reasons when validation fails', async () => {
    mocks.validatePublishSafeRequirements.mockReturnValue([
      'Missing required Keywords',
      'Missing required Topics/Tags',
    ])

    const result = await evaluateSourceArticlePublishGate('source-page-1')

    expect(result).toMatchObject({
      ok: false,
      sourcePageId: 'source-page-1',
      reasons: ['Missing required Keywords', 'Missing required Topics/Tags'],
      seoGatePersisted: true,
    })

    const [, body] = mocks.notionUpdatePage.mock.calls[0]
    const properties = body.properties as Record<string, unknown>
    expect(properties['SEO Gate Status']).toEqual({
      select: { name: 'Fail' },
    })
    expect(properties['SEO Gate Findings']).toEqual({
      rich_text: [
        {
          type: 'text',
          text: {
            content: 'Missing required Keywords; Missing required Topics/Tags',
          },
        },
      ],
    })
  })

  it('returns non-blocking persistence error when Notion update fails', async () => {
    mocks.notionUpdatePage.mockRejectedValue(new Error('write failed'))

    const result = await evaluateSourceArticlePublishGate('source-page-1')

    expect(result).toMatchObject({
      ok: true,
      sourcePageId: 'source-page-1',
      seoGatePersisted: false,
      seoGatePersistError: 'write failed',
    })
  })
})
