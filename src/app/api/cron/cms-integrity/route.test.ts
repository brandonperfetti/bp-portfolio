import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runProjectionCronAutomation: vi.fn(),
  logAutomationErrorToNotion: vi.fn(),
  revalidateArticleSurfaces: vi.fn(),
}))

vi.mock('@/lib/cms/notion/cronAutomation', () => ({
  runProjectionCronAutomation: mocks.runProjectionCronAutomation,
}))

vi.mock('@/lib/cms/notion/automationErrorLog', () => ({
  logAutomationErrorToNotion: mocks.logAutomationErrorToNotion,
}))

vi.mock('../_revalidate', () => ({
  revalidateArticleSurfaces: mocks.revalidateArticleSurfaces,
}))

import { GET } from './route'

function buildRequest(url: string, userAgent = 'vercel-cron/1.0') {
  return new Request(url, {
    method: 'GET',
    headers: {
      Authorization: 'Bearer test-cron-secret',
      'User-Agent': userAgent,
    },
  })
}

describe('GET /api/cron/cms-integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    delete process.env.CMS_REVALIDATE_SECRET
    delete process.env.CMS_INTEGRITY_FORCE_MODE
    delete process.env.CMS_INTEGRITY_DEEP_RUN_OFFSET
    mocks.runProjectionCronAutomation.mockResolvedValue({
      ok: true,
      startedAt: '2026-03-14T00:00:00.000Z',
      errors: [],
    })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.CMS_REVALIDATE_SECRET
    delete process.env.CMS_INTEGRITY_FORCE_MODE
    delete process.env.CMS_INTEGRITY_DEEP_RUN_INTERVAL
    delete process.env.CMS_INTEGRITY_DEEP_RUN_OFFSET
    vi.restoreAllMocks()
  })

  it('uses incremental mode for routine vercel cron runs', async () => {
    process.env.CMS_INTEGRITY_DEEP_RUN_INTERVAL = '2'
    vi.spyOn(Date, 'now').mockReturnValue(10 * 60 * 1000)

    const response = await GET(
      buildRequest('http://localhost/api/cron/cms-integrity'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mode).toBe('incremental')
    expect(mocks.runProjectionCronAutomation).toHaveBeenCalledWith({
      includeQualityGate: false,
      includeReconcile: false,
      includeWebhookWatchdog: false,
    })
  })

  it('returns 401 for unauthorized requests', async () => {
    const request = new Request('http://localhost/api/cron/cms-integrity', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer wrong-secret',
        'User-Agent': 'vercel-cron/1.0',
      },
    })

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toMatchObject({
      ok: false,
      error: 'Unauthorized',
    })
    expect(mocks.runProjectionCronAutomation).not.toHaveBeenCalled()
  })

  it('respects explicit mode=full query override', async () => {
    process.env.CMS_INTEGRITY_DEEP_RUN_INTERVAL = '999'
    vi.spyOn(Date, 'now').mockReturnValue(10 * 60 * 1000)

    const response = await GET(
      buildRequest('http://localhost/api/cron/cms-integrity?mode=full'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mode).toBe('full')
    expect(mocks.runProjectionCronAutomation).toHaveBeenCalledWith({
      includeQualityGate: true,
      includeReconcile: true,
      includeWebhookWatchdog: true,
    })
  })

  it('defaults to full mode for non-vercel user agents', async () => {
    process.env.CMS_INTEGRITY_DEEP_RUN_INTERVAL = '999'
    vi.spyOn(Date, 'now').mockReturnValue(10 * 60 * 1000)

    const response = await GET(
      buildRequest(
        'http://localhost/api/cron/cms-integrity',
        'Mozilla/5.0 local-manual-run',
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mode).toBe('full')
    expect(mocks.runProjectionCronAutomation).toHaveBeenCalledWith({
      includeQualityGate: true,
      includeReconcile: true,
      includeWebhookWatchdog: true,
    })
  })

  it('allows explicit full runs with deep=1', async () => {
    process.env.CMS_INTEGRITY_DEEP_RUN_INTERVAL = '999'
    vi.spyOn(Date, 'now').mockReturnValue(20 * 60 * 1000)

    const response = await GET(
      buildRequest('http://localhost/api/cron/cms-integrity?deep=1'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mode).toBe('full')
    expect(mocks.runProjectionCronAutomation).toHaveBeenCalledWith({
      includeQualityGate: true,
      includeReconcile: true,
      includeWebhookWatchdog: true,
    })
  })

  it('honors CMS_INTEGRITY_FORCE_MODE over query and user-agent', async () => {
    process.env.CMS_INTEGRITY_FORCE_MODE = 'incremental'

    const response = await GET(
      buildRequest(
        'http://localhost/api/cron/cms-integrity?mode=full&deep=1',
        'Mozilla/5.0 local-manual-run',
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mode).toBe('incremental')
    expect(mocks.runProjectionCronAutomation).toHaveBeenCalledWith({
      includeQualityGate: false,
      includeReconcile: false,
      includeWebhookWatchdog: false,
    })
  })
})
