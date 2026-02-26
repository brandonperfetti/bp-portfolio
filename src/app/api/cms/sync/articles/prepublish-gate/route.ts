import { NextResponse } from 'next/server'

import { evaluateSourceArticlePublishGate } from '@/lib/cms/notion/projectionSync'

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!secret || body?.secret !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const sourcePageId =
    typeof body?.sourcePageId === 'string' && body.sourcePageId.trim().length > 0
      ? body.sourcePageId.trim()
      : ''

  if (!sourcePageId) {
    return NextResponse.json(
      { ok: false, error: 'sourcePageId is required' },
      { status: 400 },
    )
  }

  const result = await evaluateSourceArticlePublishGate(sourcePageId)
  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
