import { NextResponse } from 'next/server'

import { reconcilePortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!secret || body?.secret !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await reconcilePortfolioArticleProjection()
  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
