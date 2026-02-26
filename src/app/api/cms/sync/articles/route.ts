import { NextResponse } from 'next/server'

import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

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

  const result = await syncPortfolioArticleProjection({ pageId: sourcePageId })

  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}
