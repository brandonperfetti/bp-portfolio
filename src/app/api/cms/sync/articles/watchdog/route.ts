import { NextResponse } from 'next/server'

import { runWebhookLedgerWatchdog } from '@/lib/cms/notion/webhookEventLedger'
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

  const staleMinutes =
    typeof body?.staleMinutes === 'number' ? body.staleMinutes : undefined
  const limit = typeof body?.limit === 'number' ? body.limit : undefined

  const result = await runWebhookLedgerWatchdog({ staleMinutes, limit })
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}
