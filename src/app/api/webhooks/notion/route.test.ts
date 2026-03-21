import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  syncPortfolioArticleProjection: vi.fn(),
  claimWebhookEvent: vi.fn(),
  completeWebhookEventClaim: vi.fn(),
  failWebhookEventClaim: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
}))

vi.mock('@/lib/cms/notion/projectionSync', () => ({
  syncPortfolioArticleProjection: mocks.syncPortfolioArticleProjection,
}))

vi.mock('@/lib/cms/notion/webhookEventLedger', () => ({
  claimWebhookEvent: mocks.claimWebhookEvent,
  completeWebhookEventClaim: mocks.completeWebhookEventClaim,
  failWebhookEventClaim: mocks.failWebhookEventClaim,
}))

import { POST } from './route'

function buildSyncResult() {
  return {
    ok: true,
    scanned: 1,
    eligible: 1,
    created: 0,
    updated: 1,
    archived: 0,
    skipped: 0,
    errors: [],
  }
}

describe('POST /api/webhooks/notion payload normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    delete process.env.NOTION_WEBHOOK_SECRET
    delete process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN
    delete process.env.NOTION_ENABLE_ARTICLE_PROJECTION_SYNC

    mocks.claimWebhookEvent.mockResolvedValue({
      action: 'claimed',
      ledgerPageId: 'ledger-1',
    })
    mocks.completeWebhookEventClaim.mockResolvedValue(undefined)
    mocks.failWebhookEventClaim.mockResolvedValue(undefined)
    mocks.syncPortfolioArticleProjection.mockResolvedValue(buildSyncResult())
  })

  afterEach(() => {
    delete process.env.NOTION_WEBHOOK_SECRET
    delete process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN
    delete process.env.NOTION_ENABLE_ARTICLE_PROJECTION_SYNC
  })

  it('processes envelope payloads with events[]', async () => {
    const request = new Request('http://localhost/api/webhooks/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: 'evt-envelope-1',
            type: 'page.content_updated',
            data: {
              id: 'page-from-data-id',
            },
          },
        ],
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.claimWebhookEvent).toHaveBeenCalledWith({
      eventId: 'evt-envelope-1',
      eventType: 'page.content_updated',
      entityId: 'page-from-data-id',
    })
    expect(mocks.syncPortfolioArticleProjection).toHaveBeenCalledWith({
      pageId: 'page-from-data-id',
    })
    expect(body.diagnostics).toMatchObject({
      receivedEvents: 1,
      processedEvents: 1,
      syncAttempts: 1,
      syncSuccesses: 1,
      syncFailures: 0,
    })
  })

  it('processes single-event payloads and falls back to entity.id', async () => {
    const request = new Request('http://localhost/api/webhooks/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'evt-single-1',
        type: 'page.content_updated',
        entity: {
          id: 'page-from-entity-id',
          type: 'page',
        },
        data: {
          parent: {
            id: 'parent-id',
            type: 'page',
          },
        },
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.claimWebhookEvent).toHaveBeenCalledWith({
      eventId: 'evt-single-1',
      eventType: 'page.content_updated',
      entityId: 'page-from-entity-id',
    })
    expect(mocks.syncPortfolioArticleProjection).toHaveBeenCalledWith({
      pageId: 'page-from-entity-id',
    })
    expect(body.diagnostics).toMatchObject({
      receivedEvents: 1,
      processedEvents: 1,
      syncAttempts: 1,
      syncSuccesses: 1,
      syncFailures: 0,
    })
  })

  it('coalesces duplicate page sync work within one webhook payload', async () => {
    mocks.claimWebhookEvent
      .mockResolvedValueOnce({
        action: 'claimed',
        ledgerPageId: 'ledger-a',
      })
      .mockResolvedValueOnce({
        action: 'claimed',
        ledgerPageId: 'ledger-b',
      })

    const request = new Request('http://localhost/api/webhooks/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: 'evt-batch-1',
            type: 'page.content_updated',
            data: {
              id: 'page-shared-id',
            },
          },
          {
            id: 'evt-batch-2',
            type: 'page.content_updated',
            data: {
              id: 'page-shared-id',
            },
          },
        ],
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.syncPortfolioArticleProjection).toHaveBeenCalledTimes(1)
    expect(mocks.syncPortfolioArticleProjection).toHaveBeenCalledWith({
      pageId: 'page-shared-id',
    })
    expect(mocks.completeWebhookEventClaim).toHaveBeenCalledTimes(2)
    expect(body.diagnostics).toMatchObject({
      receivedEvents: 2,
      processedEvents: 2,
      syncAttempts: 1,
      syncSuccesses: 1,
      syncFailures: 0,
    })
  })

  it('prefers a single full sync when payload includes data_source.content_updated', async () => {
    mocks.claimWebhookEvent
      .mockResolvedValueOnce({
        action: 'claimed',
        ledgerPageId: 'ledger-page-event',
      })
      .mockResolvedValueOnce({
        action: 'claimed',
        ledgerPageId: 'ledger-full-event',
      })

    const request = new Request('http://localhost/api/webhooks/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: 'evt-mixed-page',
            type: 'page.content_updated',
            data: {
              id: 'page-mixed-id',
            },
          },
          {
            id: 'evt-mixed-full',
            type: 'data_source.content_updated',
            entity: {
              id: '221be01e-1e06-8089-99b0-000b6415ee9e',
            },
          },
        ],
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.syncPortfolioArticleProjection).toHaveBeenCalledTimes(1)
    expect(mocks.syncPortfolioArticleProjection).toHaveBeenCalledWith(undefined)
    expect(mocks.completeWebhookEventClaim).toHaveBeenCalledTimes(2)
    expect(body.diagnostics).toMatchObject({
      receivedEvents: 2,
      processedEvents: 2,
      syncAttempts: 1,
      syncSuccesses: 1,
      syncFailures: 0,
    })
  })

  it('returns verified response for verification token handshake payloads', async () => {
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = 'verify-me'

    const request = new Request('http://localhost/api/webhooks/notion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verification_token: 'verify-me',
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      verified: true,
      reason: 'verification_token_handshake',
    })
    expect(mocks.claimWebhookEvent).not.toHaveBeenCalled()
    expect(mocks.syncPortfolioArticleProjection).not.toHaveBeenCalled()
    expect(mocks.completeWebhookEventClaim).not.toHaveBeenCalled()
    expect(mocks.failWebhookEventClaim).not.toHaveBeenCalled()
  })
})
