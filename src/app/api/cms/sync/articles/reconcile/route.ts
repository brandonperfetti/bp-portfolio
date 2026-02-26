import { NextResponse } from 'next/server'

import { reconcilePortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
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

  const result = await reconcilePortfolioArticleProjection()
  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
