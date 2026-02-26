import { NextResponse } from 'next/server'

import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Server misconfiguration: CMS_REVALIDATE_SECRET missing',
      },
      { status: 500 },
    )
  }

  if (!isValidSecret(body?.secret, secret)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const sourcePageId =
    typeof body?.sourcePageId === 'string' &&
    body.sourcePageId.trim().length > 0
      ? body.sourcePageId.trim()
      : undefined

  let result
  try {
    result = await syncPortfolioArticleProjection({ pageId: sourcePageId })
  } catch (error) {
    console.error('[cms:sync:articles] projection sync failed', {
      sourcePageId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}
